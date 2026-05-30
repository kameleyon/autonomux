/**
 * @autonomux/auth/two-fa-session
 *
 * Jury F-TRC-03 fix 2026-05-29 — middleware 2FA gate.
 * Vercel build fix 2026-05-29 — refactored from `node:crypto` to Web
 * Crypto (`crypto.subtle.*`) so the module runs in BOTH the Edge
 * runtime (middleware) AND the Node runtime (Server Actions).
 *
 * Once a user passes the TOTP challenge at sign-in, we set a signed
 * cookie that marks their current Supabase session as "2FA-passed."
 * Middleware reads this cookie on every `/app/*` request:
 *
 *   - User has no TOTP factor enrolled       → no gate, fall through
 *   - User has TOTP factor + valid cookie     → fall through
 *   - User has TOTP factor + no/invalid cookie→ redirect to /sign-in/totp
 *
 * The cookie is an HMAC-SHA-256 signed token bound to user_id + issuedAt.
 * TTL is 12 hours (matches the typical Supabase access-token cycle);
 * after expiry the user re-enters TOTP. Not a replacement for the proper
 * Supabase Access Token Hook approach (deferred — see PRD §7.1), but
 * works correctly with zero infra changes today.
 *
 * Defense in depth:
 *   - HttpOnly, Secure (prod), SameSite=Strict
 *   - HMAC bound to user_id so it can't be replayed against a different
 *     account if one cookie leaks
 *   - Distinct from step-up tokens (different HMAC purpose constant +
 *     different cookie name + different TTL) — a "session 2FA passed"
 *     token cannot satisfy a step-up check
 *   - `crypto.subtle.verify` is itself constant-time, so we no longer
 *     need an explicit `timingSafeEqual` shim
 *
 * Owner: [Shield]
 */

export const TWO_FA_SESSION_COOKIE_NAME = "autonomux_2fa_session_v1";
export const TWO_FA_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const PURPOSE = "two_fa_session" as const;

export interface TwoFaSessionToken {
  userId: string;
  issuedAt: number;
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i] as number);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4;
  const b64 =
    s.replace(/-/g, "+").replace(/_/g, "/") +
    (pad > 0 ? "=".repeat(4 - pad) : "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hmacSign(secret: string, body: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return toBase64Url(sig);
}

async function hmacVerify(
  secret: string,
  body: string,
  sigB64: string,
): Promise<boolean> {
  const key = await importKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(sigB64),
    new TextEncoder().encode(body),
  );
}

export async function issueTwoFaSessionToken(
  userId: string,
  secret: string,
): Promise<string> {
  if (secret.length < 32) {
    throw new Error("[auth.two-fa-session] secret too short (min 32 chars)");
  }
  const issuedAt = Date.now();
  const body = `${userId}.${issuedAt}.${PURPOSE}`;
  const sig = await hmacSign(secret, body);
  const bodyB64 = toBase64Url(new TextEncoder().encode(body).buffer);
  return `${bodyB64}.${sig}`;
}

export async function verifyTwoFaSessionToken(
  raw: string | null | undefined,
  expected: { userId: string; secret: string },
): Promise<TwoFaSessionToken | null> {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (expected.secret.length < 32) return null;

  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts as [string, string];

  let body: string;
  try {
    body = new TextDecoder().decode(fromBase64Url(bodyB64));
  } catch {
    return null;
  }

  const ok = await hmacVerify(expected.secret, body, sigB64);
  if (!ok) return null;

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
