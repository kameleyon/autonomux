/**
 * @autonomux/auth/totp
 *
 * Time-based One-Time Password (RFC 6238) primitives.
 *
 *   - `generateTotpSecret()` — fresh base32 secret (otplib default 32 chars).
 *   - `provisioningUri()`    — otpauth:// URI for QR code rendering.
 *   - `verifyTotp()`         — constant-time verify with window for clock drift.
 *   - `generateBackupCodes()` — 10 single-use recovery codes formatted XXXX-XXXX.
 *   - `hashBackupCode()`     — sha256 hex; codes are stored hashed only.
 *   - `verifyBackupCode()`   — constant-time match against the stored hash set,
 *                              returns the consumed hash so the caller can
 *                              strike it from the stored array.
 *
 * Secret material returned from `generateTotpSecret()` MUST be encrypted via
 * `@autonomux/cipher` before persistence. Never log, never URL-encode, never
 * ship to the client bundle.
 *
 * Owner: [Cipher + Shield]
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { authenticator } from "otplib";
import { HashAlgorithms } from "@otplib/core";

// ---------------------------------------------------------------------------
// otplib hardening — explicit configuration so future package updates don't
// silently change our verification semantics.
// ---------------------------------------------------------------------------
// SHA-1 is the RFC 6238 + Google Authenticator default. Most authenticator
// apps (Authy, 1Password, Aegis) accept only SHA-1 in the otpauth:// URI.
// step=30s, digits=6 are universal.
authenticator.options = {
  algorithm: HashAlgorithms.SHA1,
  digits: 6,
  step: 30,
  // window=1 -> ±30s tolerance on each side (covers reasonable phone clock drift).
  window: 1,
};

/**
 * Generate a fresh base32-encoded TOTP secret (160 bits, RFC 4226 §4).
 *
 * The caller MUST encrypt this via `@autonomux/cipher.encrypt(..., 'totp_secret')`
 * before persisting. The plaintext should live only in memory for the duration
 * of one enrollment request.
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Build the otpauth:// provisioning URI for QR-code rendering.
 *
 * `accountName` should be the user's email (it shows in the authenticator app
 * UI so they can tell apart accounts). `issuer` is the brand name.
 *
 * RFC 6238 + Google Key URI Format — `otpauth://totp/Issuer:account?secret=...&issuer=...`.
 */
export function provisioningUri(
  secret: string,
  accountName: string,
  issuer: string = "Autonomux",
): string {
  if (secret.length === 0) {
    throw new Error("[auth.totp] empty secret");
  }
  if (accountName.length === 0) {
    throw new Error("[auth.totp] empty accountName");
  }
  return authenticator.keyuri(accountName, issuer, secret);
}

/**
 * Verify a 6-digit token against a base32 secret.
 *
 * `window` overrides the default ±1 step (±30s) tolerance. Keep at default
 * unless you have a specific reason (e.g., very loose clock skew).
 *
 * otplib's `verify()` performs constant-time HMAC comparison internally.
 *
 * Returns false on ANY anomaly (bad token, bad secret, throw) — never leaks
 * which condition failed via the boolean.
 */
export function verifyTotp(
  secret: string,
  token: string,
  window?: number,
): boolean {
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (typeof token !== "string") return false;

  // Normalize: strip whitespace, accept only 6 digits.
  const normalized = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  const previous = authenticator.options.window;
  try {
    if (typeof window === "number") {
      authenticator.options = { ...authenticator.options, window };
    }
    return authenticator.verify({ token: normalized, secret });
  } catch {
    return false;
  } finally {
    if (typeof window === "number") {
      authenticator.options = { ...authenticator.options, window: previous };
    }
  }
}

// ---------------------------------------------------------------------------
// Backup codes
// ---------------------------------------------------------------------------

/**
 * Generate `count` (default 10) backup codes formatted as XXXX-XXXX.
 *
 * Source: crypto.randomBytes (CSPRNG). Alphabet: base32 minus visually
 * ambiguous chars (no 0/O, 1/I, U). Each 8-char code carries ~38 bits of
 * entropy — ample for one-time recovery codes since the verify path is
 * rate-limited.
 */
export function generateBackupCodes(count: number = 10): string[] {
  if (!Number.isInteger(count) || count <= 0 || count > 100) {
    throw new Error("[auth.totp] invalid backup code count");
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTVWXYZ23456789"; // 31 chars, no 0/O/1/I/U
  const codes: string[] = [];
  const buf = randomBytes(count * 8);
  for (let i = 0; i < count; i++) {
    let raw = "";
    for (let j = 0; j < 8; j++) {
      const idx = (buf[i * 8 + j] ?? 0) % alphabet.length;
      raw += alphabet[idx];
    }
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

/**
 * Hash a backup code with SHA-256 (hex). One-way storage — we never
 * recover the plaintext after the initial display, by design.
 *
 * Normalization: uppercase, strip hyphens/whitespace. Lets users enter
 * the code with or without the hyphen / in any case.
 */
export function hashBackupCode(code: string): string {
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Constant-time check: does `code` match any hash in `hashedCodes`?
 *
 * Returns the matched hex digest so the caller can splice it out of the
 * stored array (codes are single-use). Returns null on no match.
 *
 * IMPORTANT: we iterate ALL candidates (never short-circuit on the first
 * non-match) and use `timingSafeEqual` to prevent timing oracles. Even on
 * match we continue the loop to keep total work constant.
 */
export function verifyBackupCode(
  code: string,
  hashedCodes: readonly string[],
): string | null {
  if (typeof code !== "string" || code.length === 0) return null;

  const candidate = hashBackupCode(code);
  const candidateBuf = Buffer.from(candidate, "hex");
  if (candidateBuf.length !== 32) return null;

  let matched: string | null = null;
  for (const stored of hashedCodes) {
    if (typeof stored !== "string" || stored.length !== 64) continue;
    let storedBuf: Buffer;
    try {
      storedBuf = Buffer.from(stored, "hex");
    } catch {
      continue;
    }
    if (storedBuf.length !== candidateBuf.length) continue;
    // timingSafeEqual + accumulate via boolean OR (don't short-circuit).
    if (timingSafeEqual(candidateBuf, storedBuf) && matched === null) {
      matched = stored;
    }
  }
  return matched;
}

/**
 * Convenience helper: hash an array of backup codes (the shape stored in
 * `user_2fa_factors.backup_codes_encrypted` JSONB column).
 */
export function hashBackupCodes(codes: readonly string[]): string[] {
  return codes.map(hashBackupCode);
}
