/**
 * apps/web/lib/flags.ts
 *
 * Singleton evaluator for the user-facing web app. Wires the
 * `@autonomux/flags` server evaluator to the web app's service-role
 * Supabase client so we honor the in-process cache + a single client
 * across requests within a Node runtime.
 *
 * Use:
 *   const enabled = await isFlagEnabled("experimental_oracle_v2", tenantId);
 *
 * For client components, batch-load and pass via FlagProvider:
 *   const flags = await loadAllFlags(tenantId);
 *   return <FlagProvider value={flags}>{children}</FlagProvider>;
 *
 * Future swap to GrowthBook:
 *   Replace the body of this module with the GrowthBook SDK adapter that
 *   implements the same two functions. No consumer change required.
 *
 * Owner: [Forge + Lens]
 */

import "server-only";

import {
  evaluateFlag,
  evaluateAllFlags,
} from "@autonomux/flags/server";

import { getSupabaseServiceClient } from "./supabase/service";

/**
 * Resolve one flag for one tenant. Returns false for unknown flags.
 *
 * Pass the tenant_id from the session's JWT claim. For unauthenticated /
 * pre-signup contexts pass the empty UUID — only globally-on flags fire.
 */
export async function isFlagEnabled(
  key: string,
  tenantId: string,
): Promise<boolean> {
  return evaluateFlag(key, {
    tenantId,
    supabase: getSupabaseServiceClient(),
  });
}

/**
 * Batch-resolve every flag for one tenant. Use in a layout / root server
 * component, then hand the dictionary to <FlagProvider> so client
 * components can read flags via useFeatureFlag() without a round-trip.
 */
export async function loadAllFlags(
  tenantId: string,
): Promise<Record<string, boolean>> {
  return evaluateAllFlags({
    tenantId,
    supabase: getSupabaseServiceClient(),
  });
}
