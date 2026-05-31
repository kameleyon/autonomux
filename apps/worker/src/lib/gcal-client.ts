/**
 * apps/worker/src/lib/gcal-client.ts
 *
 * Thin Google Calendar REST wrapper for the Scheduler worker.
 *
 * Design notes:
 *   - Same shape as `gmail-client.ts` — direct `fetch` against Google's
 *     REST API to avoid pulling in the multi-MB `googleapis` package.
 *   - OAuth tokens live in `connected_accounts.encrypted_credentials` as a
 *     cipher envelope (purpose='oauth.gcal'). The columns ship in migration
 *     0011 and are accessed via service role.
 *   - On 401 (or token_expires_at in the past), we refresh via Google's
 *     refresh_token flow, re-encrypt, persist back, and retry the call once.
 *     If the refresh itself fails we mark the account `oauth_status='expired'`
 *     and write a `connected_account_events` row with
 *     `event_kind='oauth_expired'`, then throw `GcalNotConnectedError` so
 *     the engine can ask the user to reconnect.
 *
 * Owner: [Forge + Cipher]
 */

import { decrypt, encrypt, type EncryptedEnvelope } from "@autonomux/cipher";
import {
  createServiceClient,
  type Database,
} from "@autonomux/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "pino";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Raised when the tenant has no active Google Calendar connection, OR the
 * refresh token has been revoked / expired beyond recovery. The Scheduler
 * worker catches this and surfaces an `oauth.missing` event to the agent-bus
 * so the orchestrator can prompt the user to reconnect via
 * /auth/oauth/gcal.
 */
export class GcalNotConnectedError extends Error {
  public readonly kind: "missing" | "revoked" | "refresh_failed";

  public constructor(
    kind: "missing" | "revoked" | "refresh_failed",
    message: string,
  ) {
    super(message);
    this.name = "GcalNotConnectedError";
    this.kind = kind;
  }
}

/**
 * Raised for any other Google Calendar API error (rate limit, 5xx, network).
 * Caller decides whether to retry — usually BullMQ handles via backoff.
 */
export class GcalApiError extends Error {
  public readonly status: number;
  public readonly body: string;

  public constructor(status: number, message: string, body: string) {
    super(message);
    this.name = "GcalApiError";
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Google Calendar REST types (only the fields we read)
// ---------------------------------------------------------------------------

/**
 * Google returns one of `dateTime` (timed events, RFC3339 with offset) or
 * `date` (all-day, YYYY-MM-DD). `timeZone` is optional and applies to the
 * `dateTime` form.
 */
export interface GcalEventTime {
  readonly dateTime?: string;
  readonly date?: string;
  readonly timeZone?: string;
}

export interface GcalEventAttendee {
  readonly email?: string;
  readonly displayName?: string;
  readonly responseStatus?: string;
  readonly self?: boolean;
  readonly organizer?: boolean;
}

export interface GcalEventOrganizer {
  readonly email?: string;
  readonly displayName?: string;
  readonly self?: boolean;
}

/**
 * Subset of the Google Calendar Event resource that the Scheduler engine
 * needs. The shape mirrors Google's REST response so callers can stay close
 * to the wire format without translation overhead.
 */
export interface GcalEventListEntry {
  readonly id: string;
  readonly status: string;
  readonly summary?: string;
  readonly location?: string;
  readonly start: GcalEventTime;
  readonly end: GcalEventTime;
  readonly attendees?: readonly GcalEventAttendee[];
  readonly organizer?: GcalEventOrganizer;
  readonly htmlLink?: string;
}

export interface GcalCalendar {
  readonly id: string;
  readonly summary: string;
  readonly timeZone: string;
}

// ---------------------------------------------------------------------------
// Token envelope shape stored inside encrypted_credentials
// ---------------------------------------------------------------------------

interface StoredCredentials {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: string;
  readonly scope: string;
}

// ---------------------------------------------------------------------------
// connected_accounts row — accessed via service role, columns added in 0011
// ---------------------------------------------------------------------------

interface ConnectedAccountRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly integration: string;
  readonly oauth_status: string;
  /** Cipher envelope JSON — present once migration 0011 is applied. */
  readonly encrypted_credentials: EncryptedEnvelope | null;
  /** ISO-8601 timestamp, ditto. */
  readonly token_expires_at: string | null;
}

// ---------------------------------------------------------------------------
// Public client factory
// ---------------------------------------------------------------------------

export interface GcalClientDeps {
  readonly logger: Logger;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Optional override (defaults to service-role supabase). */
  readonly supabase?: SupabaseClient<Database>;
  /** Optional override for tests. */
  readonly fetchImpl?: typeof fetch;
}

export interface GcalClient {
  listEventsBetween(
    tenantId: string,
    calendarId: string,
    startIso: string,
    endIso: string,
    maxResults: number,
  ): Promise<readonly GcalEventListEntry[]>;
  listPrimaryCalendar(tenantId: string): Promise<GcalCalendar>;
}

const GCAL_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
/** Refresh `token_expires_at - skew` to avoid in-flight expiry. */
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const OAUTH_PURPOSE = "oauth.gcal" as const;
const INTEGRATION_NAME = "gcal" as const;

export function createGcalClient(deps: GcalClientDeps): GcalClient {
  const log = deps.logger.child({ component: "gcal-client" });
  const sb = deps.supabase ?? createServiceClient();
  const fetchImpl = deps.fetchImpl ?? fetch;

  // -------------------------------------------------------------------------
  // Token plumbing
  // -------------------------------------------------------------------------

  async function loadAccount(tenantId: string): Promise<ConnectedAccountRow> {
    const { data, error } = await sb
      .from("connected_accounts")
      .select(
        "id, tenant_id, integration, oauth_status, encrypted_credentials, token_expires_at",
      )
      .eq("tenant_id", tenantId)
      .eq("integration", INTEGRATION_NAME)
      .maybeSingle();

    if (error !== null) {
      throw new Error(
        `[gcal-client] failed to load connected_accounts row: ${error.message}`,
      );
    }
    if (data === null) {
      throw new GcalNotConnectedError(
        "missing",
        `tenant ${tenantId} has no gcal connected_accounts row`,
      );
    }

    // Cast through unknown until 0011 lands and types regen. The runtime
    // shape is checked below.
    const row = data as unknown as ConnectedAccountRow;
    if (row.oauth_status === "revoked") {
      throw new GcalNotConnectedError(
        "revoked",
        `tenant ${tenantId} gcal oauth_status='revoked'`,
      );
    }
    if (row.encrypted_credentials === null) {
      throw new GcalNotConnectedError(
        "missing",
        `tenant ${tenantId} gcal row has no encrypted_credentials (migration 0011 pending or never granted)`,
      );
    }
    return row;
  }

  async function decryptCredentials(
    row: ConnectedAccountRow,
  ): Promise<StoredCredentials> {
    if (row.encrypted_credentials === null) {
      throw new GcalNotConnectedError(
        "missing",
        "encrypted_credentials is null",
      );
    }
    const bytes = await decrypt(
      row.encrypted_credentials,
      row.tenant_id,
      OAUTH_PURPOSE,
    );
    const json = Buffer.from(bytes).toString("utf8");
    const parsed = JSON.parse(json) as Partial<StoredCredentials>;
    if (
      typeof parsed.access_token !== "string" ||
      typeof parsed.refresh_token !== "string"
    ) {
      throw new GcalNotConnectedError(
        "missing",
        "decrypted credentials missing access_token/refresh_token",
      );
    }
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      token_type: parsed.token_type ?? "Bearer",
      scope: parsed.scope ?? "",
    };
  }

  function isAccessExpired(row: ConnectedAccountRow): boolean {
    if (row.token_expires_at === null) return false; // unknown → trust until 401
    const expiresMs = Date.parse(row.token_expires_at);
    if (Number.isNaN(expiresMs)) return true;
    return expiresMs - TOKEN_EXPIRY_SKEW_MS <= Date.now();
  }

  async function refreshAccessToken(
    row: ConnectedAccountRow,
    creds: StoredCredentials,
  ): Promise<StoredCredentials> {
    const body = new URLSearchParams({
      client_id: deps.clientId,
      client_secret: deps.clientSecret,
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    });

    const res = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await safeReadBody(res);
      log.warn(
        { status: res.status, tenantId: row.tenant_id },
        "gcal refresh failed",
      );
      await markOauthExpired(row, errText);
      throw new GcalNotConnectedError(
        "refresh_failed",
        `gcal refresh failed: ${res.status} ${errText}`,
      );
    }

    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
      refresh_token?: string;
    };

    if (typeof json.access_token !== "string") {
      await markOauthExpired(row, "no access_token in refresh response");
      throw new GcalNotConnectedError(
        "refresh_failed",
        "refresh response missing access_token",
      );
    }

    const next: StoredCredentials = {
      access_token: json.access_token,
      // Google may or may not rotate the refresh_token. Keep the old one
      // when not returned.
      refresh_token: json.refresh_token ?? creds.refresh_token,
      token_type: json.token_type ?? creds.token_type,
      scope: json.scope ?? creds.scope,
    };

    const expiresAtIso = new Date(
      Date.now() + (json.expires_in ?? 3600) * 1000,
    ).toISOString();
    await persistCredentials(row, next, expiresAtIso);
    await writeAccountEvent(row, "oauth_refreshed", {
      expires_at: expiresAtIso,
    });
    return next;
  }

  async function persistCredentials(
    row: ConnectedAccountRow,
    creds: StoredCredentials,
    expiresAtIso: string,
  ): Promise<void> {
    const envelope = await encrypt(
      JSON.stringify(creds),
      row.tenant_id,
      OAUTH_PURPOSE,
    );

    // Columns ship in 0011 — cast the update through unknown for now.
    const updatePayload = {
      encrypted_credentials: envelope,
      token_expires_at: expiresAtIso,
      oauth_status: "active",
      last_refresh_at: new Date().toISOString(),
    } as unknown as Record<string, unknown>;

    const { error } = await sb
      .from("connected_accounts")
      .update(updatePayload)
      .eq("id", row.id);
    if (error !== null) {
      throw new Error(
        `[gcal-client] failed to persist refreshed credentials: ${error.message}`,
      );
    }
  }

  async function markOauthExpired(
    row: ConnectedAccountRow,
    reason: string,
  ): Promise<void> {
    const { error } = await sb
      .from("connected_accounts")
      .update({
        oauth_status: "expired",
        last_error: reason.slice(0, 500),
      })
      .eq("id", row.id);
    if (error !== null) {
      log.error(
        { err: error, tenantId: row.tenant_id },
        "failed to mark connected_account expired",
      );
    }
    await writeAccountEvent(row, "oauth_expired", { reason });
  }

  async function writeAccountEvent(
    row: ConnectedAccountRow,
    kind:
      | "oauth_granted"
      | "oauth_refreshed"
      | "oauth_expired"
      | "oauth_revoked"
      | "scope_changed"
      | "error",
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await sb.from("connected_account_events").insert({
      connected_account_id: row.id,
      tenant_id: row.tenant_id,
      event_kind: kind,
      payload,
    });
    if (error !== null) {
      log.error(
        { err: error, tenantId: row.tenant_id, kind },
        "failed to write connected_account_events row",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Authed fetch with refresh-on-401
  // -------------------------------------------------------------------------

  async function authedFetch(
    tenantId: string,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    let row = await loadAccount(tenantId);
    let creds = await decryptCredentials(row);

    if (isAccessExpired(row)) {
      creds = await refreshAccessToken(row, creds);
      row = await loadAccount(tenantId);
    }

    const send = async (token: string): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      if (!headers.has("accept")) headers.set("accept", "application/json");
      return fetchImpl(`${GCAL_API_BASE}${path}`, { ...init, headers });
    };

    let res = await send(creds.access_token);
    if (res.status === 401) {
      // Token rejected — refresh and retry exactly once.
      creds = await refreshAccessToken(row, creds);
      res = await send(creds.access_token);
    }
    if (!res.ok) {
      const body = await safeReadBody(res);
      throw new GcalApiError(
        res.status,
        `gcal ${init.method ?? "GET"} ${path} failed: ${res.status}`,
        body,
      );
    }
    return res;
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  return {
    async listEventsBetween(
      tenantId: string,
      calendarId: string,
      startIso: string,
      endIso: string,
      maxResults: number,
    ): Promise<readonly GcalEventListEntry[]> {
      const startMs = Date.parse(startIso);
      const endMs = Date.parse(endIso);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        throw new Error(
          `[gcal-client] invalid range: startIso=${startIso} endIso=${endIso}`,
        );
      }
      if (endMs <= startMs) {
        throw new Error(
          `[gcal-client] endIso must be strictly after startIso (start=${startIso}, end=${endIso})`,
        );
      }
      const cappedMax = Math.max(1, Math.min(2500, Math.floor(maxResults)));

      const params = new URLSearchParams({
        timeMin: startIso,
        timeMax: endIso,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: String(cappedMax),
      });
      const res = await authedFetch(
        tenantId,
        `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        { method: "GET" },
      );
      const json = (await res.json()) as {
        items?: readonly GcalEventListEntry[];
      };
      return json.items ?? [];
    },

    async listPrimaryCalendar(tenantId: string): Promise<GcalCalendar> {
      const res = await authedFetch(tenantId, "/calendars/primary", {
        method: "GET",
      });
      const json = (await res.json()) as Partial<GcalCalendar>;
      if (
        typeof json.id !== "string" ||
        typeof json.summary !== "string" ||
        typeof json.timeZone !== "string"
      ) {
        throw new GcalApiError(
          500,
          "gcal listPrimaryCalendar returned incomplete calendar resource",
          JSON.stringify(json),
        );
      }
      return {
        id: json.id,
        summary: json.summary,
        timeZone: json.timeZone,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function safeReadBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
