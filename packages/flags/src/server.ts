/**
 * packages/flags/src/server.ts
 *
 * Server-side flag evaluator. Roll-our-own minimum, GrowthBook-drop-in.
 *
 * Rule precedence (one row from `feature_flags`):
 *   1. tenantId ∈ disabled_for_tenants  → false  (reason: denylist)
 *   2. tenantId ∈ enabled_for_tenants   → true   (reason: allowlist)
 *   3. rollout_percentage > 0
 *        AND sha256(tenantId || ':' || key) % 100 < rollout_percentage
 *                                         → true   (reason: rollout_hit)
 *      else                                false (reason: rollout_miss
 *                                           IF rollout_percentage > 0 AND
 *                                           NOT enabled_globally, else
 *                                           falls through)
 *   4. enabled_globally                  → true   (reason: global_on)
 *   5. otherwise                          → false  (reason: default_off)
 *
 * Notes:
 *   - The rollout hash is SHA-256 of `${tenantId}:${key}` so the bucket
 *     is stable per (tenant, flag) and uniformly distributed.
 *   - When `rollout_percentage === 0` we skip the hash entirely so a
 *     globally-on flag with no rollout still resolves to true.
 *   - When `rollout_percentage > 0` we honor the rollout decision and
 *     do NOT fall through to enabled_globally — operators use
 *     enabled_globally:true + rollout_percentage:100 to mean "100%
 *     forever"; rollout_percentage:50 means "50% always, regardless
 *     of global toggle" which matches GrowthBook semantics.
 *
 * Owner: [Lens + Forge]
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@autonomux/db/client";
import type { Database } from "@autonomux/db/types";

import { flagCache } from "./cache";
import type {
  EvaluateFlagArgs,
  FeatureFlag,
  FlagEvaluation,
  FlagEvaluationReason,
  FlagEvaluator,
} from "./types";

// ---------------------------------------------------------------------------
// Snapshot loader — single batched read of every flag row.
// ---------------------------------------------------------------------------

async function loadSnapshot(
  supabase: SupabaseClient<Database>,
): Promise<ReadonlyMap<string, FeatureFlag>> {
  const cached = flagCache.read();
  if (cached !== null) return cached;

  const { data, error } = await supabase
    .from("feature_flags")
    .select(
      "key, description, enabled_globally, rollout_percentage, enabled_for_tenants, disabled_for_tenants, created_at, updated_at",
    );

  if (error !== null) {
    // Fail-closed: every flag resolves to its default (false). We still
    // populate an empty snapshot so we don't hammer the DB on each call
    // during an outage.
    return flagCache.write([]);
  }

  const rows: FeatureFlag[] = (data ?? []).map((row) => ({
    key: row.key,
    description: row.description,
    enabled_globally: row.enabled_globally,
    rollout_percentage: row.rollout_percentage,
    enabled_for_tenants: row.enabled_for_tenants ?? [],
    disabled_for_tenants: row.disabled_for_tenants ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return flagCache.write(rows);
}

// ---------------------------------------------------------------------------
// Deterministic per-tenant rollout bucket.
// ---------------------------------------------------------------------------
// SHA-256(tenantId + ":" + key) interpreted as a big-endian unsigned int over
// the first 8 hex chars (32 bits) — uniform mod 100 within the precision the
// rollout slider exposes (1% granularity).
// ---------------------------------------------------------------------------

export function rolloutBucket(tenantId: string, key: string): number {
  const digest = createHash("sha256")
    .update(`${tenantId}:${key}`)
    .digest("hex");
  // First 8 hex chars = 32 bits. parseInt(base 16) is safe for ≤ 32 bits.
  const slice = digest.slice(0, 8);
  const n = Number.parseInt(slice, 16);
  return n % 100;
}

// ---------------------------------------------------------------------------
// Single-flag evaluation.
// ---------------------------------------------------------------------------

function evaluateRow(flag: FeatureFlag, tenantId: string): FlagEvaluation {
  if (flag.disabled_for_tenants.includes(tenantId)) {
    return { key: flag.key, value: false, reason: "denylist" };
  }
  if (flag.enabled_for_tenants.includes(tenantId)) {
    return { key: flag.key, value: true, reason: "allowlist" };
  }
  if (flag.rollout_percentage > 0) {
    const bucket = rolloutBucket(tenantId, flag.key);
    if (bucket < flag.rollout_percentage) {
      return { key: flag.key, value: true, reason: "rollout_hit", bucket };
    }
    return { key: flag.key, value: false, reason: "rollout_miss", bucket };
  }
  if (flag.enabled_globally) {
    return { key: flag.key, value: true, reason: "global_on" };
  }
  return { key: flag.key, value: false, reason: "default_off" };
}

// ---------------------------------------------------------------------------
// Public evaluator object — the import the rest of the codebase uses.
// ---------------------------------------------------------------------------

function resolveClient(
  args: EvaluateFlagArgs,
): SupabaseClient<Database> {
  return args.supabase ?? createServiceClient();
}

async function evaluateFlagWithReason(
  key: string,
  args: EvaluateFlagArgs,
): Promise<FlagEvaluation> {
  const snapshot = await loadSnapshot(resolveClient(args));
  const flag = snapshot.get(key);
  if (flag === undefined) {
    const reason: FlagEvaluationReason = "unknown_flag";
    return { key, value: false, reason };
  }
  return evaluateRow(flag, args.tenantId);
}

async function evaluateFlag(
  key: string,
  args: EvaluateFlagArgs,
): Promise<boolean> {
  const { value } = await evaluateFlagWithReason(key, args);
  return value;
}

async function evaluateAllFlags(
  args: EvaluateFlagArgs,
): Promise<Record<string, boolean>> {
  const snapshot = await loadSnapshot(resolveClient(args));
  const out: Record<string, boolean> = {};
  for (const flag of snapshot.values()) {
    out[flag.key] = evaluateRow(flag, args.tenantId).value;
  }
  return out;
}

export const flagEvaluator: FlagEvaluator = {
  evaluateFlag,
  evaluateFlagWithReason,
  evaluateAllFlags,
  invalidate(key?: string): void {
    flagCache.invalidate(key);
  },
};

// Convenience re-exports so callers can do
//   import { evaluateFlag } from "@autonomux/flags/server";
export { evaluateFlag, evaluateFlagWithReason, evaluateAllFlags };
