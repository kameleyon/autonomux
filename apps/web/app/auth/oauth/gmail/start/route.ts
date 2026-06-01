/**
 * apps/web/app/auth/oauth/gmail/start/route.ts
 *
 * GET handler — initiates the Gmail OAuth 2.0 flow (Sprint D §4 / Cluster D).
 *
 * Sequence:
 *   1. requireAuth + requireTenantId — the user must already be in /app.
 *   2. Generate PKCE verifier (32B random) → derive S256 challenge.
 *   3. Generate CSRF nonce (16B random).
 *   4. Mint a signed state JWT carrying { tenantId, userId, verifier, nonce }.
 *   5. Stash the JWT in an HttpOnly cookie (`oauth_state_gmail`, 10-min TTL,
 *      SameSite=Lax so it survives the round-trip back from Google).
 *   6. Build the Google authorize URL with the same JWT as `state`.
 *   7. 302 to Google.
 *
 * Why both cookie AND state param? CSRF defense: the callback only trusts
 * a state JWT if the URL's `state` param EQUALS the cookie body. An
 * attacker who forges a redirect URL has the URL but not the HttpOnly
 * cookie, and vice versa.
 *
 * SameSite policy: `lax` not `strict` because Google's consent redirect
 * is a cross-site GET — `strict` would strip the cookie and the callback
 * would always fail the nonce check.
 *
 * Owner: [Forge + Shield]
 */

import { NextResponse, type NextRequest } from "next/server";

import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import {
  buildAuthorizeUrl,
  getGmailOAuthConfig,
  OAUTH_STATE_COOKIE_NAME,
  resolveGmailScope,
} from "@/lib/oauth/gmail";
import {
  deriveS256Challenge,
  generateNonce,
  generatePkceVerifier,
  mintStateJwt,
  OAUTH_STATE_TTL_MS,
} from "@/lib/oauth/state";

export const dynamic = "force-dynamic";

function integrationsErrorRedirect(
  origin: string,
  code: string,
): NextResponse {
  const url = new URL("/app/settings/integrations", origin);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;

  // 1. Auth + tenant
  let userId: string;
  let tenantId: string;
  try {
    const supabase = await createClient();
    const user = await requireAuth(supabase);
    userId = user.id;
    tenantId = await requireTenantId(supabase);
  } catch (err) {
    // Not signed in / no tenant — middleware should have already routed,
    // but we double-defend. Send to sign-in.
    const fail = new URL("/sign-in", origin);
    fail.searchParams.set(
      "auth_error",
      err instanceof Error ? err.message : "Authentication required",
    );
    return NextResponse.redirect(fail);
  }

  // 2. Env (fail closed if operator missed a var — log a stable code rather
  // than leak the missing var name in a URL).
  let cfg: ReturnType<typeof getGmailOAuthConfig>;
  try {
    cfg = getGmailOAuthConfig();
  } catch {
    return integrationsErrorRedirect(origin, "oauth_misconfigured");
  }

  // 3-4. PKCE + state
  const verifier = generatePkceVerifier();
  const challenge = await deriveS256Challenge(verifier);
  const nonce = generateNonce();

  let stateJwt: string;
  try {
    stateJwt = await mintStateJwt({
      provider: "gmail",
      tenantId,
      userId,
      verifier,
      nonce,
    });
  } catch {
    return integrationsErrorRedirect(origin, "oauth_state_secret_missing");
  }

  // 5. Build Google URL
  const authorizeUrl = buildAuthorizeUrl({
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    scope: resolveGmailScope(),
    state: stateJwt,
    codeChallenge: challenge,
  });

  // 6. Set cookie + redirect
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set({
    name: OAUTH_STATE_COOKIE_NAME,
    value: stateJwt,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/oauth/gmail",
    maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
  });
  return res;
}
