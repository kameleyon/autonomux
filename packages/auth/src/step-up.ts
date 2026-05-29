/**
 * @autonomux/auth/step-up
 *
 * Step-up authentication: certain destructive operations (removing 2FA,
 * deleting account, banking changes) require a fresh TOTP verification
 * within the last 5 minutes — even if the user is already logged in.
 *
 * Storage: a signed + encrypted HMAC token stored in a short-lived cookie.
 * The token contains:
 *   - user_id
 *   - issued_at (unix ms)
 *   - purpose ("step_up_2fa_revoke" | "step_up_account_delete" | ...)
 *
 * The token is HMAC-SHA-256 signed with `AUTH_STEP_UP_SECRET`. Encryption is
 * NOT necessary (no PII in the token), only integrity — but we still bind the
 * purpose into the HMAC so a step-up granted for one operation cannot be
 * replayed against another.
 *
 * Owner: [Shield]
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const STEP_UP_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type StepUpPurpose =
  | "step_up_2fa_revoke"
  | "step_up_account_delete"
  | "step_up_banking_change"
  | "step_up_plan_downgrade";

export interface StepUpToken {
  userId: string;
  issuedAt: number;
  purpose: StepUpPurpose;
}

/**
 * Issue a step-up token. Caller stores the returned string in an httpOnly,
 * Secure, SameSite=Strict cookie with maxAge=5min.
 */
export function issueStepUpToken(
  token: StepUpToken,
  secret: string,
): string {
  if (secret.length < 32) {
    throw new Error("[auth.step-up] secret too short (min 32 chars)");
  }
  const body = `${token.userId}.${token.issuedAt}.${token.purpose}`;
  const sig = createHmac("sha256", secret).update(body, "utf8").digest("base64url");
  return `${Buffer.from(body, "utf8").toString("base64url")}.${sig}`;
}

/**
 * Verify a step-up token. Returns the decoded token if valid, null otherwise.
 *
 * Checks: signature integrity, TTL, purpose match, user match.
 */
export function verifyStepUpToken(
  raw: string | null | undefined,
  expected: { userId: string; purpose: StepUpPurpose; secret: string },
): StepUpToken | null {
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

  const expectedSig = createHmac("sha256", expected.secret).update(body, "utf8").digest("base64url");
  const sigBuf = Buffer.from(sigB64, "base64url");
  const expectedBuf = Buffer.from(expectedSig, "base64url");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  const bodyParts = body.split(".");
  if (bodyParts.length !== 3) return null;
  const [userId, issuedAtStr, purpose] = bodyParts as [string, string, string];

  const issuedAt = Number.parseInt(issuedAtStr, 10);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > STEP_UP_TTL_MS) return null;
  if (userId !== expected.userId) return null;
  if (purpose !== expected.purpose) return null;

  return { userId, issuedAt, purpose: purpose as StepUpPurpose };
}
