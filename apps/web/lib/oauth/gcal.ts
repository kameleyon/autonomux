/**
 * apps/web/lib/oauth/gcal.ts
 *
 * Pure helpers around Google's OAuth 2.0 endpoints for the Google Calendar
 * (Scheduler sub-agent) flow — Phase 1.1-C.
 *
 * No npm dependency: everything is `fetch` + `URLSearchParams`. Stateless —
 * the route handlers in app/auth/oauth/gcal/{start,callback}/route.ts
 * compose these with the env reader and the state-JWT helper.
 *
 * Scope policy:
 *   - Read-only `calendar.readonly` plus `openid email` so we can identify
 *     the connected account. The Scheduler sub-agent never writes to the
 *     user's calendar — it only triages events and surfaces conflicts.
 *
 * Owner: [Forge + Shield + Cipher]
 */

import "server-only";

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const GOOGLE_AUTHORIZE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/**
 * Name of the HttpOnly cookie that holds the signed state JWT during the
 * OAuth round-trip. Lives here (not in the route module) because Next.js 15
 * `route.ts` files are restricted to a fixed allowlist of named exports
 * (GET / POST / dynamic / runtime / etc.); a non-handler export breaks the
 * build with "is not a valid Route export field."
 */
export const OAUTH_STATE_COOKIE_NAME = "oauth_state_gcal";

// ---------------------------------------------------------------------------
// Scope selection
// ---------------------------------------------------------------------------

export const GCAL_SCOPE_READONLY =
  "https://www.googleapis.com/auth/calendar.readonly";
export const GCAL_OIDC_SCOPES = "openid email";

/**
 * The space-delimited Calendar scope set we request. Read-only Calendar plus
 * the OIDC scopes (`openid email`) so the callback can record which Google
 * account was connected without an extra userinfo round-trip.
 */
export function resolveGcalScope(): string {
  return `${GCAL_SCOPE_READONLY} ${GCAL_OIDC_SCOPES}`;
}

// ---------------------------------------------------------------------------
// Env readers — throw with actionable messages so misconfig fails at boot,
// not in the middle of an OAuth dance.
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    throw new Error(`[oauth/gcal] Missing required env: ${name}`);
  }
  return v;
}

export function getGcalOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  return {
    clientId: requireEnv("GCAL_OAUTH_CLIENT_ID"),
    clientSecret: requireEnv("GCAL_OAUTH_CLIENT_SECRET"),
    redirectUri: requireEnv("GCAL_OAUTH_REDIRECT_URI"),
  };
}

// ---------------------------------------------------------------------------
// 1. buildAuthorizeUrl
// ---------------------------------------------------------------------------

export interface AuthorizeUrlOpts {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
}

/**
 * Compose the Google OAuth 2.0 authorize URL with PKCE + offline access.
 *
 * `access_type=offline` + `prompt=consent` together guarantee Google returns
 * a refresh_token on EVERY consent — without `prompt=consent` Google omits
 * the refresh_token on re-consent which silently breaks our refresh path.
 *
 * `include_granted_scopes=true` lets a user incrementally add Calendar to a
 * prior Gmail grant without re-confirming the older scope set.
 */
export function buildAuthorizeUrl(opts: AuthorizeUrlOpts): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scope,
    access_type: "offline",
    prompt: "consent",
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    state: opts.state,
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// 2. exchangeCodeForTokens
// ---------------------------------------------------------------------------

export interface TokenExchangeInput {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Successful Google token-endpoint response shape.
 * `refresh_token` is OPTIONAL per spec — Google only returns it on the FIRST
 * consent unless `prompt=consent` is set (we set it, so we always get one).
 */
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

/**
 * Google's error envelope from the token endpoint.
 *   { error: 'invalid_grant', error_description?: '...' }
 */
export interface GoogleTokenError {
  error: string;
  error_description?: string;
}

export type ExchangeResult =
  | { ok: true; tokens: GoogleTokenResponse }
  | { ok: false; status: number; error: string; description?: string };

/**
 * Exchange an authorization code for tokens. Caller passes the verifier
 * that was used to derive the challenge in the start handler.
 *
 * We do NOT throw on Google's structured error response (4xx with JSON body)
 * — callers want to redirect to the integrations page with a reason code.
 * Network errors (Google unreachable) DO throw — those are operational
 * incidents the caller wraps in try/catch + writes an event row.
 */
export async function exchangeCodeForTokens(
  input: TokenExchangeInput,
): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code_verifier: input.verifier,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    let parsed: GoogleTokenError | null = null;
    try {
      parsed = (await res.json()) as GoogleTokenError;
    } catch {
      // body wasn't JSON — fall through to generic error
    }
    return {
      ok: false,
      status: res.status,
      error: parsed?.error ?? `http_${res.status}`,
      description: parsed?.error_description,
    };
  }

  let tokens: GoogleTokenResponse;
  try {
    tokens = (await res.json()) as GoogleTokenResponse;
  } catch {
    return {
      ok: false,
      status: res.status,
      error: "invalid_json",
      description: "Token endpoint returned non-JSON response",
    };
  }

  // Shape guard — Google might one day rename a field; better to fail closed
  // than to persist a malformed envelope.
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.expires_in !== "number" ||
    typeof tokens.scope !== "string" ||
    typeof tokens.token_type !== "string"
  ) {
    return {
      ok: false,
      status: res.status,
      error: "invalid_shape",
      description:
        "Token endpoint response missing required fields (access_token/expires_in/scope/token_type)",
    };
  }

  return { ok: true, tokens };
}

// ---------------------------------------------------------------------------
// 3. revokeToken
// ---------------------------------------------------------------------------

export type RevokeResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Revoke an access_token (or refresh_token) at Google.
 *
 * Per Google's docs revoking the access_token revokes the entire grant
 * (refresh_token included). 200 = success, 400 = `invalid_token` (already
 * expired or never existed). We treat 400 as a SOFT failure — the local
 * disconnect path proceeds anyway, otherwise users get stuck if Google
 * already invalidated the token on its side.
 */
export async function revokeToken(accessToken: string): Promise<RevokeResult> {
  const body = new URLSearchParams({ token: accessToken });
  const res = await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (res.ok) return { ok: true };

  let error = `http_${res.status}`;
  try {
    const parsed = (await res.json()) as { error?: string };
    if (typeof parsed.error === "string") error = parsed.error;
  } catch {
    // ignore
  }
  return { ok: false, status: res.status, error };
}
