/**
 * apps/web/app/auth/oauth/gcal/callback/route.ts
 *
 * GET handler — Google's OAuth 2.0 redirect lands here (Phase 1.1-C,
 * Scheduler sub-agent).
 *
 * Sequence (every step fails closed):
 *   1. Read `oauth_state_gcal` cookie + URL `state` param — they MUST match
 *      byte-for-byte. Defends against CSRF + replay.
 *   2. Verify state JWT signature + age (<10 min) + `purpose` binding.
 *   3. Re-resolve the current session user. The session user id MUST equal
 *      `claims.userId` — defends against a different user "completing" a
 *      grant initiated by someone else (e.g. a leaked URL).
 *   4. Read `code` + handle `error` per Google's redirect convention.
 *   5. Exchange code for tokens with the PKCE verifier from the JWT.
 *   6. Encrypt {access_token,refresh_token,scope,token_type} via @autonomux/cipher
 *      with `purpose:'oauth.gcal'` — the resulting envelope is the ONLY thing
 *      that touches Postgres.
 *   7. Upsert `connected_accounts` (one row per tenant+integration).
 *   8. Write `connected_account_events` row with `event_kind='oauth_granted'`
 *      capturing scope list + reissued-vs-renewed metadata.
 *   9. Clear the state cookie + 302 to /app/settings/integrations?connected=gcal.
 *
 * On ANY failure: write `oauth_failed` event row (when we have a tenantId)
 * and redirect to /app/settings/integrations?error=<code>.
 *
 * Owner: [Forge + Shield + Cipher]
 */

import { NextResponse, type NextRequest } from "next/server";

import { encrypt, type EncryptedEnvelope } from "@autonomux/cipher";
import type { Json } from "@autonomux/db/types";

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  exchangeCodeForTokens,
  getGcalOAuthConfig,
} from "@/lib/oauth/gcal";
import { verifyStateJwt } from "@/lib/oauth/state";
import { OAUTH_STATE_COOKIE_NAME } from "../start/route";

export const dynamic = "force-dynamic";

const OAUTH_PURPOSE = "oauth.gcal" as const;
const INTEGRATION = "gcal" as const;

function errRedirect(origin: string, code: string): NextResponse {
  const url = new URL("/app/settings/integrations", origin);
  url.searchParams.set("error", code);
  const res = NextResponse.redirect(url);
  // Always clear the state cookie on terminal failure — single-use.
  res.cookies.delete({
    name: OAUTH_STATE_COOKIE_NAME,
    path: "/auth/oauth/gcal",
  });
  return res;
}

function okRedirect(origin: string): NextResponse {
  const url = new URL("/app/settings/integrations", origin);
  url.searchParams.set("connected", INTEGRATION);
  const res = NextResponse.redirect(url);
  res.cookies.delete({
    name: OAUTH_STATE_COOKIE_NAME,
    path: "/auth/oauth/gcal",
  });
  return res;
}

/**
 * Best-effort write of an `oauth_failed` event. We only have the row id
 * to attach to if we already inserted one; otherwise we just no-op (no row
 * = nothing to attach events to per the FK shape). Caller passes a tenant
 * if known so cross-tenant `connected_account_events.tenant_id` stays right.
 */
async function recordFailureEvent(args: {
  tenantId: string;
  reason: string;
}): Promise<void> {
  // We need a connected_account_id for the FK, so look up (or create as
  // "error" status) the gcal row for this tenant so the event chain still
  // captures the failure even when no prior grant exists.
  const service = getSupabaseServiceClient();
  try {
    const { data: existing } = await service
      .from("connected_accounts")
      .select("id")
      .eq("tenant_id", args.tenantId)
      .eq("integration", INTEGRATION)
      .maybeSingle();

    let accountId = existing?.id ?? null;
    if (accountId === null) {
      const { data: inserted } = await service
        .from("connected_accounts")
        .insert({
          tenant_id: args.tenantId,
          integration: INTEGRATION,
          oauth_status: "error",
          last_error: args.reason.slice(0, 500),
        })
        .select("id")
        .single();
      accountId = inserted?.id ?? null;
    } else {
      await service
        .from("connected_accounts")
        .update({
          oauth_status: "error",
          last_error: args.reason.slice(0, 500),
        })
        .eq("id", accountId);
    }
    if (accountId !== null) {
      await service.from("connected_account_events").insert({
        connected_account_id: accountId,
        tenant_id: args.tenantId,
        event_kind: "error",
        payload: { stage: "oauth_failed", reason: args.reason } as Json,
      });
    }
  } catch {
    // event logging is best-effort — never throw out of the failure path.
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const origin = url.origin;

  // ---- 1. Google-side error first ----------------------------------------
  const googleError = url.searchParams.get("error");
  if (googleError !== null) {
    return errRedirect(origin, `google_${googleError}`);
  }

  // ---- 2. Read cookie + state param + equality check ---------------------
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;
  const paramState = url.searchParams.get("state");
  if (
    cookieState === undefined ||
    cookieState.length === 0 ||
    paramState === null ||
    paramState.length === 0
  ) {
    return errRedirect(origin, "state_missing");
  }
  if (cookieState !== paramState) {
    return errRedirect(origin, "state_mismatch");
  }

  // ---- 3. Verify JWT -----------------------------------------------------
  const verified = await verifyStateJwt(paramState);
  if (!verified.ok) {
    return errRedirect(origin, `state_${verified.reason}`);
  }
  const { tenantId, userId, verifier } = verified.claims;

  // The state JWT type is shared with Gmail; reject a Gmail-issued state
  // landing on the Calendar callback (cookie+param equality would already
  // catch this in practice, but defense in depth).
  if (verified.claims.provider !== "gcal") {
    await recordFailureEvent({ tenantId, reason: "wrong_provider_state" });
    return errRedirect(origin, "wrong_provider_state");
  }

  // ---- 4. Confirm current session === initiator --------------------------
  try {
    const supabase = await createClient();
    const sessionUser = await requireAuth(supabase);
    if (sessionUser.id !== userId) {
      await recordFailureEvent({
        tenantId,
        reason: "session_user_mismatch",
      });
      return errRedirect(origin, "session_user_mismatch");
    }
  } catch {
    return errRedirect(origin, "session_expired");
  }

  // ---- 5. Read code ------------------------------------------------------
  const code = url.searchParams.get("code");
  if (code === null || code.length === 0) {
    await recordFailureEvent({ tenantId, reason: "missing_code" });
    return errRedirect(origin, "missing_code");
  }

  // ---- 6. Exchange code for tokens ---------------------------------------
  let cfg: ReturnType<typeof getGcalOAuthConfig>;
  try {
    cfg = getGcalOAuthConfig();
  } catch {
    await recordFailureEvent({ tenantId, reason: "oauth_misconfigured" });
    return errRedirect(origin, "oauth_misconfigured");
  }

  let exchanged;
  try {
    exchanged = await exchangeCodeForTokens({
      code,
      verifier,
      redirectUri: cfg.redirectUri,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
    });
  } catch (err) {
    const reason =
      err instanceof Error ? `network_${err.message}` : "network_error";
    await recordFailureEvent({ tenantId, reason: reason.slice(0, 200) });
    return errRedirect(origin, "token_endpoint_unreachable");
  }

  if (!exchanged.ok) {
    const reason = `${exchanged.error}${exchanged.description !== undefined ? `: ${exchanged.description}` : ""}`;
    await recordFailureEvent({ tenantId, reason: reason.slice(0, 200) });
    return errRedirect(origin, `exchange_${exchanged.error}`);
  }
  const tokens = exchanged.tokens;

  // Defense-in-depth: with prompt=consent Google ALWAYS returns refresh_token.
  // If it didn't, the refresh path will break later — treat as a hard failure
  // now rather than persisting a half-grant.
  if (
    tokens.refresh_token === undefined ||
    tokens.refresh_token.length === 0
  ) {
    await recordFailureEvent({
      tenantId,
      reason: "no_refresh_token_in_response",
    });
    return errRedirect(origin, "no_refresh_token");
  }

  // ---- 7. Encrypt + persist ----------------------------------------------
  const plaintext = JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type,
  });

  let envelope: EncryptedEnvelope;
  try {
    envelope = await encrypt(plaintext, tenantId, OAUTH_PURPOSE);
  } catch (err) {
    const reason =
      err instanceof Error ? `cipher_${err.message}` : "cipher_failed";
    await recordFailureEvent({ tenantId, reason: reason.slice(0, 200) });
    return errRedirect(origin, "cipher_failed");
  }

  const scopeList = tokens.scope.split(/\s+/).filter((s) => s.length > 0);
  const expiresAtIso = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  const service = getSupabaseServiceClient();

  // Upsert by (tenant_id, integration) — that's the unique constraint set
  // by 0001_init.sql.
  const { data: existing } = await service
    .from("connected_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("integration", INTEGRATION)
    .maybeSingle();

  let accountId: string;
  if (existing === null || existing === undefined) {
    const { data: inserted, error: insertErr } = await service
      .from("connected_accounts")
      .insert({
        tenant_id: tenantId,
        integration: INTEGRATION,
        oauth_status: "active",
        scope_grants: scopeList,
        last_refresh_at: new Date().toISOString(),
        last_error: null,
        encrypted_credentials: envelope as unknown as Json,
        token_expires_at: expiresAtIso,
      })
      .select("id")
      .single();
    if (insertErr !== null || inserted === null) {
      await recordFailureEvent({
        tenantId,
        reason: `db_insert_${insertErr?.message ?? "unknown"}`.slice(0, 200),
      });
      return errRedirect(origin, "db_insert_failed");
    }
    accountId = inserted.id;
  } else {
    const { error: updateErr } = await service
      .from("connected_accounts")
      .update({
        oauth_status: "active",
        scope_grants: scopeList,
        last_refresh_at: new Date().toISOString(),
        last_error: null,
        encrypted_credentials: envelope as unknown as Json,
        token_expires_at: expiresAtIso,
      })
      .eq("id", existing.id);
    if (updateErr !== null) {
      await recordFailureEvent({
        tenantId,
        reason: `db_update_${updateErr.message}`.slice(0, 200),
      });
      return errRedirect(origin, "db_update_failed");
    }
    accountId = existing.id;
  }

  // ---- 8. Event row ------------------------------------------------------
  await service.from("connected_account_events").insert({
    connected_account_id: accountId,
    tenant_id: tenantId,
    event_kind: "oauth_granted",
    payload: {
      scopes: scopeList,
      token_type: tokens.token_type,
      expires_in_s: tokens.expires_in,
      // never include the access_token / refresh_token — they live ONLY
      // in encrypted_credentials.
    } as Json,
  });

  // ---- 9. Done -----------------------------------------------------------
  return okRedirect(origin);
}
