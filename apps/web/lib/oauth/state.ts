/**
 * apps/web/lib/oauth/state.ts
 *
 * State-parameter signing for the Gmail OAuth flow (Sprint D §4 / Cluster D).
 *
 * We mint a compact HS256 JWT and pass it through Google as the `state`
 * parameter. The same JWT is ALSO stashed in an HttpOnly cookie at
 * /auth/oauth/gmail/start; the callback verifies that the two match before
 * trusting any claims.
 *
 * Why JWT and not just a random nonce?
 *   - Carries the PKCE `verifier` securely (the cookie body, attacker can't
 *     read it; the URL state, attacker can't tamper without resigning).
 *   - Carries `tenantId` + `userId` so the callback can verify the same user
 *     who started the flow is the one finishing it (defense against a
 *     stolen redirect URL being completed in someone else's session).
 *   - Carries `iat` so we enforce a 10-minute flow TTL.
 *
 * Edge-safe: ONLY `crypto.subtle.*` — no `node:crypto`. Same reason as
 * packages/auth/src/two-fa-session.ts: this helper might be lifted into
 * middleware later (e.g. to gate `/app/settings/integrations` on a fresh
 * grant), and Edge runtime forbids node: builtins.
 *
 * Owner: [Cipher + Shield]
 */

const ALG = "HS256" as const;
const PURPOSE = "oauth_state_v1" as const;

/** Max age (ms) of an OAuth state JWT — Google consent UIs usually finish
 *  well under 5 minutes; we give ourselves 10. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStateClaims {
  /** Provider — gmail (Mailroom) and gcal (Scheduler) today; future-proof
   *  for outlook, calendly, etc. */
  provider: "gmail" | "gcal";
  /** Tenant the flow was initiated under. */
  tenantId: string;
  /** Supabase auth user id of the initiator. */
  userId: string;
  /** PKCE code_verifier (raw, base64url, 43-128 chars per RFC 7636). */
  verifier: string;
  /** Random nonce — equality-checked against the cookie body for CSRF. */
  nonce: string;
  /** Issued-at, ms since epoch. Used for TTL enforcement. */
  iat: number;
  /** Purpose binding — rejects a cookie/token wired for a different flow. */
  purpose: typeof PURPOSE;
}

interface JwtHeader {
  alg: typeof ALG;
  typ: "JWT";
}

// ---------------------------------------------------------------------------
// base64url helpers (Web-Crypto compatible — no Buffer)
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i] as number);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4;
  const b64 =
    s.replace(/-/g, "+").replace(/_/g, "/") +
    (pad > 0 ? "=".repeat(4 - pad) : "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function stringToBase64Url(s: string): string {
  return bytesToBase64Url(new TextEncoder().encode(s));
}

function base64UrlToString(s: string): string {
  return new TextDecoder().decode(base64UrlToBytes(s));
}

// ---------------------------------------------------------------------------
// HMAC SHA-256 (Web Crypto)
// ---------------------------------------------------------------------------

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(secret: string, signingInput: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  return bytesToBase64Url(new Uint8Array(sig));
}

async function verify(
  secret: string,
  signingInput: string,
  signatureB64: string,
): Promise<boolean> {
  const key = await importHmacKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(signatureB64),
    new TextEncoder().encode(signingInput),
  );
}

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function requireStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (secret === undefined || secret.length < 32) {
    throw new Error(
      "[oauth/state] OAUTH_STATE_SECRET must be set and >=32 chars",
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MintStateInput {
  provider: "gmail" | "gcal";
  tenantId: string;
  userId: string;
  verifier: string;
  nonce: string;
}

/**
 * Mint a signed state JWT. Same string is stashed in cookie + URL state.
 * Throws if OAUTH_STATE_SECRET is missing or too short — fail closed.
 */
export async function mintStateJwt(input: MintStateInput): Promise<string> {
  const secret = requireStateSecret();
  const header: JwtHeader = { alg: ALG, typ: "JWT" };
  const claims: OAuthStateClaims = {
    provider: input.provider,
    tenantId: input.tenantId,
    userId: input.userId,
    verifier: input.verifier,
    nonce: input.nonce,
    iat: Date.now(),
    purpose: PURPOSE,
  };
  const headerB64 = stringToBase64Url(JSON.stringify(header));
  const claimsB64 = stringToBase64Url(JSON.stringify(claims));
  const signingInput = `${headerB64}.${claimsB64}`;
  const sig = await sign(secret, signingInput);
  return `${signingInput}.${sig}`;
}

export type VerifyStateResult =
  | { ok: true; claims: OAuthStateClaims }
  | {
      ok: false;
      reason:
        | "malformed"
        | "bad_signature"
        | "expired"
        | "wrong_purpose"
        | "decode_error"
        | "missing_secret";
    };

/**
 * Verify a state JWT. Returns a discriminated result — callers handle
 * `ok=false` by redirecting to the integrations page with an error code.
 *
 * Never throws on bad input (an attacker controls the URL). Throws ONLY if
 * the operator forgot to set OAUTH_STATE_SECRET (configuration bug, not an
 * attacker — fail loud).
 */
export async function verifyStateJwt(
  token: string | undefined | null,
): Promise<VerifyStateResult> {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  let secret: string;
  try {
    secret = requireStateSecret();
  } catch {
    return { ok: false, reason: "missing_secret" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerB64, claimsB64, sigB64] = parts as [string, string, string];

  const signingInput = `${headerB64}.${claimsB64}`;
  let sigOk: boolean;
  try {
    sigOk = await verify(secret, signingInput, sigB64);
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (!sigOk) return { ok: false, reason: "bad_signature" };

  let header: JwtHeader;
  let claims: OAuthStateClaims;
  try {
    header = JSON.parse(base64UrlToString(headerB64)) as JwtHeader;
    claims = JSON.parse(base64UrlToString(claimsB64)) as OAuthStateClaims;
  } catch {
    return { ok: false, reason: "decode_error" };
  }

  if (header.alg !== ALG || header.typ !== "JWT") {
    return { ok: false, reason: "malformed" };
  }
  if (claims.purpose !== PURPOSE) {
    return { ok: false, reason: "wrong_purpose" };
  }
  if (typeof claims.iat !== "number" || !Number.isFinite(claims.iat)) {
    return { ok: false, reason: "malformed" };
  }
  if (Date.now() - claims.iat > OAUTH_STATE_TTL_MS) {
    return { ok: false, reason: "expired" };
  }
  if (
    typeof claims.tenantId !== "string" ||
    typeof claims.userId !== "string" ||
    typeof claims.verifier !== "string" ||
    typeof claims.nonce !== "string" ||
    (claims.provider !== "gmail" && claims.provider !== "gcal")
  ) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, claims };
}

// ---------------------------------------------------------------------------
// PKCE helpers (Edge-safe — Web Crypto only)
// ---------------------------------------------------------------------------

/**
 * Generate a PKCE code_verifier per RFC 7636 §4.1:
 *   - 32 random bytes encoded as base64url → 43 chars (within 43..128 range)
 */
export function generatePkceVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/**
 * Derive the PKCE code_challenge for `method=S256`:
 *   challenge = base64url(SHA-256(verifier))
 */
export async function deriveS256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

/**
 * Generate an opaque, URL-safe random nonce for the CSRF cookie binding.
 * 16 bytes is enough (>128 bits of entropy).
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}
