/**
 * apps/admin/lib/cost-rollup.ts
 *
 * Server-only cost rollup helpers for the admin cpanel.
 *
 * Why this lives here (and not in @autonomux/db):
 *   - These are CPANEL-shaped views; the user-app never needs them.
 *   - They wrap the service-role client; everything must stay server-only.
 *
 * Costs in the DB are stored as `cost_usd_cents` (integer). Helpers return
 * a numeric `cost_usd` (USD, 6dp internal precision) so the UI's
 * Intl.NumberFormat can do the rounding.
 *
 * Phase 1.0-C · C4
 */
import "server-only";

import { createServiceClient, type Database } from "@autonomux/db";
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostSummary {
  /** Total cost (USD) over the window. */
  total_usd: number;
  /** Token counts over the window. */
  input_tokens: number;
  output_tokens: number;
  /** Number of agent_runs counted. */
  run_count: number;
}

export interface TenantCostRow {
  tenant_id: string;
  total_usd: number;
  run_count: number;
}

export interface ModelCostRow {
  model: string;
  cost_usd: number;
  run_count: number;
}

export interface SubAgentCostRow {
  sub_agent: string;
  cost_usd: number;
  run_count: number;
}

export interface UsageMeterMonthRollup {
  /** YYYY-MM (current month, UTC). */
  period: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  tenant_count: number;
}

export interface BudgetAlertSummary {
  /** Number of tenants currently above 80% of their tier's monthly token budget. */
  tenants_above_80pct: number;
  /**
   * Per-tier ceiling used for the calc (null when the platform hasn't yet
   * defined ceilings — surfaces as "Awaiting tier ceilings" in the UI).
   */
  ceiling_basis: "placeholder" | "tier";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CENTS_PER_USD = 100;

function centsToUsd(cents: number | null | undefined): number {
  if (cents === null || cents === undefined) return 0;
  return cents / CENTS_PER_USD;
}

/** Format ISO into a Postgres-compatible timestamp string. */
function isoSince(window: { since: Date }): string {
  return window.since.toISOString();
}

function currentMonthPeriod(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Round-trip safe number sum (handles bigint columns coming back as strings). */
function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "bigint") return Number(v);
  return 0;
}

// ---------------------------------------------------------------------------
// getCostSummary
// ---------------------------------------------------------------------------
/**
 * Sum agent_runs cost + tokens over a window, optionally scoped to a tenant.
 *
 * Uses the supabase-js builder (parameterised under the hood) — never
 * string-interpolates user input. We pull only the three columns we sum
 * client-side; for production scale this should move to a Postgres view
 * or RPC that does the SUM() at the database — wired in a follow-up.
 */
export async function getCostSummary(
  args: { tenantId?: string; since: Date },
  sb: Sb = createServiceClient(),
): Promise<CostSummary> {
  let q = sb
    .from("agent_runs")
    .select("cost_usd_cents, input_tokens, output_tokens")
    .gte("created_at", isoSince({ since: args.since }));

  if (args.tenantId) {
    q = q.eq("tenant_id", args.tenantId);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`[cost-rollup.getCostSummary] ${error.message}`);
  }

  const rows = data ?? [];
  let centsTotal = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  for (const r of rows) {
    centsTotal += toNumber(r.cost_usd_cents);
    tokensIn += toNumber(r.input_tokens);
    tokensOut += toNumber(r.output_tokens);
  }

  return {
    total_usd: centsToUsd(centsTotal),
    input_tokens: tokensIn,
    output_tokens: tokensOut,
    run_count: rows.length,
  };
}

// ---------------------------------------------------------------------------
// getTopTenantsByCost — top N tenants over the trailing 30d.
// ---------------------------------------------------------------------------
export async function getTopTenantsByCost(
  limit = 10,
  sb: Sb = createServiceClient(),
): Promise<TenantCostRow[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const { data, error } = await sb
    .from("agent_runs")
    .select("tenant_id, cost_usd_cents")
    .gte("created_at", since.toISOString());

  if (error) {
    throw new Error(`[cost-rollup.getTopTenantsByCost] ${error.message}`);
  }

  const totals = new Map<string, { cents: number; runs: number }>();
  for (const row of data ?? []) {
    const existing = totals.get(row.tenant_id) ?? { cents: 0, runs: 0 };
    existing.cents += toNumber(row.cost_usd_cents);
    existing.runs += 1;
    totals.set(row.tenant_id, existing);
  }

  const ranked = Array.from(totals.entries())
    .map(([tenant_id, agg]) => ({
      tenant_id,
      total_usd: centsToUsd(agg.cents),
      run_count: agg.runs,
    }))
    .sort((a, b) => b.total_usd - a.total_usd)
    .slice(0, Math.max(1, Math.min(limit, 100)));

  return ranked;
}

// ---------------------------------------------------------------------------
// getCostByModel — cost split by model over the window.
// ---------------------------------------------------------------------------
export async function getCostByModel(
  since: Date,
  sb: Sb = createServiceClient(),
): Promise<ModelCostRow[]> {
  const { data, error } = await sb
    .from("agent_runs")
    .select("model, cost_usd_cents")
    .gte("created_at", since.toISOString());

  if (error) {
    throw new Error(`[cost-rollup.getCostByModel] ${error.message}`);
  }

  const byModel = new Map<string, { cents: number; runs: number }>();
  for (const row of data ?? []) {
    const existing = byModel.get(row.model) ?? { cents: 0, runs: 0 };
    existing.cents += toNumber(row.cost_usd_cents);
    existing.runs += 1;
    byModel.set(row.model, existing);
  }

  return Array.from(byModel.entries())
    .map(([model, agg]) => ({
      model,
      cost_usd: centsToUsd(agg.cents),
      run_count: agg.runs,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd);
}

// ---------------------------------------------------------------------------
// getCostBySubAgent — joins sub_agent_runs back to its parent agent_run's
// cost. Strategy: take each sub_run's share = parent.cost * (sub.duration_ms
// / parent.duration_ms). When durations are missing (legacy rows) we fall
// back to an even split across the parent's sub-runs.
// ---------------------------------------------------------------------------
export async function getCostBySubAgent(
  since: Date,
  sb: Sb = createServiceClient(),
): Promise<SubAgentCostRow[]> {
  // Pull parent runs in window first to bound the join.
  const { data: runs, error: runsErr } = await sb
    .from("agent_runs")
    .select("id, cost_usd_cents, duration_ms")
    .gte("created_at", since.toISOString());

  if (runsErr) {
    throw new Error(`[cost-rollup.getCostBySubAgent] ${runsErr.message}`);
  }

  if (!runs || runs.length === 0) return [];

  const runIds = runs.map((r) => r.id);
  const runById = new Map(
    runs.map((r) => [
      r.id,
      {
        cents: toNumber(r.cost_usd_cents),
        duration_ms: toNumber(r.duration_ms),
      },
    ]),
  );

  // Fetch sub-runs for those parents in chunks to stay under any
  // PostgREST `in()` length limit on absurdly large windows.
  const CHUNK = 500;
  const aggregates = new Map<string, { cents: number; runs: number }>();

  for (let i = 0; i < runIds.length; i += CHUNK) {
    const slice = runIds.slice(i, i + CHUNK);
    const { data: subs, error: subsErr } = await sb
      .from("sub_agent_runs")
      .select("agent_run_id, sub_agent_name, duration_ms")
      .in("agent_run_id", slice);

    if (subsErr) {
      throw new Error(
        `[cost-rollup.getCostBySubAgent.subs] ${subsErr.message}`,
      );
    }

    // Group sub-runs by parent so we can compute even-split fallback.
    const subsByParent = new Map<
      string,
      Array<{ name: string; duration_ms: number }>
    >();
    for (const sub of subs ?? []) {
      const list = subsByParent.get(sub.agent_run_id) ?? [];
      list.push({
        name: sub.sub_agent_name,
        duration_ms: toNumber(sub.duration_ms),
      });
      subsByParent.set(sub.agent_run_id, list);
    }

    for (const [parentId, parentSubs] of subsByParent) {
      const parent = runById.get(parentId);
      if (!parent || parent.cents <= 0 || parentSubs.length === 0) continue;

      const totalSubDuration = parentSubs.reduce(
        (acc, s) => acc + s.duration_ms,
        0,
      );

      for (const sub of parentSubs) {
        const share =
          totalSubDuration > 0
            ? sub.duration_ms / totalSubDuration
            : 1 / parentSubs.length;
        const cents = parent.cents * share;
        const agg = aggregates.get(sub.name) ?? { cents: 0, runs: 0 };
        agg.cents += cents;
        agg.runs += 1;
        aggregates.set(sub.name, agg);
      }
    }
  }

  return Array.from(aggregates.entries())
    .map(([sub_agent, agg]) => ({
      sub_agent,
      cost_usd: centsToUsd(agg.cents),
      run_count: agg.runs,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd);
}

// ---------------------------------------------------------------------------
// getCurrentMonthUsage — usage_meters rollup for the current month (UTC).
// ---------------------------------------------------------------------------
export async function getCurrentMonthUsage(
  sb: Sb = createServiceClient(),
): Promise<UsageMeterMonthRollup> {
  const period = currentMonthPeriod();
  const { data, error } = await sb
    .from("usage_meters")
    .select(
      "tenant_id, llm_tokens_in, llm_tokens_out, cost_usd_cents",
    )
    .eq("period", period);

  if (error) {
    throw new Error(`[cost-rollup.getCurrentMonthUsage] ${error.message}`);
  }

  let tokensIn = 0;
  let tokensOut = 0;
  let cents = 0;
  const tenants = new Set<string>();
  for (const row of data ?? []) {
    tokensIn += toNumber(row.llm_tokens_in);
    tokensOut += toNumber(row.llm_tokens_out);
    cents += toNumber(row.cost_usd_cents);
    tenants.add(row.tenant_id);
  }

  return {
    period,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: centsToUsd(cents),
    tenant_count: tenants.size,
  };
}

// ---------------------------------------------------------------------------
// projectMonthEndCost — linear extrapolation of MTD usage to month-end.
// ---------------------------------------------------------------------------
export function projectMonthEndCost(
  mtdUsd: number,
  now: Date = new Date(),
): number {
  const day = now.getUTCDate();
  const lastDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  if (day === 0) return mtdUsd;
  return (mtdUsd / day) * lastDay;
}

// ---------------------------------------------------------------------------
// getBudgetAlertSummary — placeholder until tier ceilings ship.
// ---------------------------------------------------------------------------
/**
 * Tier-ceiling integration is Phase 1.0-C+1 (the `tenants` table needs a
 * `monthly_token_budget` column or a `tier_ceilings` lookup). Until that
 * lands we return `{ tenants_above_80pct: 0, ceiling_basis: "placeholder" }`
 * — the dashboard renders "Awaiting tier ceilings", NOT "0 tenants over
 * budget", so the empty state stays honest.
 */
export async function getBudgetAlertSummary(
  _sb: Sb = createServiceClient(),
): Promise<BudgetAlertSummary> {
  return {
    tenants_above_80pct: 0,
    ceiling_basis: "placeholder",
  };
}

// ---------------------------------------------------------------------------
// USD formatter — single source of truth for cost rendering.
//
// The shared `formatUsdFromCents` in `./format.ts` takes cents; this one
// takes USD-as-number because we pre-divide in the rollup helpers.
// ---------------------------------------------------------------------------
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd)) return "$0.00";
  return USD.format(usd);
}
