/**
 * apps/web/lib/twofa/cookie.ts
 *
 * Signed + encrypted short-lived cookies for the 2FA enrollment + verification
 * flows.
 *
 * Two cookie kinds live here:
 *
 *   1. TOTP enrollment cookie  — carries the pending Cipher envelope of the
 *      freshly-generated TOTP secret between the GET (QR render) and POST
 *      (verify code) of the enroll page. TTL 10 min.
 *
 *   2. WebAuthn challenge cookie — carries the SimpleWebAuthn challenge
 *      between the /options route and the /verify route. TTL 5 min, single-use.
 *
 * Both kinds are HMAC-signed with AUTH_CHALLENGE_SECRET to prevent tampering.
 * Payloads are JSON (no PII — the TOTP envelope is already KMS-wrapped, and
 * the WebAuthn challenge is public-by-design random bytes).
 *
 * Owner: [Shield + Cipher]
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { EncryptedEnvelope } from "@autonomux/cipher";

const TOTP_ENROLL_COOKIE = "autonomux_totp_enroll";
const WEBAUTHN_REG_COOKIE = "autonomux_webauthn_reg";
const WEBAUTHN_AUTH_COOKIE = "autonomux_webauthn_auth";

const TOTP_ENROLL_TTL_MS = 10 * 60 * 1000; // 10 min
const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 min

function requireSecret(): string {
  const secret = process.env.AUTH_CHALLENGE_SECRET;
  if (secret === undefined || secret.length < 32) {
    throw new Error(
      "[twofa/cookie] AUTH_CHALLENGE_SECRET must be set and >=32 chars",
    );
  }
  return secret;
}

interface SignedEnvelope<T> {
  payload: T;
  issuedAt: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64url");
}

function encode<T>(payload: T): string {
  const env: SignedEnvelope<T> = { payload, issuedAt: Date.now() };
  const body = Buffer.from(JSON.stringify(env), "utf8").toString("base64url");
  const sig = sign(body, requireSecret());
  return `${body}.${sig}`;
}

function decode<T>(raw: string | undefined | null, ttlMs: number): T | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts as [string, string];

  let secret: string;
  try {
    secret = requireSecret();
  } catch {
    return null;
  }

  const expected = sign(bodyB64, secret);
  const sigBuf = Buffer.from(sigB64, "base64url");
  const expectedBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  let parsed: SignedEnvelope<T>;
  try {
    parsed = JSON.parse(
      Buffer.from(bodyB64, "base64url").toString("utf8"),
    ) as SignedEnvelope<T>;
  } catch {
    return null;
  }
  if (typeof parsed.issuedAt !== "number") return null;
  if (Date.now() - parsed.issuedAt > ttlMs) return null;
  return parsed.payload;
}

// ---------------------------------------------------------------------------
// TOTP enrollment cookie
// ---------------------------------------------------------------------------
// Carries the Cipher envelope of the pending secret + the user id (so a
// stale cookie from another user is rejected).
// ---------------------------------------------------------------------------

export interface TotpEnrollCookiePayload {
  userId: string;
  envelope: EncryptedEnvelope;
}

export function encodeTotpEnrollCookie(p: TotpEnrollCookiePayload): string {
  return encode<TotpEnrollCookiePayload>(p);
}

export function decodeTotpEnrollCookie(
  raw: string | undefined | null,
): TotpEnrollCookiePayload | null {
  return decode<TotpEnrollCookiePayload>(raw, TOTP_ENROLL_TTL_MS);
}

export const TOTP_ENROLL_COOKIE_NAME = TOTP_ENROLL_COOKIE;
export const TOTP_ENROLL_COOKIE_MAX_AGE = Math.floor(TOTP_ENROLL_TTL_MS / 1000);

// ---------------------------------------------------------------------------
// WebAuthn challenge cookies
// ---------------------------------------------------------------------------

export interface WebAuthnChallengeCookiePayload {
  userId: string;
  challenge: string;
}

export function encodeWebAuthnChallengeCookie(
  p: WebAuthnChallengeCookiePayload,
): string {
  return encode<WebAuthnChallengeCookiePayload>(p);
}

export function decodeWebAuthnChallengeCookie(
  raw: string | undefined | null,
): WebAuthnChallengeCookiePayload | null {
  return decode<WebAuthnChallengeCookiePayload>(raw, WEBAUTHN_CHALLENGE_TTL_MS);
}

export const WEBAUTHN_REG_COOKIE_NAME = WEBAUTHN_REG_COOKIE;
export const WEBAUTHN_AUTH_COOKIE_NAME = WEBAUTHN_AUTH_COOKIE;
export const WEBAUTHN_CHALLENGE_COOKIE_MAX_AGE = Math.floor(
  WEBAUTHN_CHALLENGE_TTL_MS / 1000,
);

// ---------------------------------------------------------------------------
// Cookie attribute helper — shared posture for all 2FA cookies.
// ---------------------------------------------------------------------------

export function twoFaCookieAttrs(maxAge: number): {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  };
}

// ---------------------------------------------------------------------------
// One-shot backup-code display cookie (set by TOTP enroll action, read by
// /backup-codes page). 10-min TTL.
// ---------------------------------------------------------------------------

export interface BackupDisplayCookiePayload {
  userId: string;
  factorId: string;
  codes: string[];
  issuedAt: number;
}

export const BACKUP_DISPLAY_COOKIE_NAME = "autonomux_backup_display";
export const BACKUP_DISPLAY_COOKIE_MAX_AGE = 10 * 60;

export function encodeBackupDisplayCookie(
  p: BackupDisplayCookiePayload,
): string {
  return encode<BackupDisplayCookiePayload>(p);
}

export function decodeBackupDisplayCookie(
  raw: string | undefined | null,
): BackupDisplayCookiePayload | null {
  return decode<BackupDisplayCookiePayload>(
    raw,
    BACKUP_DISPLAY_COOKIE_MAX_AGE * 1000,
  );
}

/**
 * Step-up cookie name (was in app/sign-in/totp/action.ts; moved here so
 * Server Action files only export async functions per Next 15 contract).
 * Vercel build fix 2026-05-29.
 */
export const STEP_UP_COOKIE = "autonomux_step_up";
