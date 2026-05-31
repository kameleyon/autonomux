/**
 * apps/worker/src/lib/gmail-client.ts
 *
 * Thin Gmail REST wrapper for the Mailroom worker.
 *
 * Design notes:
 *   - We deliberately do NOT depend on `googleapis` — that package is large
 *     (>5MB) and we only need a handful of REST endpoints. Direct `fetch`
 *     against Google's REST API keeps the worker bundle lean.
 *   - OAuth tokens live in `connected_accounts.encrypted_credentials` as a
 *     cipher envelope (see packages/cipher/envelope.ts, purpose='oauth.gmail').
 *     The `encrypted_credentials` + `token_expires_at` columns land in
 *     migration 0011 — they are not yet in the typed schema, so we access
 *     them via a manual rest query and treat the columns as `unknown` until
 *     0011 ships and types are regenerated.
 *   - On 401 (or token_expires_at in the past), we refresh via Google's
 *     refresh_token flow, re-encrypt, persist back, and retry the call once.
 *     If the refresh itself fails we mark the account `oauth_status='expired'`
 *     and write a `connected_account_events` row with
 *     `event_kind='oauth_expired'`, then throw `GmailNotConnectedError` so
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
 * Raised when the tenant has no active Gmail connection, OR the refresh
 * token has been revoked / expired beyond recovery. The Mailroom engine
 * catches this and surfaces an `oauth.missing` event to the agent-bus so
 * the orchestrator can prompt the user to reconnect via /auth/oauth/gmail.
 */
export class GmailNotConnectedError extends Error {
  public readonly kind: "missing" | "revoked" | "refresh_failed";

  public constructor(
    kind: "missing" | "revoked" | "refresh_failed",
    message: string,
  ) {
    super(message);
    this.name = "GmailNotConnectedError";
    this.kind = kind;
  }
}

/**
 * Raised for any other Gmail-API error (rate limit, 5xx, network).
 * Caller decides whether to retry — usually BullMQ handles via backoff.
 */
export class GmailApiError extends Error {
  public readonly status: number;
  public readonly body: string;

  public constructor(status: number, message: string, body: string) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Gmail REST types (only the fields we read)
// ---------------------------------------------------------------------------

export interface GmailMessageListEntry {
  readonly id: string;
  readonly threadId: string;
}

export interface GmailMessage {
  readonly id: string;
  readonly threadId: string;
  readonly labelIds: readonly string[];
  readonly snippet: string;
  readonly internalDate: string;
  readonly payload: GmailMessagePayload;
}

export interface GmailMessagePayload {
  readonly headers: readonly { name: string; value: string }[];
  readonly mimeType?: string;
  readonly body?: { data?: string; size?: number };
  readonly parts?: readonly GmailMessagePayload[];
}

export interface CreateDraftPayload {
  /** Raw RFC-822 message bytes, base64url-encoded. */
  readonly rawBase64url: string;
  readonly threadId?: string;
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

export interface GmailClientDeps {
  readonly logger: Logger;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Optional override (defaults to service-role supabase). */
  readonly supabase?: SupabaseClient<Database>;
  /** Optional override for tests. */
  readonly fetchImpl?: typeof fetch;
}

export interface GmailClient {
  listMessagesSince(
    tenantId: string,
    sinceIso: string,
    maxResults: number,
  ): Promise<readonly GmailMessageListEntry[]>;
  getMessage(tenantId: string, id: string): Promise<GmailMessage>;
  addLabel(tenantId: string, msgId: string, label: string): Promise<void>;
  archive(tenantId: string, msgId: string): Promise<void>;
  createDraft(tenantId: string, payload: CreateDraftPayload): Promise<{ id: string }>;
}

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
/** Refresh `token_expires_at - skew` to avoid in-flight expiry. */
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const OAUTH_PURPOSE = "oauth.gmail" as const;

export function createGmailClient(deps: GmailClientDeps): GmailClient {
  const log = deps.logger.child({ component: "gmail-client" });
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
      .eq("integration", "gmail")
      .maybeSingle();

    if (error !== null) {
      throw new Error(
        `[gmail-client] failed to load connected_accounts row: ${error.message}`,
      );
    }
    if (data === null) {
      throw new GmailNotConnectedError(
        "missing",
        `tenant ${tenantId} has no gmail connected_accounts row`,
      );
    }

    // Cast through unknown until 0011 lands and types regen. The runtime
    // shape is checked below.
    const row = data as unknown as ConnectedAccountRow;
    if (row.oauth_status === "revoked") {
      throw new GmailNotConnectedError(
        "revoked",
        `tenant ${tenantId} gmail oauth_status='revoked'`,
      );
    }
    if (row.encrypted_credentials === null) {
      throw new GmailNotConnectedError(
        "missing",
        `tenant ${tenantId} gmail row has no encrypted_credentials (migration 0011 pending or never granted)`,
      );
    }
    return row;
  }

  async function decryptCredentials(
    row: ConnectedAccountRow,
  ): Promise<StoredCredentials> {
    if (row.encrypted_credentials === null) {
      throw new GmailNotConnectedError(
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
      throw new GmailNotConnectedError(
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
        "gmail refresh failed",
      );
      await markOauthExpired(row, errText);
      throw new GmailNotConnectedError(
        "refresh_failed",
        `gmail refresh failed: ${res.status} ${errText}`,
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
      throw new GmailNotConnectedError(
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
        `[gmail-client] failed to persist refreshed credentials: ${error.message}`,
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
      return fetchImpl(`${GMAIL_API_BASE}${path}`, { ...init, headers });
    };

    let res = await send(creds.access_token);
    if (res.status === 401) {
      // Token rejected — refresh and retry exactly once.
      creds = await refreshAccessToken(row, creds);
      res = await send(creds.access_token);
    }
    if (!res.ok) {
      const body = await safeReadBody(res);
      throw new GmailApiError(
        res.status,
        `gmail ${init.method ?? "GET"} ${path} failed: ${res.status}`,
        body,
      );
    }
    return res;
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  return {
    async listMessagesSince(
      tenantId: string,
      sinceIso: string,
      maxResults: number,
    ): Promise<readonly GmailMessageListEntry[]> {
      const sinceEpochSec = Math.floor(Date.parse(sinceIso) / 1000);
      if (!Number.isFinite(sinceEpochSec)) {
        throw new Error(`[gmail-client] invalid sinceIso: ${sinceIso}`);
      }
      const cappedMax = Math.max(1, Math.min(500, Math.floor(maxResults)));

      const params = new URLSearchParams({
        q: `after:${sinceEpochSec}`,
        maxResults: String(cappedMax),
      });
      const res = await authedFetch(tenantId, `/messages?${params.toString()}`, {
        method: "GET",
      });
      const json = (await res.json()) as {
        messages?: readonly { id: string; threadId: string }[];
      };
      return json.messages ?? [];
    },

    async getMessage(tenantId: string, id: string): Promise<GmailMessage> {
      const params = new URLSearchParams({ format: "full" });
      const res = await authedFetch(
        tenantId,
        `/messages/${encodeURIComponent(id)}?${params.toString()}`,
        { method: "GET" },
      );
      const json = (await res.json()) as GmailMessage;
      return json;
    },

    async addLabel(
      tenantId: string,
      msgId: string,
      label: string,
    ): Promise<void> {
      await authedFetch(
        tenantId,
        `/messages/${encodeURIComponent(msgId)}/modify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ addLabelIds: [label] }),
        },
      );
    },

    async archive(tenantId: string, msgId: string): Promise<void> {
      await authedFetch(
        tenantId,
        `/messages/${encodeURIComponent(msgId)}/modify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
        },
      );
    },

    async createDraft(
      tenantId: string,
      payload: CreateDraftPayload,
    ): Promise<{ id: string }> {
      const body: Record<string, unknown> = {
        message: {
          raw: payload.rawBase64url,
          ...(payload.threadId !== undefined
            ? { threadId: payload.threadId }
            : {}),
        },
      };
      const res = await authedFetch(tenantId, "/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { id?: string };
      if (typeof json.id !== "string") {
        throw new GmailApiError(
          500,
          "gmail createDraft returned no id",
          JSON.stringify(json),
        );
      }
      return { id: json.id };
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

/**
 * Extract a single header value (case-insensitive) from a Gmail message
 * payload. Helper kept in this module so the engine doesn't have to know
 * the wire shape.
 */
export function readHeader(
  payload: GmailMessagePayload,
  name: string,
): string | null {
  const lower = name.toLowerCase();
  for (const h of payload.headers) {
    if (h.name.toLowerCase() === lower) return h.value;
  }
  return null;
}

/**
 * Walk the Gmail MIME tree and return the first text/plain (or text/html
 * fallback) body, base64url-decoded. Returns empty string when the message
 * has no readable text part (e.g. a pure attachment forward).
 */
export function extractPlainText(payload: GmailMessagePayload): string {
  const plain = findPart(payload, "text/plain");
  if (plain !== null) return decodeBase64Url(plain.body?.data ?? "");
  const html = findPart(payload, "text/html");
  if (html !== null) {
    // Strip tags very loosely — the engine does not need perfect HTML
    // rendering, just enough for the LLM to read the gist.
    const raw = decodeBase64Url(html.body?.data ?? "");
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function findPart(
  payload: GmailMessagePayload,
  mime: string,
): GmailMessagePayload | null {
  if (payload.mimeType === mime && payload.body?.data !== undefined) {
    return payload;
  }
  if (payload.parts !== undefined) {
    for (const p of payload.parts) {
      const hit = findPart(p, mime);
      if (hit !== null) return hit;
    }
  }
  return null;
}

function decodeBase64Url(data: string): string {
  if (data.length === 0) return "";
  // Gmail uses URL-safe base64 without padding.
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}
