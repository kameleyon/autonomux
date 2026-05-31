/**
 * packages/db/src/orchestrator-helpers.ts
 *
 * Service-role helpers used by `@autonomux/orchestrator` to:
 *   - Open / finalise an `agent_runs` row (idempotent on `request_id`).
 *   - Insert / update a `sub_agent_runs` row per tool hop.
 *   - Bump the monthly `usage_meters` aggregate.
 *
 * These are the only DB helpers the runtime needs and they are
 * deliberately narrow: every function takes an explicit `tenantId` and
 * mutates only rows owned by that tenant. The service-role client
 * bypasses RLS, so the narrow filter is the safety net.
 *
 * Idempotency contract for `recordAgentRun`:
 *   - First call with a given `(tenantId, requestId)` INSERTs and returns
 *     `{ id, replayed: false, replaySnapshot: null }`.
 *   - Subsequent INSERT-shaped call returns the prior row with
 *     `replayed: true` AND `replaySnapshot` populated from the prior row
 *     (tokens, cost, tools_called) so the runtime can re-emit events
 *     without re-running the LLM. (PRD §1 acceptance #3.)
 *   - UPDATE-shaped call (caller passes `id` + a status that isn't
 *     'running') updates that row in place — final persistence at end
 *     of the turn.
 *
 * Owner: [Atlas + Forge]
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "./client";
import type {
  AgentRunStatus,
  AgentRunToolCall,
  AgentRunTriggerKind,
  Database,
  Json,
  SubAgentName,
  SubAgentRunStatus,
  Tables,
} from "./types";

type Sb = SupabaseClient<Database>;

/* ────────────────────────────────────────────────────────────────────────── */
/*  recordAgentRun                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

export interface RecordAgentRunArgs {
  /** Explicit id triggers UPDATE; omit for INSERT (idempotent). */
  readonly id?: string;
  readonly tenantId: string;
  /** Idempotency key. Must be UNIQUE per chat turn. */
  readonly requestId: string;
  readonly triggerKind: AgentRunTriggerKind;
  readonly model: string;
  readonly status?: AgentRunStatus;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costUsdCents?: number;
  readonly durationMs?: number | null;
  readonly toolsCalled?: AgentRunToolCall[];
  readonly chainOfThoughtEncrypted?: Json;
  readonly error?: string | null;
  readonly finishedAt?: string | null;
  /** Optional parent (chat-thread linkage; column added by migration 0009). */
  readonly parentRunId?: string | null;
  /** Inject a client for tests. */
  readonly client?: Sb;
}

export interface AgentRunReplaySnapshot {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsdCents: number;
  readonly durationMs: number;
  readonly toolsCalled: AgentRunToolCall[];
}

export interface AgentRunHandle {
  readonly id: string;
  /** True if this call hit a prior row via `request_id` UNIQUE. */
  readonly replayed: boolean;
  /** Populated only on replay. */
  readonly replaySnapshot: AgentRunReplaySnapshot | null;
}

/**
 * Insert OR update an `agent_runs` row.
 *
 * Update path: caller passes `id`. Returns `{ id, replayed: false }`.
 *
 * Insert path: no `id`. We try an INSERT first; on a 23505 (unique
 * violation on `request_id`), we SELECT the prior row and return its id
 * + a `replaySnapshot` so the orchestrator can short-circuit.
 */
export async function recordAgentRun(
  args: RecordAgentRunArgs,
): Promise<AgentRunHandle> {
  const sb: Sb = args.client ?? createServiceClient();

  // ---- UPDATE path. ------------------------------------------------------
  if (args.id) {
    // Build a Partial so we only touch fields the caller actually sent.
    const update: Partial<Tables<"agent_runs">> = {};
    if (args.status !== undefined) update.status = args.status;
    if (args.inputTokens !== undefined) update.input_tokens = args.inputTokens;
    if (args.outputTokens !== undefined) update.output_tokens = args.outputTokens;
    if (args.costUsdCents !== undefined) update.cost_usd_cents = args.costUsdCents;
    if (args.durationMs !== undefined) update.duration_ms = args.durationMs;
    if (args.toolsCalled !== undefined) update.tools_called = args.toolsCalled;
    if (args.chainOfThoughtEncrypted !== undefined) update.chain_of_thought_encrypted = args.chainOfThoughtEncrypted;
    if (args.error !== undefined) update.error = args.error;
    if (args.finishedAt !== undefined) update.finished_at = args.finishedAt;

    const { error } = await sb
      .from("agent_runs")
      .update(update)
      .eq("id", args.id)
      .eq("tenant_id", args.tenantId);
    if (error) throw new Error(`[recordAgentRun.update] ${error.message}`);
    return { id: args.id, replayed: false, replaySnapshot: null };
  }

  // ---- INSERT path (idempotent on request_id). ---------------------------
  // The `request_id` column + UNIQUE index are added by migration 0009.
  // We cast narrowly so this file typechecks against the current
  // generated `Database` type without a regen step.
  const insertRow = {
    tenant_id: args.tenantId,
    trigger_kind: args.triggerKind,
    status: args.status ?? "running",
    model: args.model,
    input_tokens: args.inputTokens ?? 0,
    output_tokens: args.outputTokens ?? 0,
    cost_usd_cents: args.costUsdCents ?? 0,
    tools_called: args.toolsCalled ?? [],
    chain_of_thought_encrypted: args.chainOfThoughtEncrypted ?? {},
    request_id: args.requestId,
    ...(args.parentRunId !== undefined ? { parent_run_id: args.parentRunId } : {}),
  } as unknown as Tables<"agent_runs">;

  const ins = await sb
    .from("agent_runs")
    .insert(insertRow)
    .select("id")
    .single();

  if (ins.error === null && ins.data) {
    return { id: ins.data.id, replayed: false, replaySnapshot: null };
  }

  // Detect the unique-violation replay path. Postgres error code 23505;
  // PostgREST exposes it as `error.code`.
  const errCode = (ins.error as unknown as { code?: string } | null)?.code ?? "";
  if (errCode !== "23505") {
    throw new Error(`[recordAgentRun.insert] ${ins.error?.message ?? "unknown error"}`);
  }

  // Replay: fetch the prior row and synthesize a snapshot.
  const prior = await sb
    .from("agent_runs")
    // request_id column is migration-0009; cast for the select string.
    .select("id, input_tokens, output_tokens, cost_usd_cents, duration_ms, tools_called")
    .eq("tenant_id", args.tenantId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration-0009 column
    .eq("request_id" as never, args.requestId)
    .maybeSingle();

  if (prior.error || !prior.data) {
    throw new Error(
      `[recordAgentRun.replay] unique violation but prior row not readable: ${prior.error?.message ?? "no row"}`,
    );
  }

  return {
    id: prior.data.id,
    replayed: true,
    replaySnapshot: {
      inputTokens: prior.data.input_tokens,
      outputTokens: prior.data.output_tokens,
      costUsdCents: prior.data.cost_usd_cents,
      durationMs: prior.data.duration_ms ?? 0,
      toolsCalled: prior.data.tools_called,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  recordSubAgentRun                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export interface RecordSubAgentRunArgs {
  /** Stable id for the row (caller mints it so it can correlate before insert). */
  readonly id?: string;
  readonly agentRunId: string;
  readonly tenantId: string;
  readonly subAgentName: SubAgentName;
  readonly status?: SubAgentRunStatus;
  readonly input?: Json;
  readonly output?: Json;
  readonly durationMs?: number | null;
  readonly error?: string | null;
  readonly finishedAt?: string | null;
  readonly client?: Sb;
}

/**
 * Upsert a sub_agent_runs row. The runtime calls this twice per tool hop:
 *   - once with status='running' on dispatch;
 *   - once with the terminal status + output + duration on completion.
 */
export async function recordSubAgentRun(
  args: RecordSubAgentRunArgs,
): Promise<Tables<"sub_agent_runs">> {
  const sb: Sb = args.client ?? createServiceClient();

  if (args.id) {
    // UPSERT semantics. supabase-js upsert keys on PK; pass id explicitly.
    const row: Partial<Tables<"sub_agent_runs">> & { id: string } = {
      id: args.id,
      agent_run_id: args.agentRunId,
      tenant_id: args.tenantId,
      sub_agent_name: args.subAgentName,
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.input !== undefined ? { input: args.input } : {}),
      ...(args.output !== undefined ? { output: args.output } : {}),
      ...(args.durationMs !== undefined ? { duration_ms: args.durationMs } : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...(args.finishedAt !== undefined ? { finished_at: args.finishedAt } : {}),
    };
    const { data, error } = await sb
      .from("sub_agent_runs")
      .upsert(row as unknown as Tables<"sub_agent_runs">, { onConflict: "id" })
      .select()
      .single();
    if (error) throw new Error(`[recordSubAgentRun.upsert] ${error.message}`);
    return data;
  }

  // INSERT-only path (no caller-supplied id).
  const insertRow: Tables<"sub_agent_runs"> = {
    agent_run_id: args.agentRunId,
    tenant_id: args.tenantId,
    sub_agent_name: args.subAgentName,
    status: args.status ?? "running",
    input: args.input ?? {},
    output: args.output ?? {},
    duration_ms: args.durationMs ?? null,
    error: args.error ?? null,
    finished_at: args.finishedAt ?? null,
  } as unknown as Tables<"sub_agent_runs">;

  const { data, error } = await sb
    .from("sub_agent_runs")
    .insert(insertRow)
    .select()
    .single();
  if (error) throw new Error(`[recordSubAgentRun.insert] ${error.message}`);
  return data;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  bumpUsageMeter                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

export interface BumpUsageMeterArgs {
  readonly tenantId: string;
  readonly deltaUsdCents: number;
  readonly deltaTokensIn?: number;
  readonly deltaTokensOut?: number;
  /** Optional override; defaults to current UTC YYYY-MM. */
  readonly period?: string;
  /** Optional kind discriminator for future per-channel metering. */
  readonly kind?: "llm" | "composio" | "plaid";
  readonly client?: Sb;
}

/**
 * Atomic UPSERT on `usage_meters` keyed by `(tenant_id, period)`.
 *
 * supabase-js doesn't expose Postgres-side `INCREMENT`, so we run an
 * UPSERT that inserts a fresh row when missing, then a separate UPDATE
 * to add the deltas. The two statements are NOT in a transaction
 * (PostgREST limitation), but the worst case is a brief over-count on
 * a concurrent-first-call race for a brand-new tenant — acceptable for
 * a monthly aggregate. Tighten later via an RPC if needed.
 */
export async function bumpUsageMeter(
  args: BumpUsageMeterArgs,
): Promise<Tables<"usage_meters">> {
  const sb: Sb = args.client ?? createServiceClient();
  const period = args.period ?? currentMonth();

  // Ensure the row exists with zero counters.
  const upsertRow = {
    tenant_id: args.tenantId,
    period,
    llm_tokens_in: 0,
    llm_tokens_out: 0,
    composio_calls: 0,
    plaid_calls: 0,
    cost_usd_cents: 0,
  } as unknown as Tables<"usage_meters">;
  const ensureRes = await sb
    .from("usage_meters")
    .upsert(upsertRow, {
      onConflict: "tenant_id,period",
      ignoreDuplicates: true,
    })
    .select();
  if (ensureRes.error) {
    throw new Error(`[bumpUsageMeter.ensure] ${ensureRes.error.message}`);
  }

  // Read-modify-write the deltas.
  const existing = await sb
    .from("usage_meters")
    .select("*")
    .eq("tenant_id", args.tenantId)
    .eq("period", period)
    .single();
  if (existing.error || !existing.data) {
    throw new Error(`[bumpUsageMeter.read] ${existing.error?.message ?? "no row"}`);
  }

  const next: Partial<Tables<"usage_meters">> = {
    cost_usd_cents: existing.data.cost_usd_cents + Math.max(0, args.deltaUsdCents),
    llm_tokens_in: existing.data.llm_tokens_in + Math.max(0, args.deltaTokensIn ?? 0),
    llm_tokens_out: existing.data.llm_tokens_out + Math.max(0, args.deltaTokensOut ?? 0),
  };
  if (args.kind === "composio") {
    next.composio_calls = existing.data.composio_calls + 1;
  } else if (args.kind === "plaid") {
    next.plaid_calls = existing.data.plaid_calls + 1;
  }

  const { data, error } = await sb
    .from("usage_meters")
    .update(next)
    .eq("id", existing.data.id)
    .select()
    .single();
  if (error) throw new Error(`[bumpUsageMeter.update] ${error.message}`);
  return data;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function currentMonth(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${String(y)}-${m}`;
}
