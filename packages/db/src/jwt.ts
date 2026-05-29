/**
 * packages/db/src/jwt.ts
 *
 * Decode + type-check a Supabase JWT into Autonomux's expected claim shape.
 *
 * The `tenant_id` claim is the linchpin of RLS — it's read by every policy
 * in 0002_rls.sql via `auth.jwt() ->> 'tenant_id'`. Middleware and every
 * API route call `extractJwtClaims()` early to fail fast on malformed
 * tokens.
 *
 * NOTE: this decodes — it does NOT verify the signature. Signature
 * verification is done by Supabase Auth on every API call (`supabase.auth.
 * getUser()` validates against the server). Decoding here is for extracting
 * claims we already know are server-validated.
 *
 * Owner: [Atlas + Shield]
 */

export interface JwtClaims {
  /** Auth user id (Supabase `auth.users.id`). */
  sub: string;
  /** Tenant id pinned to the JWT at sign-in via a Supabase access-token hook. */
  tenant_id: string;
  /** App-level role — Supabase's `role` claim ("authenticated" / "anon") or a custom claim. */
  role: string;
  /** Expiry in epoch seconds. */
  exp: number;
  /** Email — present for password sessions; null for service tokens. */
  email: string | null;
}

export class JwtMalformedError extends Error {
  constructor(reason: string) {
    super(`[jwt] malformed token: ${reason}`);
    this.name = "JwtMalformedError";
  }
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  // Buffer is available in Node + Edge runtimes; atob is also available but
  // returns bytes-as-chars. Buffer.from handles binary -> utf8 cleanly.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded + pad, "base64").toString("utf8");
  }
  // Fallback — Edge runtime path.
  const binary = atob(padded + pad);
  let out = "";
  for (let i = 0; i < binary.length; i++) {
    out += String.fromCharCode(binary.charCodeAt(i));
  }
  return decodeURIComponent(escape(out));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse a JWT and assert the shape Autonomux expects.
 * Throws JwtMalformedError on any deviation.
 */
export function extractJwtClaims(token: string): JwtClaims {
  if (typeof token !== "string" || token.length === 0) {
    throw new JwtMalformedError("empty token");
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new JwtMalformedError(`expected 3 segments, got ${parts.length}`);
  }
  const payloadSegment = parts[1];
  if (payloadSegment === undefined || payloadSegment.length === 0) {
    throw new JwtMalformedError("empty payload segment");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(payloadSegment));
  } catch (err) {
    throw new JwtMalformedError(
      `payload JSON parse failed: ${(err as Error).message}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new JwtMalformedError("payload is not an object");
  }

  const sub = parsed.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new JwtMalformedError("missing or invalid 'sub'");
  }

  // Supabase stores custom claims in app_metadata when set via auth hooks,
  // OR at the top level when set via the new "access token hook".
  // Accept either location — but tenant_id MUST be present once the user
  // has completed signup.
  const tenantIdTop = parsed.tenant_id;
  let tenantId: string | null = null;
  if (typeof tenantIdTop === "string" && tenantIdTop.length > 0) {
    tenantId = tenantIdTop;
  } else if (isRecord(parsed.app_metadata)) {
    const fromMeta = parsed.app_metadata.tenant_id;
    if (typeof fromMeta === "string" && fromMeta.length > 0) {
      tenantId = fromMeta;
    }
  }
  if (tenantId === null) {
    throw new JwtMalformedError("missing 'tenant_id' claim");
  }

  const roleRaw = parsed.role;
  const role = typeof roleRaw === "string" && roleRaw.length > 0
    ? roleRaw
    : "authenticated";

  const exp = parsed.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    throw new JwtMalformedError("missing or invalid 'exp'");
  }

  const emailRaw = parsed.email;
  const email = typeof emailRaw === "string" && emailRaw.length > 0
    ? emailRaw
    : null;

  return { sub, tenant_id: tenantId, role, exp, email };
}

/**
 * Soft variant — returns null on any failure. Useful for middleware that
 * should redirect-to-signin rather than 500.
 */
export function tryExtractJwtClaims(token: string | undefined | null): JwtClaims | null {
  if (token === undefined || token === null || token.length === 0) return null;
  try {
    return extractJwtClaims(token);
  } catch {
    return null;
  }
}
