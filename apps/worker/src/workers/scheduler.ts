/**
 * apps/worker/src/workers/scheduler.ts
 *
 * BullMQ processor for the `scheduler` queue.
 *
 * Job kinds:
 *   - `scheduler.read_today`  — pull events from "now" to next 24h in the
 *                                user's primary-calendar timezone, normalize +
 *                                conflict-check, cache, publish result.
 *   - `scheduler.read_range`  — same flow over a caller-supplied [start, end)
 *                                window (max 14 days).
 *
 * Contract with the orchestrator (Cluster A is in flight — we never import
 * from packages/orchestrator):
 *   - Job payload carries `requestId` (BullMQ jobId / idempotency key).
 *   - Result events are published on Redis pub/sub channel
 *     `agent:{requestId}`.
 *   - Event types (JSON, all carry `{ requestId, kind, ... }`):
 *       kind=progress    — informational
 *       kind=result      — final success payload (SchedulerResult)
 *       kind=error       — typed error (oauth.missing, scheduler.failed,
 *                          internal)
 *
 * Persistence:
 *   - One `sub_agent_runs` row per job on completion (success | failed).
 *   - `scheduler_events` upsert per normalized event.
 *   - `activity_log` row when the run is skipped due to missing OAuth.
 *
 * Owner: [Forge]
 */

import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import type { Logger } from "pino";

import {
  createServiceClient,
  type Database,
  type Tables,
  type Json,
} from "@autonomux/db";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createGcalClient,
  GcalNotConnectedError,
  type GcalClient,
} from "../lib/gcal-client.js";
import {
  readSchedule,
  SCHEDULER_SUB_AGENT_NAME,
  type SchedulerEvent,
  type SchedulerResult,
} from "../lib/scheduler-engine.js";
import type { BaseJobPayload, BaseJobResult } from "../queues/index.js";

// ---------------------------------------------------------------------------
// Job names
// ---------------------------------------------------------------------------

export const SCHEDULER_JOB_READ_TODAY = "scheduler.read_today" as const;
export const SCHEDULER_JOB_READ_RANGE = "scheduler.read_range" as const;

export type SchedulerJobName =
  | typeof SCHEDULER_JOB_READ_TODAY
  | typeof SCHEDULER_JOB_READ_RANGE;

/** Concrete payload shape inside BaseJobPayload.data for scheduler.* jobs. */
export interface SchedulerReadTodayJobData {
  /**
   * Optional `agent_run_id` so sub_agent_runs FK links to its parent.
   * When absent we create a synthetic agent_run on the fly.
   */
  readonly agentRunId?: string;
}

export interface SchedulerReadRangeJobData {
  readonly startIso: string;
  readonly endIso: string;
  readonly agentRunId?: string;
}

// ---------------------------------------------------------------------------
// Agent-bus event types
// ---------------------------------------------------------------------------

export type AgentBusEvent =
  | {
      kind: "progress";
      requestId: string;
      subAgent: "scheduler";
      message: string;
    }
  | {
      kind: "result";
      requestId: string;
      subAgent: "scheduler";
      job: SchedulerJobName;
      payload: Record<string, unknown>;
    }
  | {
      kind: "error";
      requestId: string;
      subAgent: "scheduler";
      code: "oauth.missing" | "scheduler.failed" | "internal";
      message: string;
    };

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface SchedulerWorkerDeps {
  readonly logger: Logger;
  /** Redis client used purely for agent-bus pub/sub. */
  readonly agentBus: Redis;
  /** Google Calendar OAuth client credentials (from env). */
  readonly gcalClientId: string;
  readonly gcalClientSecret: string;
  /** Default max events pulled per "read today" job. */
  readonly readTodayMaxEvents: number;
  /** Default max events pulled per "read range" job. */
  readonly readRangeMaxEvents: number;
  /** Optional overrides for tests. */
  readonly supabase?: SupabaseClient<Database>;
  readonly gcal?: GcalClient;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on read_range window — anything longer is rejected at dispatch. */
const READ_RANGE_MAX_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** Today window: 24h after `now`. */
const READ_TODAY_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public router — wired from queues/index.ts
// ---------------------------------------------------------------------------

export interface SchedulerProcessorContext {
  readonly logger: Logger;
  readonly job: Job<BaseJobPayload, BaseJobResult>;
  readonly deps: SchedulerWorkerDeps;
}

/**
 * Single dispatcher for the scheduler queue. Branches on `job.name`.
 *
 * NEVER throws back to BullMQ for "expected" errors (oauth.missing, gcal
 * 4xx that aren't 401-after-refresh) — those are surfaced as agent-bus
 * `error` events + sub_agent_runs status='failed'. Only programming bugs
 * or unrecoverable infra failures propagate.
 */
export async function processSchedulerJob(
  ctx: SchedulerProcessorContext,
): Promise<BaseJobResult> {
  const { job, deps, logger } = ctx;
  const log = logger.child({
    component: "scheduler-processor",
    jobId: job.id,
    jobName: job.name,
    requestId: job.data.requestId,
    tenantId: job.data.tenantId,
  });

  const name = job.name as SchedulerJobName | string;
  const startedAt = Date.now();

  try {
    switch (name) {
      case SCHEDULER_JOB_READ_TODAY: {
        const data = readReadTodayData(job);
        const result = await runReadToday(job.data, data, {
          ...deps,
          logger: log,
        });
        await publishEvent(deps.agentBus, log, {
          kind: "result",
          requestId: job.data.requestId,
          subAgent: "scheduler",
          job: SCHEDULER_JOB_READ_TODAY,
          payload: resultToBusPayload(result),
        });
        await writeSubAgentRun({
          deps,
          log,
          tenantId: job.data.tenantId,
          agentRunId: data.agentRunId ?? null,
          input: { kind: "read_today" },
          output: {
            event_count: result.events.length,
            conflict_count: result.conflict_count,
            range: result.range,
          },
          status: "success",
          durationMs: Date.now() - startedAt,
        });
        return { requestId: job.data.requestId, status: "ok" };
      }

      case SCHEDULER_JOB_READ_RANGE: {
        const data = readReadRangeData(job);
        const result = await runReadRange(job.data, data, {
          ...deps,
          logger: log,
        });
        await publishEvent(deps.agentBus, log, {
          kind: "result",
          requestId: job.data.requestId,
          subAgent: "scheduler",
          job: SCHEDULER_JOB_READ_RANGE,
          payload: resultToBusPayload(result),
        });
        await writeSubAgentRun({
          deps,
          log,
          tenantId: job.data.tenantId,
          agentRunId: data.agentRunId ?? null,
          input: { kind: "read_range", start_iso: data.startIso, end_iso: data.endIso },
          output: {
            event_count: result.events.length,
            conflict_count: result.conflict_count,
            range: result.range,
          },
          status: "success",
          durationMs: Date.now() - startedAt,
        });
        return { requestId: job.data.requestId, status: "ok" };
      }

      default:
        throw new Error(`[scheduler] unknown job name: ${name}`);
    }
  } catch (err) {
    if (err instanceof GcalNotConnectedError) {
      // Expected — publish typed error + record the run as failed, don't
      // re-throw (BullMQ retry will not fix a missing OAuth token).
      log.warn({ kind: err.kind }, "scheduler: gcal not connected");
      await publishEvent(deps.agentBus, log, {
        kind: "error",
        requestId: job.data.requestId,
        subAgent: "scheduler",
        code: "oauth.missing",
        message: `gcal not connected (${err.kind}): ${err.message}`,
      });
      await safeActivityLog(deps, log, {
        tenantId: job.data.tenantId,
        summary: `Scheduler run skipped — Google Calendar not connected (${err.kind}).`,
        action_kind: "scheduler.oauth_missing",
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
    log.error({ err }, "scheduler job failed");
    await publishEvent(deps.agentBus, log, {
      kind: "error",
      requestId: job.data.requestId,
      subAgent: "scheduler",
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
// Read "today"
// ---------------------------------------------------------------------------

async function runReadToday(
  base: BaseJobPayload,
  _data: SchedulerReadTodayJobData,
  deps: SchedulerWorkerDeps,
): Promise<SchedulerResult> {
  const sb = deps.supabase ?? createServiceClient();
  const gcal =
    deps.gcal ??
    createGcalClient({
      logger: deps.logger,
      clientId: deps.gcalClientId,
      clientSecret: deps.gcalClientSecret,
      supabase: sb,
    });

  // Resolve the primary calendar so we know the canonical id + timezone.
  // The TZ is informational (the engine uses absolute timestamps); the id is
  // what we pass to listEventsBetween and what we persist on cache rows.
  const cal = await gcal.listPrimaryCalendar(base.tenantId);

  const startIso = new Date().toISOString();
  const endIso = new Date(Date.now() + READ_TODAY_WINDOW_MS).toISOString();

  await publishEvent(deps.agentBus, deps.logger, {
    kind: "progress",
    requestId: base.requestId,
    subAgent: "scheduler",
    message: `Fetching events ${startIso} → ${endIso} (tz=${cal.timeZone})`,
  });

  const raw = await gcal.listEventsBetween(
    base.tenantId,
    cal.id,
    startIso,
    endIso,
    deps.readTodayMaxEvents,
  );

  const result = await readSchedule(
    { logger: deps.logger },
    {
      tenantId: base.tenantId,
      events: raw,
      rangeStartIso: startIso,
      rangeEndIso: endIso,
    },
  );

  await upsertSchedulerEvents(sb, deps.logger, base.tenantId, cal.id, result.events);
  return result;
}

// ---------------------------------------------------------------------------
// Read range
// ---------------------------------------------------------------------------

async function runReadRange(
  base: BaseJobPayload,
  data: SchedulerReadRangeJobData,
  deps: SchedulerWorkerDeps,
): Promise<SchedulerResult> {
  const startMs = Date.parse(data.startIso);
  const endMs = Date.parse(data.endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error(
      `[scheduler] read_range requires valid startIso + endIso (start=${data.startIso}, end=${data.endIso})`,
    );
  }
  if (endMs <= startMs) {
    throw new Error(
      `[scheduler] read_range endIso must be strictly after startIso (start=${data.startIso}, end=${data.endIso})`,
    );
  }
  if (endMs - startMs > READ_RANGE_MAX_WINDOW_MS) {
    throw new Error(
      `[scheduler] read_range window exceeds 14d cap (start=${data.startIso}, end=${data.endIso})`,
    );
  }

  const sb = deps.supabase ?? createServiceClient();
  const gcal =
    deps.gcal ??
    createGcalClient({
      logger: deps.logger,
      clientId: deps.gcalClientId,
      clientSecret: deps.gcalClientSecret,
      supabase: sb,
    });

  const cal = await gcal.listPrimaryCalendar(base.tenantId);

  await publishEvent(deps.agentBus, deps.logger, {
    kind: "progress",
    requestId: base.requestId,
    subAgent: "scheduler",
    message: `Fetching events ${data.startIso} → ${data.endIso} (tz=${cal.timeZone})`,
  });

  const raw = await gcal.listEventsBetween(
    base.tenantId,
    cal.id,
    data.startIso,
    data.endIso,
    deps.readRangeMaxEvents,
  );

  const result = await readSchedule(
    { logger: deps.logger },
    {
      tenantId: base.tenantId,
      events: raw,
      rangeStartIso: data.startIso,
      rangeEndIso: data.endIso,
    },
  );

  await upsertSchedulerEvents(sb, deps.logger, base.tenantId, cal.id, result.events);
  return result;
}

// ---------------------------------------------------------------------------
// Persistence — scheduler_events cache
// ---------------------------------------------------------------------------

async function upsertSchedulerEvents(
  sb: SupabaseClient<Database>,
  logger: Logger,
  tenantId: string,
  calendarId: string,
  events: readonly SchedulerEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const processedAt = new Date().toISOString();
  const rows = events.map((e) => ({
    tenant_id: tenantId,
    gcal_calendar_id: calendarId,
    gcal_event_id: e.id,
    summary: e.summary,
    location: e.location,
    start_at: e.start_at,
    end_at: e.end_at,
    is_all_day: e.is_all_day,
    status: "confirmed",
    organizer_email: e.organizer_email,
    is_self_organizer: e.is_self_organizer,
    attendee_count: e.attendees.length,
    has_conflict: e.has_conflict,
    conflict_with: e.conflict_with,
    html_link: e.html_link,
    processed_at: processedAt,
  }));

  // scheduler_events isn't in the typed schema yet (migration 0013); route
  // through an unknown-cast so we don't break typecheck of existing types
  // until db types regenerate.
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
    .from("scheduler_events")
    .upsert(rows, {
      onConflict: "tenant_id,gcal_calendar_id,gcal_event_id",
    });

  if (error !== null) {
    // Cache write is best-effort — the orchestrator already has the
    // result via the agent-bus event. Log and continue.
    logger.warn(
      { err: error, tenantId, count: rows.length },
      "scheduler: scheduler_events upsert failed (non-fatal)",
    );
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

interface WriteSubAgentRunArgs {
  readonly deps: SchedulerWorkerDeps;
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
        // Scheduler is non-LLM in v0; record the sub-agent name so the
        // run is still attributable in observability.
        model: SCHEDULER_SUB_AGENT_NAME,
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
        "scheduler: failed to create synthetic agent_runs row (sub_agent_runs skipped)",
      );
      return;
    }
    agentRunId = ar.id;
  }

  const { error } = await sb.from("sub_agent_runs").insert({
    agent_run_id: agentRunId,
    tenant_id: args.tenantId,
    sub_agent_name: SCHEDULER_SUB_AGENT_NAME,
    status: args.status,
    input: args.input as Json,
    output: args.output as Json,
    duration_ms: args.durationMs,
    finished_at: new Date().toISOString(),
    ...(args.errorMessage !== undefined ? { error: args.errorMessage } : {}),
  });
  if (error !== null) {
    args.log.error({ err: error }, "scheduler: sub_agent_runs insert failed");
  }
}

interface ActivityLogArgs {
  readonly tenantId: string;
  readonly summary: string;
  readonly action_kind: string;
}

async function safeActivityLog(
  deps: SchedulerWorkerDeps,
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
    log.warn(
      { err: error },
      "scheduler: activity_log insert failed (non-fatal)",
    );
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
    log.error(
      { err, kind: event.kind },
      "scheduler: agent-bus publish failed",
    );
  }
}

function resultToBusPayload(result: SchedulerResult): Record<string, unknown> {
  return {
    events: result.events,
    conflict_count: result.conflict_count,
    range: result.range,
  };
}

// ---------------------------------------------------------------------------
// Payload narrowing
// ---------------------------------------------------------------------------

function readReadTodayData(
  job: Job<BaseJobPayload, BaseJobResult>,
): SchedulerReadTodayJobData {
  const raw = (job.data.data ?? {}) as Partial<SchedulerReadTodayJobData>;
  return {
    ...(typeof raw.agentRunId === "string" ? { agentRunId: raw.agentRunId } : {}),
  };
}

function readReadRangeData(
  job: Job<BaseJobPayload, BaseJobResult>,
): SchedulerReadRangeJobData {
  const raw = (job.data.data ?? {}) as Partial<SchedulerReadRangeJobData>;
  if (typeof raw.startIso !== "string" || raw.startIso.length === 0) {
    throw new Error(
      `[scheduler] ${SCHEDULER_JOB_READ_RANGE} requires payload.data.startIso`,
    );
  }
  if (typeof raw.endIso !== "string" || raw.endIso.length === 0) {
    throw new Error(
      `[scheduler] ${SCHEDULER_JOB_READ_RANGE} requires payload.data.endIso`,
    );
  }
  return {
    startIso: raw.startIso,
    endIso: raw.endIso,
    ...(typeof raw.agentRunId === "string" ? { agentRunId: raw.agentRunId } : {}),
  };
}

function classifyErrorCode(
  err: unknown,
): "oauth.missing" | "scheduler.failed" | "internal" {
  if (err instanceof GcalNotConnectedError) return "oauth.missing";
  const name = err instanceof Error ? err.name : "";
  if (name === "GcalApiError") return "scheduler.failed";
  return "internal";
}

// ---------------------------------------------------------------------------
// Boot helper — called from src/index.ts
// ---------------------------------------------------------------------------

/**
 * Mirror of `buildMailroomDeps`. Returns the dependency bundle the
 * dispatcher hands to `processSchedulerJob`. The bundle is created once at
 * boot (src/index.ts) and shared across every job for the lifetime of the
 * worker process.
 */
export function buildSchedulerDeps(
  args: Omit<SchedulerWorkerDeps, "logger"> & { logger: Logger },
): SchedulerWorkerDeps {
  return {
    logger: args.logger,
    agentBus: args.agentBus,
    gcalClientId: args.gcalClientId,
    gcalClientSecret: args.gcalClientSecret,
    readTodayMaxEvents: args.readTodayMaxEvents,
    readRangeMaxEvents: args.readRangeMaxEvents,
    ...(args.supabase !== undefined ? { supabase: args.supabase } : {}),
    ...(args.gcal !== undefined ? { gcal: args.gcal } : {}),
  };
}
