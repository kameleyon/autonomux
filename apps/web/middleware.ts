/**
 * apps/web/middleware.ts
 *
 * Per-request Supabase session refresh + route guard + request-id
 * propagation.
 *
 * Responsibilities:
 *   0. Generate (or reuse) an `x-request-id` (UUID v4) for log
 *      correlation across web → worker → DB. Stamped on every
 *      response, forwarded as a request header to downstream
 *      Server Components / Route Handlers so they can bind it to
 *      their child loggers. Owner: [Watch] / Phase 1.0-B5.
 *   1. Refresh the Supabase session cookie (the SSR client cannot do this
 *      from Server Components — App Router cookies are read-only there).
 *   2. Extract `tenant_id` from the JWT and attach it as `x-tenant-id`
 *      RESPONSE header. The header is for SERVER-SIDE log correlation
 *      only; we never trust it back from the client.
 *   3. Gate `/app/*` — unauthed → /sign-in; unverified email → /sign-in?check_email=1.
 *   4. Reverse-gate `/sign-in` and `/sign-up` — already-authed → /app.
 *
 * Owner: [Forge + Shield + Watch]
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  createServerClient as createSSRServerClient,
  type CookieOptions,
} from "@supabase/ssr";
/* Edge-runtime import: pull only the Web Crypto module, never the
 * @autonomux/auth barrel — the barrel transitively imports totp.ts
 * which uses `node:crypto` and webpack can't externalize that for
 * Edge. (Vercel build fix 2026-05-29) */
import {
  TWO_FA_SESSION_COOKIE_NAME,
  verifyTwoFaSessionToken,
} from "@autonomux/auth/two-fa-session";
import type { Database } from "@autonomux/db/types";
import { tryExtractJwtClaims } from "@autonomux/db/jwt";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const APP_PREFIX = "/app";
const AUTH_PAGES = new Set(["/sign-in", "/sign-up"]);
const REQUEST_ID_HEADER_NAME = "x-request-id";

/* Edge-runtime middleware does NOT import @/lib/logger / @autonomux/logger
 * — pino uses worker_threads + process internals that aren't available
 * in Vercel's Edge runtime. Request-id minting is the only logger
 * responsibility middleware needs, so we do it inline with Web Crypto.
 * Server Components, Route Handlers, and Server Actions still use the
 * full pino-based logger via @/lib/logger (they run in Node runtime).
 * (Vercel build fix 2026-05-29 — MIDDLEWARE_INVOCATION_FAILED.) */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function mintRequestId(inbound: string | null): string {
  return inbound !== null && UUID_V4_RE.test(inbound)
    ? inbound
    : crypto.randomUUID();
}
function attachRequestId(res: NextResponse, id: string): void {
  res.headers.set(REQUEST_ID_HEADER_NAME, id);
}

/* Defensive middleware (Vercel deploy hardening 2026-05-29):
 * If anything inside the gate/refresh logic throws — missing env vars,
 * Supabase outage, malformed cookie — we MUST NOT 500 the whole site.
 * Edge MIDDLEWARE_INVOCATION_FAILED takes every route down, including
 * the public marketing pages. So we fail-open: return `NextResponse.
 * next()` with diagnostic headers, and surface the reason via
 * `x-mw-degraded` so Vercel logs + DevTools show it without leaking
 * to end users.
 *
 * The downstream auth-required pages still gate themselves via the
 * Supabase server-component client, so fail-open here doesn't grant
 * access to /app/*.
 */
function failOpen(
  request: NextRequest,
  requestId: string,
  reason: string,
): NextResponse {
  const res = NextResponse.next({
    request: { headers: new Headers(request.headers) },
  });
  attachRequestId(res, requestId);
  res.headers.set("x-mw-degraded", reason);
  return res;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // ── 0. Request-id generation + propagation (Phase 1.0-B5) ────────────
  const requestId = mintRequestId(request.headers.get(REQUEST_ID_HEADER_NAME));
  request.headers.set(REQUEST_ID_HEADER_NAME, requestId);

  try {
    return await runMiddleware(request, requestId);
  } catch (err) {
    return failOpen(
      request,
      requestId,
      `crashed:${(err as Error)?.message ?? "unknown"}`.slice(0, 200),
    );
  }
}

async function runMiddleware(
  request: NextRequest,
  requestId: string,
): Promise<NextResponse> {
  const url = request.nextUrl;
  const pathname = url.pathname;

  // Build the response we'll mutate cookies / headers on.
  let response = NextResponse.next({
    request: { headers: new Headers(request.headers) },
  });
  attachRequestId(response, requestId);

  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
  const anonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "";
  if (supabaseUrl.length === 0 || anonKey.length === 0) {
    // Missing Supabase env vars — fail open. The downstream pages will
    // either render their public content or redirect to /sign-in via
    // their own auth check.
    return failOpen(request, requestId, "missing-supabase-env");
  }

  const supabase = createSSRServerClient<Database>(supabaseUrl, anonKey, {
    cookies: {
      getAll(): { name: string; value: string }[] {
        return request.cookies.getAll().map((c) => ({
          name: c.name,
          value: c.value,
        }));
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[],
      ): void {
        // Mirror cookie writes onto BOTH the inbound request (so downstream
        // route handlers see the refreshed session) and the outbound response
        // (so the browser persists it). This is the documented Supabase SSR
        // pattern for Next.js middleware.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({
          request: { headers: new Headers(request.headers) },
        });
        attachRequestId(response, requestId);
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set({
            name,
            value,
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
          });
        }
      },
    },
  });

  // CRITICAL: getUser() triggers the cookie-refresh side-effect above and
  // server-validates the JWT (which getSession() does NOT). Per Supabase
  // SSR docs, do not insert code between createServerClient and getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pull the access token for claim extraction (after getUser, so any
  // refresh has already landed).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = tryExtractJwtClaims(session?.access_token);

  // Attach tenant_id to the response headers — server-side trace correlation
  // only. Client code MUST NOT read this back as ground truth (it's not
  // signed; the JWT in the cookie is).
  if (claims !== null) {
    response.headers.set("x-tenant-id", claims.tenant_id);
  }

  const isAuthPage = AUTH_PAGES.has(pathname);
  const isAppRoute = pathname === APP_PREFIX || pathname.startsWith(`${APP_PREFIX}/`);
  const isSignedIn = user !== null;
  const isEmailVerified =
    isSignedIn &&
    user.email_confirmed_at !== null &&
    user.email_confirmed_at !== undefined;

  // 1. Unauthed users hitting /app/* → /sign-in (preserve return path).
  if (isAppRoute && !isSignedIn) {
    const redirectUrl = url.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(redirectUrl);
    attachRequestId(redirect, requestId);
    return redirect;
  }

  // 2. Authed but unverified email on /app/* → /sign-in?check_email=1.
  if (isAppRoute && isSignedIn && !isEmailVerified) {
    const redirectUrl = url.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("check_email", "1");
    const redirect = NextResponse.redirect(redirectUrl);
    attachRequestId(redirect, requestId);
    return redirect;
  }

  /**
   * Jury F-TRC-03 fix 2026-05-29: 2FA-pending gate. If the user has
   * a TOTP factor enrolled but their session cookie doesn't carry a
   * valid 2FA-session token, redirect any `/app/*` request to
   * `/sign-in/totp`. Without this gate password sign-in alone would
   * grant /app access — PRD §7.1 mandates the second factor.
   *
   * Performance: one extra Supabase service-role query per /app/*
   * request when the user is signed-in but no valid 2FA cookie is
   * present. We short-circuit when the cookie is valid (no query).
   */
  if (isAppRoute && isSignedIn && isEmailVerified) {
    const secret = process.env.AUTH_STEP_UP_SECRET ?? "";
    const cookieValue = request.cookies.get(TWO_FA_SESSION_COOKIE_NAME)?.value;
    const twoFaToken =
      secret.length >= 32
        ? await verifyTwoFaSessionToken(cookieValue, {
            userId: user.id,
            secret,
          })
        : null;

    if (twoFaToken === null) {
      // Cookie missing/expired/invalid. Check whether the user has any
      // TOTP factor enrolled — if not, allow through (TOTP isn't
      // enrolled yet; onboarding handles the enrollment flow on first
      // visit).
      const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      if (serviceUrl.length > 0 && serviceKey.length > 0) {
        const svc = createServiceClient<Database>(serviceUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: factor } = await svc
          .from("user_2fa_factors")
          .select("id")
          .eq("user_id", user.id)
          .eq("kind", "totp")
          .is("revoked_at", null)
          .limit(1)
          .maybeSingle();
        if (factor !== null) {
          const redirectUrl = url.clone();
          redirectUrl.pathname = "/sign-in/totp";
          redirectUrl.searchParams.set("next", pathname);
          const redirect = NextResponse.redirect(redirectUrl);
          attachRequestId(redirect, requestId);
          return redirect;
        }
      }
    }
  }

  // 3. Authed users hitting /sign-in or /sign-up → /app.
  if (isAuthPage && isSignedIn && isEmailVerified) {
    const redirectUrl = url.clone();
    redirectUrl.pathname = "/app";
    redirectUrl.search = "";
    const redirect = NextResponse.redirect(redirectUrl);
    attachRequestId(redirect, requestId);
    return redirect;
  }

  return response;
}

/**
 * Run on every page request, but skip Next.js internals, static assets,
 * and the auth/callback route handler (it manages its own cookies via
 * exchangeCodeForSession).
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|auth/callback).*)",
  ],
};
