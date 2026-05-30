/**
 * packages/flags/src/types.ts
 *
 * Public types for the @autonomux/flags evaluator.
 *
 * Designed so a future swap to GrowthBook (or LaunchDarkly) is a single
 * import-line change: keep `FeatureFlag`/`FlagEvaluation`/`FlagEvaluator`
 * stable, replace the implementation in `./server.ts`.
 *
 * Owner: [Lens + Forge]
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@autonomux/db/types";

/** One row from `public.feature_flags`. */
export interface FeatureFlag {
  key: string;
  description: string | null;
  enabled_globally: boolean;
  rollout_percentage: number;
  enabled_for_tenants: ReadonlyArray<string>;
  disabled_for_tenants: ReadonlyArray<string>;
  created_at: string;
  updated_at: string;
}

/** Reason the evaluator picked a value. Surfaces in audit + debug headers. */
export type FlagEvaluationReason =
  | "default_off"
  | "denylist"
  | "allowlist"
  | "rollout_hit"
  | "rollout_miss"
  | "global_on"
  | "unknown_flag";

/** Result of evaluating one flag for one tenant. */
export interface FlagEvaluation {
  key: string;
  value: boolean;
  reason: FlagEvaluationReason;
  /** Bucket 0..99 — useful for "why didn't I get the rollout" debug. */
  bucket?: number;
}

/**
 * Inputs every evaluator accepts. `tenantId` is required because the
 * deterministic rollout bucket hashes it; pass the empty UUID for
 * unauth/system contexts and only `enabled_globally` will fire.
 */
export interface EvaluateFlagArgs {
  tenantId: string;
  /** Optional service client; evaluator falls back to one of its own. */
  supabase?: SupabaseClient<Database>;
}

/**
 * The contract the rest of the codebase depends on. GrowthBook's adapter
 * (Phase 1.5+) will implement this same shape.
 */
export interface FlagEvaluator {
  evaluateFlag(key: string, args: EvaluateFlagArgs): Promise<boolean>;
  evaluateFlagWithReason(
    key: string,
    args: EvaluateFlagArgs,
  ): Promise<FlagEvaluation>;
  /** Eager batch read — populates the dictionary passed to client components. */
  evaluateAllFlags(args: EvaluateFlagArgs): Promise<Record<string, boolean>>;
  invalidate(key?: string): void;
}
