/**
 * @autonomux/auth/rate-limit
 *
 * Sliding-window rate limiter for 2FA verify endpoints.
 *
 * Per the PRD: "TOTP verify capped at 5 attempts per minute per user".
 *
 * Backed by `user_2fa_verify_attempts`. Each verify call writes one row
 * (success or failure); before each verify we count rows in the last 60s
 * and reject if ≥ MAX_ATTEMPTS_PER_MINUTE.
 *
 * Counting rows in Postgres is deliberate: Phase 1.0 has no Redis. The
 * per-user index keeps this cheap. Phase 1.0-C may swap in a Redis-backed
 * counter — same interface.
 *
 * Owner: [Shield + Atlas]
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TwoFactorVerifyKind } from "@autonomux/db/types";

export const MAX_ATTEMPTS_PER_MINUTE = 5;
export const WINDOW_SECONDS = 60;

export interface RateLimitContext {
  /** Service-role supabase client (rate-limit table is service-only writable). */
  sb: SupabaseClient<Database>;
  userId: string;
  kind: TwoFactorVerifyKind;
  ip?: string | null;
  userAgent?: string | null;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the oldest in-window attempt ages out. Always >= 0. */
  retryAfterSeconds: number;
}

/**
 * Check the current rate-limit posture for this user + kind. Does NOT
 * record an attempt — call `recordAttempt()` separately after the verify
 * runs, so a successful verify also counts toward the window (the policy
 * is "attempts" not "failures" by design — successful logins still get
 * counted so an attacker who guesses right doesn't get unlimited tries).
 */
export async function checkRateLimit(
  ctx: RateLimitContext,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();

  const { data, error } = await ctx.sb
    .from("user_2fa_verify_attempts")
    .select("created_at")
    .eq("user_id", ctx.userId)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true });

  if (error !== null) {
    throw new Error(`[auth.rate-limit] count failed: ${error.message}`);
  }

  const rows = data ?? [];
  const count = rows.length;
  const remaining = Math.max(0, MAX_ATTEMPTS_PER_MINUTE - count);
  const allowed = count < MAX_ATTEMPTS_PER_MINUTE;

  // Retry-After: when the oldest in-window row ages out.
  let retryAfterSeconds = 0;
  if (!allowed && rows.length > 0) {
    const oldest = new Date(rows[0]!.created_at).getTime();
    const ageOutAt = oldest + WINDOW_SECONDS * 1000;
    retryAfterSeconds = Math.max(1, Math.ceil((ageOutAt - Date.now()) / 1000));
  }

  return { allowed, remaining, retryAfterSeconds };
}

/**
 * Record one verify attempt. Always call after the verify completes (regardless
 * of success/failure).
 */
export async function recordAttempt(
  ctx: RateLimitContext,
  success: boolean,
): Promise<void> {
  const { error } = await ctx.sb.from("user_2fa_verify_attempts").insert({
    user_id: ctx.userId,
    kind: ctx.kind,
    success,
    ip_address: ctx.ip ?? null,
    user_agent: ctx.userAgent ?? null,
  });
  if (error !== null) {
    // We do NOT throw — a failed audit-attempt write should not block the
    // verify response. But we DO log to stderr so ops sees it.
    // eslint-disable-next-line no-console
    console.error("[auth.rate-limit] recordAttempt failed:", error.message);
  }
}
