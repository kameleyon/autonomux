/**
 * apps/web/app/api/plaid/webhook/route.ts
 *
 * POST /api/plaid/webhook — Plaid webhook receiver (CR9).
 *
 * SECURITY CONTRACT (the reason this file is structured the way it is):
 *
 *   1. Read the RAW request body FIRST, as text. We must hash the exact bytes
 *      Plaid signed — re-serialising a parsed object would change whitespace /
 *      key order and break the SHA-256 match.
 *
 *   2. Verify the Plaid webhook signature BEFORE any JSON.parse. Plaid sends a
 *      `Plaid-Verification` header: a JWT signed with ES256 whose header `kid`
 *      identifies a public key we fetch from Plaid's
 *      `/webhook_verification_key/get` endpoint. We:
 *        a. decode (NOT verify) the JWT header to read the `kid` + assert alg=ES256,
 *        b. fetch + JWKS-cache (~5 min) the verification key for that `kid`,
 *        c. cryptographically verify the JWT signature with that key,
 *        d. assert the JWT is fresh (iat within a 5-minute skew window),
 *        e. assert the JWT's `request_body_sha256` claim === sha256(rawBody).
 *      ANY failure in that chain → 400, and JSON.parse is NEVER reached.
 *      This is what the unit test "invalid header -> 400 AND JSON.parse never
 *      called" pins: verification must gate parsing, not the other way around.
 *
 *   3. Only AFTER verification succeeds do we JSON.parse the (now-trusted) body.
 *
 *   4. Idempotency: a webhook is processed at most once, keyed on
 *      `plaid_event_id` (a stable id we derive from the payload). We claim the
 *      id with an INSERT into `plaid_webhook_events`; a unique-violation means
 *      "already seen" → we ack 200 without re-processing.
 *
 * This handler is a SKELETON: verify + idempotency + 200 ack. It does NOT
 * implement Plaid business logic (item sync, transactions pull, etc.) — that
 * lands in a follow-up once the receiver is trusted end-to-end.
 *
 * Runtime: 'nodejs' — we use node:crypto for ES256 verification and the
 * service-role Supabase client (no user session on a webhook).
 *
 * Owner: [Shield · Forge]
 */

import "server-only";

import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import type { KeyObject } from "node:crypto";

import { NextRequest } from "next/server";

import { childLogger } from "@/lib/logger";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Config ────────────────────────────────────────────────────────────────

/** Plaid environment host. `sandbox` | `production`. */
const PLAID_ENV = process.env["PLAID_ENV"] ?? "sandbox";
const PLAID_HOST =
  PLAID_ENV === "production"
    ? "https://production.plaid.com"
    : "https://sandbox.plaid.com";

/** JWKS cache TTL — Plaid recommends refetching keys ~every 5 minutes. */
const JWK_CACHE_TTL_MS = 5 * 60 * 1000;

/** Max clock skew we tolerate on the JWT `iat` claim (replay window). */
const MAX_IAT_SKEW_MS = 5 * 60 * 1000;

// ── JWKS cache (~5 min per key id) ──────────────────────────────────────────

interface CachedKey {
  key: KeyObject;
  fetchedAt: number;
}

/**
 * kid → cached ES256 public key. Cached on globalThis so warm Next.js lambda
 * invocations reuse it (module-level `const` would also survive within a
 * container, but globalThis is robust to HMR / double-module edge cases).
 */
const JWK_CACHE_KEY = "__autonomux_plaid_jwk_cache__";

function jwkCache(): Map<string, CachedKey> {
  const g = globalThis as unknown as Record<string, Map<string, CachedKey>>;
  const existing = g[JWK_CACHE_KEY];
  if (existing !== undefined) return existing;
  const created = new Map<string, CachedKey>();
  g[JWK_CACHE_KEY] = created;
  return created;
}

// ── Minimal JWT (JWS compact) helpers ───────────────────────────────────────

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface PlaidJwtClaims {
  iat?: number;
  request_body_sha256?: string;
}

function base64UrlDecodeToBuffer(segment: string): Buffer {
  // Convert base64url → base64, then let Buffer validate/decode.
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function base64UrlDecodeToJson<T>(segment: string): T | null {
  try {
    const buf = base64UrlDecodeToBuffer(segment);
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Split a compact JWS into its three segments. Returns null if the shape is
 * not exactly header.payload.signature. NOTE: this does NOT JSON.parse the
 * webhook body — it only parses the JWT from the header, which is a separate,
 * signed token.
 */
function splitCompactJws(
  token: string,
): { headerSeg: string; payloadSeg: string; signatureSeg: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerSeg, payloadSeg, signatureSeg] = parts;
  if (
    headerSeg === undefined ||
    payloadSeg === undefined ||
    signatureSeg === undefined ||
    headerSeg.length === 0 ||
    payloadSeg.length === 0 ||
    signatureSeg.length === 0
  ) {
    return null;
  }
  return { headerSeg, payloadSeg, signatureSeg };
}

// ── Plaid verification-key fetch (+ cache) ──────────────────────────────────

/**
 * Fetch the ES256 verification key for `kid` from Plaid, import it as a
 * KeyObject, and cache it for ~5 min. Returns null on any failure (network,
 * non-200, malformed JWK, expired/revoked key) — the caller treats null as a
 * verification failure (→ 400).
 */
async function getVerificationKey(kid: string): Promise<KeyObject | null> {
  const cache = jwkCache();
  const cached = cache.get(kid);
  if (cached !== undefined && Date.now() - cached.fetchedAt < JWK_CACHE_TTL_MS) {
    return cached.key;
  }

  const clientId = process.env["PLAID_CLIENT_ID"];
  const secret = process.env["PLAID_SECRET"];
  if (
    clientId === undefined ||
    clientId.length === 0 ||
    secret === undefined ||
    secret.length === 0
  ) {
    // Misconfiguration — we cannot verify, so we must reject.
    return null;
  }

  let res: Response;
  try {
    res = await fetch(`${PLAID_HOST}/webhook_verification_key/get`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        key_id: kid,
      }),
      // Never cache at the fetch layer — we manage freshness ourselves.
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return null;
  }

  const jwk = (payload as { key?: unknown } | null)?.key;
  if (typeof jwk !== "object" || jwk === null) return null;

  const jwkRec = jwk as Record<string, unknown>;
  // Plaid keys can be expired/revoked; those carry `expired_at`. Reject them.
  if (jwkRec["expired_at"] !== null && jwkRec["expired_at"] !== undefined) {
    return null;
  }
  // Enforce the expected curve + type before importing.
  if (jwkRec["kty"] !== "EC" || jwkRec["crv"] !== "P-256") return null;
  if (typeof jwkRec["x"] !== "string" || typeof jwkRec["y"] !== "string") {
    return null;
  }

  let key: KeyObject;
  try {
    key = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: jwkRec["x"] as string,
        y: jwkRec["y"] as string,
      },
      format: "jwk",
    });
  } catch {
    return null;
  }

  cache.set(kid, { key, fetchedAt: Date.now() });
  return key;
}

/**
 * Verify the `Plaid-Verification` JWT against the raw body.
 *
 * Returns the trusted claims on success, or null on ANY failure. The caller
 * MUST NOT JSON.parse the body unless this returns non-null.
 */
async function verifyPlaidWebhook(
  verificationHeader: string | null,
  rawBody: string,
): Promise<PlaidJwtClaims | null> {
  if (verificationHeader === null || verificationHeader.length === 0) {
    return null;
  }

  const jws = splitCompactJws(verificationHeader);
  if (jws === null) return null;

  const header = base64UrlDecodeToJson<JwtHeader>(jws.headerSeg);
  if (header === null) return null;
  // Pin the algorithm — never trust the token to pick its own (alg=none / RSA
  // confusion). Plaid signs webhooks with ES256.
  if (header.alg !== "ES256") return null;
  if (header.kid === undefined || header.kid.length === 0) return null;

  const key = await getVerificationKey(header.kid);
  if (key === null) return null;

  // ES256 signature over `${headerSeg}.${payloadSeg}`. The JWS signature is
  // the raw R||S concatenation (IEEE P1363), which node:crypto verifies when
  // told the encoding explicitly.
  const signingInput = Buffer.from(
    `${jws.headerSeg}.${jws.payloadSeg}`,
    "ascii",
  );
  const signature = base64UrlDecodeToBuffer(jws.signatureSeg);

  let signatureOk = false;
  try {
    signatureOk = cryptoVerify(
      "sha256",
      signingInput,
      { key, dsaEncoding: "ieee-p1363" },
      signature,
    );
  } catch {
    return null;
  }
  if (!signatureOk) return null;

  const claims = base64UrlDecodeToJson<PlaidJwtClaims>(jws.payloadSeg);
  if (claims === null) return null;

  // Freshness: reject stale/future tokens (replay defense).
  if (typeof claims.iat !== "number") return null;
  const iatMs = claims.iat * 1000;
  if (Math.abs(Date.now() - iatMs) > MAX_IAT_SKEW_MS) return null;

  // Body integrity: the JWT commits to sha256(rawBody). Compare in constant
  // time via lengths + a char-by-char accumulator (hex strings, short).
  if (
    typeof claims.request_body_sha256 !== "string" ||
    claims.request_body_sha256.length === 0
  ) {
    return null;
  }
  const actualHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  if (!timingSafeEqualHex(actualHash, claims.request_body_sha256)) return null;

  return claims;
}

/** Length-checked, non-short-circuiting hex string compare. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Idempotency ─────────────────────────────────────────────────────────────

/**
 * Derive a stable event id for idempotency. Plaid webhooks don't carry a
 * universal event-id field, so we key on the sha256 of the exact signed body:
 * Plaid re-delivers the identical body, so identical bytes ⇒ identical id.
 * (Business-specific fields like item_id + webhook_code could refine this
 * later, but body-hash is correct and collision-safe for at-most-once.)
 */
function derivePlaidEventId(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/**
 * Claim the event id by inserting a row. Returns:
 *   - "new"        → we won the race, caller should process.
 *   - "duplicate"  → row already existed (unique violation), caller acks only.
 *   - "error"      → unexpected DB error; caller should 500 so Plaid retries.
 */
async function claimIdempotency(
  plaidEventId: string,
  webhookType: string | null,
  webhookCode: string | null,
): Promise<"new" | "duplicate" | "error"> {
  const service = getSupabaseServiceClient();

  const insertRes = await (
    service as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{
          error: { code?: string; message: string } | null;
        }>;
      };
    }
  )
    .from("plaid_webhook_events")
    .insert({
      plaid_event_id: plaidEventId,
      webhook_type: webhookType,
      webhook_code: webhookCode,
      received_at: new Date().toISOString(),
    });

  if (insertRes.error === null) return "new";

  // 23505 = unique_violation → we've already recorded this event.
  if (insertRes.error.code === "23505") return "duplicate";

  return "error";
}

// ── Route handler ───────────────────────────────────────────────────────────

const JSON_HEADERS: HeadersInit = { "content-type": "application/json" };

export async function POST(request: NextRequest): Promise<Response> {
  const log = childLogger({
    component: "api.plaid.webhook",
    request_id: request.headers.get("x-request-id") ?? undefined,
  });

  // (1) RAW body first — before any parse. This is the exact byte string Plaid
  //     signed; we hash it as-is.
  const rawBody = await request.text();

  // (2) Verify signature BEFORE JSON.parse. On ANY failure → 400 and we never
  //     touch the body as JSON.
  const verificationHeader =
    request.headers.get("plaid-verification") ??
    request.headers.get("Plaid-Verification");

  const claims = await verifyPlaidWebhook(verificationHeader, rawBody);
  if (claims === null) {
    log.warn(
      { has_header: verificationHeader !== null },
      "plaid.webhook verification failed",
    );
    return new Response(
      JSON.stringify({ error: "Webhook verification failed." }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  // (3) Body is now trusted — safe to parse. Guard the parse anyway; a verified
  //     body should always be valid JSON, but we never want to throw here.
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(rawBody);
    if (typeof value !== "object" || value === null) {
      return new Response(JSON.stringify({ error: "Invalid webhook body." }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    parsed = value as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid webhook body." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const webhookType =
    typeof parsed["webhook_type"] === "string"
      ? (parsed["webhook_type"] as string)
      : null;
  const webhookCode =
    typeof parsed["webhook_code"] === "string"
      ? (parsed["webhook_code"] as string)
      : null;

  // (4) Idempotency — process at most once.
  const plaidEventId = derivePlaidEventId(rawBody);
  const claim = await claimIdempotency(plaidEventId, webhookType, webhookCode);

  if (claim === "error") {
    log.error(
      { plaid_event_id: plaidEventId },
      "plaid.webhook idempotency claim failed",
    );
    // 500 → Plaid retries with the same body (same id), so we stay at-most-once.
    return new Response(
      JSON.stringify({ error: "Could not record webhook." }),
      { status: 500, headers: JSON_HEADERS },
    );
  }

  if (claim === "duplicate") {
    log.info(
      { plaid_event_id: plaidEventId, webhook_type: webhookType, webhook_code: webhookCode },
      "plaid.webhook duplicate — already processed, acking",
    );
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  // claim === "new" — we own this event.
  //
  // SKELETON BOUNDARY: Plaid business logic (item sync, transactions refresh,
  // auth/identity updates, error handling per webhook_code) is intentionally
  // NOT implemented here. The receiver is verified + idempotent + acking; the
  // handlers land in a follow-up. For now we just acknowledge.
  log.info(
    { plaid_event_id: plaidEventId, webhook_type: webhookType, webhook_code: webhookCode },
    "plaid.webhook verified + recorded (skeleton ack)",
  );

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
