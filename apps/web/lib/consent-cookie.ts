/**
 * apps/web/lib/consent-cookie.ts
 *
 * Typed reader + writer for the `autonomux_consent_v1` cookie.
 *
 * Why this file exists (GDPR + CCPA):
 * - GDPR Art. 7(1) — controller MUST be able to demonstrate consent.
 *   Cookie carries `set_at` (ISO8601) + `version` so an auditor / DPA
 *   request can reproduce what the user actually agreed to.
 * - GDPR Art. 7(3) — withdrawal MUST be as easy as giving consent.
 *   The same writer powers the banner, the preferences dialog, and the
 *   `/settings/consent` page — three surfaces, one source of truth.
 * - Recital 32 — consent must be a "clear affirmative action."  Defaults
 *   here are `analytics: false`, `marketing: false`. A missing cookie is
 *   NOT consent.
 *
 * Cookie attributes:
 * - `SameSite=Lax`, `Secure` (in production), `Path=/`, 12-month TTL.
 * - NOT `HttpOnly` — the banner needs to read its own state to decide
 *   whether to render. All other autonomux cookies remain HttpOnly.
 *
 * Version migration:
 * - If the cookie schema ever changes, bump `CURRENT_VERSION`. A cookie
 *   whose `version` does not match (or whose payload fails the Zod check)
 *   is treated as `pending` — banner re-renders, user re-consents.
 *
 * Server-readable (Next.js cookies()) AND client-readable
 * (document.cookie) by design — same parser, same schema.
 *
 * Owner: [Comply + Halo] · Phase 1.0-B9
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
//  Schema
// ─────────────────────────────────────────────────────────────────────────

export const CONSENT_COOKIE_NAME = "autonomux_consent_v1";
export const CURRENT_VERSION = "v1" as const;

/** 12 months in seconds — IAB / ICO common practice for consent TTL. */
export const CONSENT_TTL_SECONDS = 60 * 60 * 24 * 365;

export const ConsentStateSchema = z.object({
  state: z.enum(["pending", "rejected", "accepted_all", "custom"]),
  analytics: z.boolean(),
  marketing: z.boolean(),
  set_at: z.string().datetime({ offset: true }),
  version: z.literal("v1"),
});

export type ConsentState = z.infer<typeof ConsentStateSchema>;

/**
 * The default "pending" state — emitted when no cookie is present or when
 * the stored cookie fails schema/version validation.
 *
 * Pending means: no consent yet, treat analytics + marketing as DENIED,
 * and re-render the banner. Necessary cookies fire either way (session,
 * CSRF, the consent cookie itself).
 */
export function pendingConsent(): ConsentState {
  return {
    state: "pending",
    analytics: false,
    marketing: false,
    set_at: new Date(0).toISOString(),
    version: CURRENT_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  Cookie value codec — URL-safe, JSON, base64-free for debuggability.
// ─────────────────────────────────────────────────────────────────────────

function encode(state: ConsentState): string {
  return encodeURIComponent(JSON.stringify(state));
}

function decode(raw: string): ConsentState | null {
  try {
    const decoded = decodeURIComponent(raw);
    const parsed: unknown = JSON.parse(decoded);
    const result = ConsentStateSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Reader — server-side AND client-side.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Minimal cookie-jar shape we accept. Compatible with the Next.js
 * `RequestCookies` API surface from `next/headers` and the simpler shape
 * exposed in middleware / route handlers.
 *
 * We accept either:
 *   - { get(name): { value: string } | undefined }
 *   - a raw `Cookie:` header string
 *   - nothing — in which case we fall back to `document.cookie` in the
 *     browser, and to `pending` on the server.
 */
export interface ReadableCookies {
  get(name: string): { value: string } | undefined;
}

export type ConsentReadSource = ReadableCookies | string | undefined;

/**
 * Read the consent state from any context (server, client, middleware,
 * route handler). Returns `pendingConsent()` if no cookie or if the
 * stored value is malformed / version-mismatched.
 */
export function readConsentCookie(source?: ConsentReadSource): ConsentState {
  // 1. Explicit jar (server components / route handlers)
  if (source && typeof source !== "string") {
    const entry = source.get(CONSENT_COOKIE_NAME);
    if (!entry) return pendingConsent();
    return decode(entry.value) ?? pendingConsent();
  }

  // 2. Raw Cookie header string (middleware / edge)
  if (typeof source === "string") {
    const match = source
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${CONSENT_COOKIE_NAME}=`));
    if (!match) return pendingConsent();
    return decode(match.slice(CONSENT_COOKIE_NAME.length + 1)) ?? pendingConsent();
  }

  // 3. Client — document.cookie
  if (typeof document !== "undefined") {
    const match = document.cookie
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${CONSENT_COOKIE_NAME}=`));
    if (!match) return pendingConsent();
    return decode(match.slice(CONSENT_COOKIE_NAME.length + 1)) ?? pendingConsent();
  }

  return pendingConsent();
}

// ─────────────────────────────────────────────────────────────────────────
//  Writer — server-side AND client-side.
// ─────────────────────────────────────────────────────────────────────────

/** Shape we accept for server-side cookie writes (Next.js RequestCookies/ResponseCookies). */
export interface WritableCookies {
  set(args: {
    name: string;
    value: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
  }): void;
}

/**
 * Write the consent cookie.
 *
 * - On the server: pass a `WritableCookies` (e.g. the cookies() jar from
 *   a Server Action or a route handler's `response.cookies`).
 * - On the client: omit `target`; we write to `document.cookie` directly.
 *
 * NOTE: this cookie is intentionally NOT `HttpOnly` — the banner reads
 * its own state to decide whether to render. Every OTHER autonomux
 * cookie remains HttpOnly per Shield's session policy.
 */
export function writeConsentCookie(
  next: ConsentState,
  target?: WritableCookies,
): void {
  const value = encode(next);
  const isProd =
    typeof process !== "undefined" && process.env.NODE_ENV === "production";

  if (target) {
    target.set({
      name: CONSENT_COOKIE_NAME,
      value,
      httpOnly: false, // client must read its own consent state
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: CONSENT_TTL_SECONDS,
    });
    return;
  }

  if (typeof document === "undefined") {
    throw new Error(
      "[consent-cookie] writeConsentCookie called without a cookie jar in a non-browser context",
    );
  }

  const parts = [
    `${CONSENT_COOKIE_NAME}=${value}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${CONSENT_TTL_SECONDS}`,
  ];
  if (isProd) parts.push("Secure");
  document.cookie = parts.join("; ");
}

// ─────────────────────────────────────────────────────────────────────────
//  Convenience builders — used by the banner / dialog / settings page.
// ─────────────────────────────────────────────────────────────────────────

export function buildRejectedState(): ConsentState {
  return {
    state: "rejected",
    analytics: false,
    marketing: false,
    set_at: new Date().toISOString(),
    version: CURRENT_VERSION,
  };
}

export function buildAcceptAllState(): ConsentState {
  return {
    state: "accepted_all",
    analytics: true,
    marketing: true,
    set_at: new Date().toISOString(),
    version: CURRENT_VERSION,
  };
}

export function buildCustomState(input: {
  analytics: boolean;
  marketing: boolean;
}): ConsentState {
  return {
    state: "custom",
    analytics: input.analytics,
    marketing: input.marketing,
    set_at: new Date().toISOString(),
    version: CURRENT_VERSION,
  };
}
