/**
 * apps/web/lib/chat/budget-preflight.ts
 *
 * CR3 · Per-tenant monthly LLM budget preflight.
 *
 * Before opening a chat stream we check how much this tenant has already
 * spent this calendar month against a hard cap. If they're over, the route
 * returns HTTP 402 and does NOT open the stream.
 *
 * SCHEMA NOTES (verified against packages/db/migrations/0001_init.sql §20):
 *   Table `public.usage_meters` — one row per (tenant_id, period):
 *     - tenant_id       uuid
 *     - period          text  — 'YYYY-MM' (CHECK: ^\d{4}-(0[1-9]|1[0-2])$)
 *     - llm_tokens_in   bigint
 *     - llm_tokens_out  bigint
 *     - cost_usd_cents  integer   <-- the spend column we meter against
 *   There is no dedicated "budget"/"cap" column on the table, so the cap is
 *   configured out-of-band (env var, with a safe default). ASSUMPTION: the
 *   monthly budget is expressed in USD cents and applies to the tenant's
 *   *total* metered LLM cost for the current period (cost_usd_cents). This is
 *   the only spend figure the schema exposes; if a finer-grained "LLM-only"
 *   sub-total is added later, swap the summed column here.
 *
 * The cap comes from CHAT_MONTHLY_BUDGET_USD_CENTS (integer, USD cents). If
 * unset we fall back to DEFAULT_MONTHLY_BUDGET_USD_CENTS below. Set to 0 to
 * disable the preflight entirely (treated as "no cap").
 *
 * Owner: [Cluster C · Forge]
 */
import "server-only";

/** Default monthly LLM budget when CHAT_MONTHLY_BUDGET_USD_CENTS is unset. */
const DEFAULT_MONTHLY_BUDGET_USD_CENTS = 5_000; // $50.00 / tenant / month

export interface BudgetPreflightResult {
  /** True when the tenant is still within budget (or budgeting is disabled). */
  allowed: boolean;
  /** Cap in USD cents for the period. 0 means "no cap / disabled". */
  capUsdCents: number;
  /** Amount already spent this period, in USD cents. */
  spentUsdCents: number;
  /** The 'YYYY-MM' period this check applied to. */
  period: string;
}

/** Resolve the configured monthly cap (USD cents). 0 => disabled. */
function resolveCapUsdCents(): number {
  const raw = process.env["CHAT_MONTHLY_BUDGET_USD_CENTS"];
  if (raw === undefined || raw.length === 0) {
    return DEFAULT_MONTHLY_BUDGET_USD_CENTS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    // Set-but-unparseable is an operator typo. We still apply the safe default
    // cap (never "no cap"), but surface it so the misconfig is visible rather
    // than silent. childLogger has no request scope here, so stderr is fine.
    console.warn(
      `[budget-preflight] CHAT_MONTHLY_BUDGET_USD_CENTS is set but not a valid non-negative integer (${JSON.stringify(raw)}); falling back to default $${(DEFAULT_MONTHLY_BUDGET_USD_CENTS / 100).toFixed(2)} cap.`,
    );
    return DEFAULT_MONTHLY_BUDGET_USD_CENTS;
  }
  return parsed;
}

/** Current period key in 'YYYY-MM' (UTC), matching the usage_meters CHECK. */
export function currentUsagePeriod(now: Date = new Date()): string {
  const year = now.getUTCFullYear().toString().padStart(4, "0");
  const month = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Minimal structural type for the service-role client's read path used here.
 * We keep it local (mirroring the route's existing inline-cast style) so the
 * helper doesn't depend on the generated Database types.
 */
type UsageMeterReader = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        v: string,
      ) => {
        eq: (
          col: string,
          v: string,
        ) => {
          maybeSingle: () => Promise<{
            data: { cost_usd_cents: number | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

interface PreflightArgs {
  service: unknown;
  tenantId: string;
  now?: Date;
  log?: {
    warn: (a: unknown, b?: string) => void;
    error?: (a: unknown, b?: string) => void;
  };
}

/**
 * Read the tenant's current-month metered spend and compare against the cap.
 *
 * Fail-OPEN on read errors: if the usage_meters lookup itself errors (DB
 * hiccup), we do NOT block chat on a metering failure — we log and allow.
 * Budget enforcement is a cost-guard, not a security boundary, so a transient
 * read failure must not take chat offline for a paying tenant. The 402 path
 * fires only when we successfully read a spend value that is at/over the cap.
 */
export async function checkMonthlyBudget(
  args: PreflightArgs,
): Promise<BudgetPreflightResult> {
  const { service, tenantId, now, log } = args;
  const capUsdCents = resolveCapUsdCents();
  const period = currentUsagePeriod(now);

  // Cap disabled — short-circuit, no DB round-trip.
  if (capUsdCents <= 0) {
    return { allowed: true, capUsdCents: 0, spentUsdCents: 0, period };
  }

  const reader = service as UsageMeterReader;
  const res = await reader
    .from("usage_meters")
    .select("cost_usd_cents")
    .eq("tenant_id", tenantId)
    .eq("period", period)
    .maybeSingle();

  if (res.error !== null) {
    // Fail-open: metering read failed, don't hard-block chat.
    log?.warn?.(
      { err: res.error, tenant_id: tenantId, period },
      "chat.stream budget preflight read failed — allowing (fail-open)",
    );
    return { allowed: true, capUsdCents, spentUsdCents: 0, period };
  }

  // No row yet this period => zero spend so far.
  const spentUsdCents = res.data?.cost_usd_cents ?? 0;
  const allowed = spentUsdCents < capUsdCents;

  return { allowed, capUsdCents, spentUsdCents, period };
}
