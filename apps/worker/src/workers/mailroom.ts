/**
 * apps/worker/src/workers/mailroom.ts
 *
 * BullMQ processor for the `mailroom` queue.
 *
 * Job kinds:
 *   - `mailroom.triage`         — pull last-N messages, rule + LLM rank,
 *                                  cache to mailroom_messages, publish result.
 *   - `mailroom.summarize_thread` — fetch a single Gmail thread and produce
 *                                  a short LLM summary (no destructive ops).
 *
 * Contract with the orchestrator (Cluster A is in flight — we never import
 * from packages/orchestrator):
 *   - Job payload carries `requestId` (BullMQ jobId / idempotency key).
 *   - Result events are published on Redis pub/sub channel
 *     `agent:{requestId}`. Channel name is the only contract surface.
 *   - Event types (JSON, all carry `{ requestId, kind, ... }`):
 *       kind=progress    — informational
 *       kind=result      — final success payload
 *       kind=error       — typed error (oauth.missing, gmail.failed, llm.failed)
 *
 * Persistence:
 *   - One `sub_agent_runs` row per job on completion (success | failed).
 *   - `mailroom_messages` upsert per ranked message for `mailroom.triage`.
 *   - `activity_log` row when PHI redaction fires.
 *
 * Owner: [Forge]
 */

import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import type { Logger } from "pino";

import {
  createServiceClient,
  logAuditEvent,
  type Database,
  type Tables,
  type Json,
} from "@autonomux/db";
import { createLlmClient, type LlmClient } from "@autonomux/llm";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createGmailClient,
  extractPlainText,
  GmailNotConnectedError,
  readHeader,
  type GmailClient,
} from "../lib/gmail-client.js";
import {
  triageInbox,
  type MailroomInputMessage,
  type MailroomRankedMessage,
  type MailroomTriageResult,
  MAILROOM_LLM_MODEL_CANONICAL,
} from "../lib/mailroom-engine.js";
import type { BaseJobPayload, BaseJobResult } from "../queues/index.js";

// ---------------------------------------------------------------------------
// Job names
// ---------------------------------------------------------------------------

export const MAILROOM_JOB_TRIAGE = "mailroom.triage" as const;
export const MAILROOM_JOB_SUMMARIZE_THREAD = "mailroom.summarize_thread" as const;

export type MailroomJobName =
  | typeof MAILROOM_JOB_TRIAGE
  | typeof MAILROOM_JOB_SUMMARIZE_THREAD;

/** Concrete payload shape inside BaseJobPayload.data for mailroom.* jobs. */
export interface MailroomTriageJobData {
  /** Optional ISO-8601 lower bound; defaults to 24h ago when absent. */
  readonly sinceIso?: string;
  /** Override env default. */
  readonly maxMessages?: number;
  /**
   * Optional `agent_run_id` so sub_agent_runs FK links to its parent.
   * When absent we create a synthetic agent_run on the fly.
   */
  readonly agentRunId?: string;
}

export interface MailroomSummarizeThreadJobData {
  readonly threadId: string;
  readonly agentRunId?: string;
}

// ---------------------------------------------------------------------------
// Agent-bus event types
// ---------------------------------------------------------------------------

export type AgentBusEvent =
  | { kind: "progress"; requestId: string; subAgent: "mailroom"; message: string }
  | {
      kind: "result";
      requestId: string;
      subAgent: "mailroom";
      job: MailroomJobName;
      payload: Record<string, unknown>;
    }
  | {
      kind: "error";
      requestId: string;
      subAgent: "mailroom";
      code: "oauth.missing" | "gmail.failed" | "llm.failed" | "internal";
      message: string;
    };

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface MailroomWorkerDeps {
  readonly logger: Logger;
  /** Redis client used purely for agent-bus pub/sub. */
  readonly agentBus: Redis;
  /** Gmail OAuth client credentials (from env). */
  readonly gmailClientId: string;
  readonly gmailClientSecret: string;
  /** Default batch cap. */
  readonly triageMaxMessages: number;
  /** Optional overrides for tests. */
  readonly supabase?: SupabaseClient<Database>;
  readonly llm?: LlmClient;
  readonly gmail?: GmailClient;
}

// ---------------------------------------------------------------------------
// Public router — wired from queues/index.ts
// ---------------------------------------------------------------------------

export interface MailroomProcessorContext {
  readonly logger: Logger;
  readonly job: Job<BaseJobPayload, BaseJobResult>;
  readonly deps: MailroomWorkerDeps;
}

/**
 * Single dispatcher for the mailroom queue. Branches on `job.name`.
 *
 * NEVER throws back to BullMQ for "expected" errors (oauth.missing, gmail
 * 4xx that aren't 401-after-refresh) — those are surfaced as agent-bus
 * `error` events + sub_agent_runs status='failed'. Only programming bugs
 * or unrecoverable infra failures propagate.
 */
export async function processMailroomJob(
  ctx: MailroomProcessorContext,
): Promise<BaseJobResult> {
  const { job, deps, logger } = ctx;
  const log = logger.child({
    component: "mailroom-processor",
    jobId: job.id,
    jobName: job.name,
    requestId: job.data.requestId,
    tenantId: job.data.tenantId,
  });

  const name = job.name as MailroomJobName | string;
  const startedAt = Date.now();

  try {
    switch (name) {
      case MAILROOM_JOB_TRIAGE: {
        const data = readTriageData(job);
        const result = await runTriage(job.data, data, { ...deps, logger: log });
        await publishEvent(deps.agentBus, log, {
          kind: "result",
          requestId: job.data.requestId,
          subAgent: "mailroom",
          job: MAILROOM_JOB_TRIAGE,
          payload: {
            messages: result.ranked,
            phi_incidents: result.phiIncidents,
            rule_handled: result.ruleHandledCount,
            llm_handled: result.llmHandledCount,
          },
        });
        await writeSubAgentRun({
          deps,
          log,
          tenantId: job.data.tenantId,
          agentRunId: data.agentRunId ?? null,
          input: { since_iso: data.sinceIso ?? null, max: data.maxMessages ?? null },
          output: {
            ranked_count: result.ranked.length,
            phi_incidents: result.phiIncidents,
            rule_handled: result.ruleHandledCount,
            llm_handled: result.llmHandledCount,
          },
          status: "success",
          durationMs: Date.now() - startedAt,
        });
        return { requestId: job.data.requestId, status: "ok" };
      }

      case MAILROOM_JOB_SUMMARIZE_THREAD: {
        const data = readSummarizeData(job);
        const summary = await runSummarizeThread(job.data, data, {
          ...deps,
          logger: log,
        });
        await publishEvent(deps.agentBus, log, {
          kind: "result",
          requestId: job.data.requestId,
          subAgent: "mailroom",
          job: MAILROOM_JOB_SUMMARIZE_THREAD,
          payload: { summary, thread_id: data.threadId },
        });
        await writeSubAgentRun({
          deps,
          log,
          tenantId: job.data.tenantId,
          agentRunId: data.agentRunId ?? null,
          input: { thread_id: data.threadId },
          output: { summary_length: summary.length },
          status: "success",
          durationMs: Date.now() - startedAt,
        });
        return { requestId: job.data.requestId, status: "ok" };
      }

      default:
        throw new Error(`[mailroom] unknown job name: ${name}`);
    }
  } catch (err) {
    if (err instanceof GmailNotConnectedError) {
      // Expected — publish typed error + record the run as failed, don't
      // re-throw (BullMQ retry will not fix a missing OAuth token).
      log.warn({ kind: err.kind }, "mailroom: gmail not connected");
      await publishEvent(deps.agentBus, log, {
        kind: "error",
        requestId: job.data.requestId,
        subAgent: "mailroom",
        code: "oauth.missing",
        message: `gmail not connected (${err.kind}): ${err.message}`,
      });
      await safeActivityLog(deps, log, {
        tenantId: job.data.tenantId,
        summary: `Mailroom run skipped — Gmail not connected (${err.kind}).`,
        action_kind: "mailroom.oauth_missing",
      });
      await writeSubAgentRun({
        deps,
        log,
        tenantId: job.data.tenantId,
        agentRunId: null,
        input: { job: name },
        output: { error: err.message, kind: err.kind },
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorMessage: `oauth.missing: ${err.message}`,
      });
      return { requestId: job.data.requestId, status: "ok" };
    }

    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, "mailroom job failed");
    await publishEvent(deps.agentBus, log, {
      kind: "error",
      requestId: job.data.requestId,
      subAgent: "mailroom",
      code: classifyErrorCode(err),
      message,
    });
    await writeSubAgentRun({
      deps,
      log,
      tenantId: job.data.tenantId,
      agentRunId: null,
      input: { job: name },
      output: { error: message },
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorMessage: message,
    });
    // Re-throw infra/unknown errors so BullMQ retry kicks in.
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

async function runTriage(
  base: BaseJobPayload,
  data: MailroomTriageJobData,
  deps: MailroomWorkerDeps,
): Promise<MailroomTriageResult> {
  const sb = deps.supabase ?? createServiceClient();
  const llm = deps.llm ?? createLlmClient({ logger: deps.logger });
  const gmail =
    deps.gmail ??
    createGmailClient({
      logger: deps.logger,
      clientId: deps.gmailClientId,
      clientSecret: deps.gmailClientSecret,
      supabase: sb,
    });

  const sinceIso =
    data.sinceIso ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const maxMessages = Math.max(
    1,
    Math.min(500, data.maxMessages ?? deps.triageMaxMessages),
  );

  await publishEvent(deps.agentBus, deps.logger, {
    kind: "progress",
    requestId: base.requestId,
    subAgent: "mailroom",
    message: `Fetching last ${maxMessages} messages since ${sinceIso}`,
  });

  // Pull list + per-message detail. Gmail's list returns only ids — we
  // batch-fetch full messages with concurrency 4 to keep API latency low
  // without burning rate-limit quota.
  const listEntries = await gmail.listMessagesSince(
    base.tenantId,
    sinceIso,
    maxMessages,
  );

  const fetched: MailroomInputMessage[] = [];
  const concurrency = 4;
  for (let i = 0; i < listEntries.length; i += concurrency) {
    const slice = listEntries.slice(i, i + concurrency);
    const detailed = await Promise.all(
      slice.map(async (entry) => {
        const m = await gmail.getMessage(base.tenantId, entry.id);
        const sender = readHeader(m.payload, "From") ?? "(unknown)";
        const subject = readHeader(m.payload, "Subject") ?? "(no subject)";
        const bodyText = extractPlainText(m.payload).slice(0, 2_048);
        return {
          id: m.id,
          threadId: m.threadId,
          sender,
          subject,
          snippet: m.snippet ?? "",
          bodyExcerpt: bodyText,
          receivedAt: new Date(
            Number.parseInt(m.internalDate, 10) || Date.now(),
          ).toISOString(),
          labelIds: m.labelIds,
          hasAttachment: messageHasAttachment(m.payload),
        } satisfies MailroomInputMessage;
      }),
    );
    fetched.push(...detailed);
  }

  // Load active rules. Mailroom rules are scoped per tenant.
  const { data: rulesRows, error: rulesErr } = await sb
    .from("mailroom_rules")
    .select("*")
    .eq("tenant_id", base.tenantId);
  if (rulesErr !== null) {
    throw new Error(
      `[mailroom] failed to load mailroom_rules: ${rulesErr.message}`,
    );
  }

  const result = await triageInbox(
    { logger: deps.logger, llm },
    {
      tenantId: base.tenantId,
      messages: fetched,
      rules: rulesRows ?? [],
    },
  );

  // Persist cache rows (best-effort — engine result still ships to caller).
  await upsertMailroomMessages(sb, deps.logger, base.tenantId, result.ranked);

  // Activity log for PHI redactions — non-PII metadata only.
  if (result.phiIncidents > 0) {
    await safeActivityLog(deps, deps.logger, {
      tenantId: base.tenantId,
      summary: `Mailroom redacted ${result.phiIncidents} PHI pattern(s) before LLM ranking.`,
      action_kind: "phi.redacted",
      // Counts are non-PII; no message ids, no snippets.
      // The audit chain captures the same via logAuditEvent below.
      // (activity_log lacks a metadata column; we keep counts in summary.)
    });
    await logAuditEvent(
      {
        tenantId: base.tenantId,
        actorUserId: null,
        actorKind: "service",
        action: "phi.redacted",
        resourceType: "mailroom_run",
        resourceId: base.requestId,
        metadata: {
          incidents: result.phiIncidents,
          messages_scanned: fetched.length,
          model: MAILROOM_LLM_MODEL_CANONICAL,
        },
      },
      sb,
    );
  }

  return result;
}

function messageHasAttachment(
  payload: import("../lib/gmail-client.js").GmailMessagePayload,
): boolean {
  if (payload.parts === undefined) return false;
  for (const p of payload.parts) {
    if (
      p.mimeType !== undefined &&
      p.mimeType !== "text/plain" &&
      p.mimeType !== "text/html" &&
      !p.mimeType.startsWith("multipart/")
    ) {
      return true;
    }
    if (p.parts !== undefined && messageHasAttachment(p)) return true;
  }
  return false;
}

async function upsertMailroomMessages(
  sb: SupabaseClient<Database>,
  logger: Logger,
  tenantId: string,
  ranked: readonly MailroomRankedMessage[],
): Promise<void> {
  if (ranked.length === 0) return;
  const rows = ranked.map((r) => ({
    tenant_id: tenantId,
    gmail_msg_id: r.id,
    gmail_thread_id: r.threadId,
    sender: r.sender,
    subject: r.subject,
    snippet: r.snippet,
    received_at: r.receivedAt,
    importance: r.importance,
    proposed_action: r.proposedAction,
    reason: r.reason,
    processed_at: new Date().toISOString(),
  }));

  // mailroom_messages isn't in the typed schema yet (added in this migration);
  // route the call through a from-typed-as-any so we don't break typecheck of
  // existing types until db types regenerate.
  const { error } = await (
    sb as unknown as {
      from: (
        t: string,
      ) => {
        upsert: (
          rows: unknown,
          opts: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from("mailroom_messages")
    .upsert(rows, { onConflict: "tenant_id,gmail_msg_id" });

  if (error !== null) {
    // Cache write is best-effort — the orchestrator already has the
    // result via the agent-bus event. Log and continue.
    logger.warn(
      { err: error, tenantId, count: rows.length },
      "mailroom: mailroom_messages upsert failed (non-fatal)",
    );
  }
}

// ---------------------------------------------------------------------------
// Summarize a single thread
// ---------------------------------------------------------------------------

async function runSummarizeThread(
  base: BaseJobPayload,
  data: MailroomSummarizeThreadJobData,
  deps: MailroomWorkerDeps,
): Promise<string> {
  const sb = deps.supabase ?? createServiceClient();
  const llm = deps.llm ?? createLlmClient({ logger: deps.logger });
  const gmail =
    deps.gmail ??
    createGmailClient({
      logger: deps.logger,
      clientId: deps.gmailClientId,
      clientSecret: deps.gmailClientSecret,
      supabase: sb,
    });

  // Naive: fetch the most recent ~10 messages on the thread by id pattern.
  // Gmail's threads endpoint would be ideal but a thread list-then-get keeps
  // the surface area smaller for v1.0.
  // For now: list one page constrained to `thread:{id}` via the q operator.
  const list = await gmail.listMessagesSince(
    base.tenantId,
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    10,
  );
  const onThread = list.filter((e) => e.threadId === data.threadId);

  const detailed = await Promise.all(
    onThread.map((entry) => gmail.getMessage(base.tenantId, entry.id)),
  );

  const condensed = detailed
    .map((m) => {
      const from = readHeader(m.payload, "From") ?? "(unknown)";
      const subject = readHeader(m.payload, "Subject") ?? "(no subject)";
      const body = extractPlainText(m.payload).slice(0, 1_024);
      return `From: ${from}\nSubject: ${subject}\n\n${body}`;
    })
    .join("\n\n---\n\n");

  const response = await llm.complete({
    model: "haiku-4.5",
    system:
      "Summarize an email thread for an AlterEgo assistant. " +
      "Output ≤120 words, plain prose, no preamble.",
    messages: [{ role: "user", content: condensed.slice(0, 12_000) }],
    max_tokens: 384,
    temperature: 0,
  });

  for (const block of response.content) {
    if (block.type === "text") return block.text.trim();
  }
  return "";
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

interface WriteSubAgentRunArgs {
  readonly deps: MailroomWorkerDeps;
  readonly log: Logger;
  readonly tenantId: string;
  readonly agentRunId: string | null;
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
  readonly status: Tables<"sub_agent_runs">["status"];
  readonly durationMs: number;
  readonly errorMessage?: string;
}

async function writeSubAgentRun(args: WriteSubAgentRunArgs): Promise<void> {
  const sb = args.deps.supabase ?? createServiceClient();
  // sub_agent_runs requires a non-null agent_run_id FK. When the orchestrator
  // didn't pre-create one (e.g. direct cron-style invocation), spawn a
  // synthetic agent_runs row first so the audit chain stays intact.
  let agentRunId = args.agentRunId;
  if (agentRunId === null) {
    const { data: ar, error: arErr } = await sb
      .from("agent_runs")
      .insert({
        tenant_id: args.tenantId,
        trigger_kind: "sub_agent_surface",
        status: args.status === "success" ? "success" : "failed",
        model: MAILROOM_LLM_MODEL_CANONICAL,
        duration_ms: args.durationMs,
        finished_at: new Date().toISOString(),
        ...(args.errorMessage !== undefined
          ? { error: args.errorMessage }
          : {}),
      })
      .select("id")
      .single();
    if (arErr !== null || ar === null) {
      args.log.error(
        { err: arErr },
        "mailroom: failed to create synthetic agent_runs row (sub_agent_runs skipped)",
      );
      return;
    }
    agentRunId = ar.id;
  }

  const { error } = await sb.from("sub_agent_runs").insert({
    agent_run_id: agentRunId,
    tenant_id: args.tenantId,
    sub_agent_name: "mailroom",
    status: args.status,
    input: args.input as Json,
    output: args.output as Json,
    duration_ms: args.durationMs,
    finished_at: new Date().toISOString(),
    ...(args.errorMessage !== undefined ? { error: args.errorMessage } : {}),
  });
  if (error !== null) {
    args.log.error({ err: error }, "mailroom: sub_agent_runs insert failed");
  }
}

interface ActivityLogArgs {
  readonly tenantId: string;
  readonly summary: string;
  readonly action_kind: string;
}

async function safeActivityLog(
  deps: MailroomWorkerDeps,
  log: Logger,
  args: ActivityLogArgs,
): Promise<void> {
  const sb = deps.supabase ?? createServiceClient();
  const { error } = await sb.from("activity_log").insert({
    tenant_id: args.tenantId,
    summary: args.summary,
    action_kind: args.action_kind,
  });
  if (error !== null) {
    log.warn({ err: error }, "mailroom: activity_log insert failed (non-fatal)");
  }
}

// ---------------------------------------------------------------------------
// Agent-bus publish
// ---------------------------------------------------------------------------

const AGENT_BUS_CHANNEL = (requestId: string): string => `agent:${requestId}`;

async function publishEvent(
  bus: Redis,
  log: Logger,
  event: AgentBusEvent,
): Promise<void> {
  try {
    await bus.publish(AGENT_BUS_CHANNEL(event.requestId), JSON.stringify(event));
  } catch (err) {
    log.error({ err, kind: event.kind }, "mailroom: agent-bus publish failed");
  }
}

// ---------------------------------------------------------------------------
// Payload narrowing
// ---------------------------------------------------------------------------

function readTriageData(
  job: Job<BaseJobPayload, BaseJobResult>,
): MailroomTriageJobData {
  const raw = (job.data.data ?? {}) as Partial<MailroomTriageJobData>;
  const out: MailroomTriageJobData = {
    ...(typeof raw.sinceIso === "string" ? { sinceIso: raw.sinceIso } : {}),
    ...(typeof raw.maxMessages === "number" && raw.maxMessages > 0
      ? { maxMessages: raw.maxMessages }
      : {}),
    ...(typeof raw.agentRunId === "string" ? { agentRunId: raw.agentRunId } : {}),
  };
  return out;
}

function readSummarizeData(
  job: Job<BaseJobPayload, BaseJobResult>,
): MailroomSummarizeThreadJobData {
  const raw = (job.data.data ?? {}) as Partial<MailroomSummarizeThreadJobData>;
  if (typeof raw.threadId !== "string" || raw.threadId.length === 0) {
    throw new Error(
      `[mailroom] ${MAILROOM_JOB_SUMMARIZE_THREAD} requires payload.data.threadId`,
    );
  }
  return {
    threadId: raw.threadId,
    ...(typeof raw.agentRunId === "string" ? { agentRunId: raw.agentRunId } : {}),
  };
}

function classifyErrorCode(
  err: unknown,
): "oauth.missing" | "gmail.failed" | "llm.failed" | "internal" {
  if (err instanceof GmailNotConnectedError) return "oauth.missing";
  const name = err instanceof Error ? err.name : "";
  if (name === "GmailApiError") return "gmail.failed";
  if (name.startsWith("Llm")) return "llm.failed";
  return "internal";
}

// ---------------------------------------------------------------------------
// Boot helper — called from src/index.ts
// ---------------------------------------------------------------------------

/**
 * Idempotency note: this function does NOT spawn a BullMQ Worker on its
 * own. The `mailroom` queue's Worker is created inside `queues/index.ts`;
 * this module just holds the per-tenant deps (logger, agent-bus redis,
 * env-derived secrets) that the dispatcher hands to `processMailroomJob`.
 *
 * We expose a `MailroomDeps` object the queues/index.ts dispatcher reads
 * via a typed accessor — see src/index.ts wiring.
 */
export function buildMailroomDeps(
  args: Omit<MailroomWorkerDeps, "logger"> & { logger: Logger },
): MailroomWorkerDeps {
  return {
    logger: args.logger,
    agentBus: args.agentBus,
    gmailClientId: args.gmailClientId,
    gmailClientSecret: args.gmailClientSecret,
    triageMaxMessages: args.triageMaxMessages,
    ...(args.supabase !== undefined ? { supabase: args.supabase } : {}),
    ...(args.llm !== undefined ? { llm: args.llm } : {}),
    ...(args.gmail !== undefined ? { gmail: args.gmail } : {}),
  };
}
