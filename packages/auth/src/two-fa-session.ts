/**
 * @autonomux/auth/two-fa-session
 *
 * Jury F-TRC-03 fix 2026-05-29 — middleware 2FA gate.
 *
 * Once a user passes the TOTP challenge at sign-in, we set a signed
 * cookie that marks their current Supabase session as "2FA-passed."
 * Middleware reads this cookie on every `/app/*` request:
 *
 *   - User has no TOTP factor enrolled       → no gate, fall through
 *   - User has TOTP factor + valid cookie     → fall through
 *   - User has TOTP factor + no/invalid cookie→ redirect to /sign-in/totp
 *
 * The cookie is an HMAC-SHA-256 signed token bound to the user_id +
 * issuedAt. TTL is 12 hours (matches the typical Supabase access-token
 * cycle); after expiry the user re-enters TOTP. Not a replacement for
 * the proper Supabase Access Token Hook approach (deferred — see PRD
 * §7.1), but works correctly with zero infra changes today.
 *
 * Defense in depth:
 *   - HttpOnly, Secure (prod), SameSite=Strict
 *   - HMAC bound to user_id so it can't be replayed against a different
 *     account if one cookie leaks
 *   - Distinct from step-up tokens (different HMAC purpose constant +
 *     different cookie name + different TTL) — a "session 2FA passed"
 *     token cannot satisfy a step-up check
 *
 * Owner: [Shield]
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const TWO_FA_SESSION_COOKIE_NAME = "autonomux_2fa_session_v1";
export const TWO_FA_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const PURPOSE = "two_fa_session" as const;

export interface TwoFaSessionToken {
  userId: string;
  issuedAt: number;
}

export function issueTwoFaSessionToken(
  userId: string,
  secret: string,
): string {
  if (secret.length < 32) {
    throw new Error("[auth.two-fa-session] secret too short (min 32 chars)");
  }
  const issuedAt = Date.now();
  const body = `${userId}.${issuedAt}.${PURPOSE}`;
  const sig = createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64url");
  return `${Buffer.from(body, "utf8").toString("base64url")}.${sig}`;
}

export function verifyTwoFaSessionToken(
  raw: string | null | undefined,
  expected: { userId: string; secret: string },
): TwoFaSessionToken | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (expected.secret.length < 32) return null;

  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts as [string, string];

  let body: string;
  try {
    body = Buffer.from(bodyB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSig = createHmac("sha256", expected.secret)
    .update(body, "utf8")
    .digest("base64url");
  const sigBuf = Buffer.from(sigB64, "base64url");
  const expectedBuf = Buffer.from(expectedSig, "base64url");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  const bodyParts = body.split(".");
  if (bodyParts.length !== 3) return null;
  const [userId, issuedAtStr, purpose] = bodyParts as [string, string, string];

  if (purpose !== PURPOSE) return null;
  const issuedAt = Number.parseInt(issuedAtStr, 10);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > TWO_FA_SESSION_TTL_MS) return null;
  if (userId !== expected.userId) return null;

  return { userId, issuedAt };
}
