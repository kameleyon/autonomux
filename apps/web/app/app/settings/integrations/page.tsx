/**
 * apps/web/app/app/settings/integrations/page.tsx
 *
 * Settings → Integrations (Sprint D §4 / Cluster D).
 *
 * Lists every `connected_accounts` row for the current tenant whose status
 * is in {active, expired} and offers:
 *   - Connect Gmail (if no active gmail row) → /auth/oauth/gmail/start
 *   - Disconnect (Server Action) per row
 *
 * Scopes shown come from the most recent `connected_account_events.payload.scopes`
 * (oauth_granted/oauth_refreshed event), with a fallback to the row's
 * `scope_grants` column.
 *
 * Owner: [Forge + Vega]
 */

import Link from "next/link";

import type { Json, OAuthStatus } from "@autonomux/db/types";

import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

import { disconnectIntegration } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Integrations",
};

interface SearchParams {
  readonly connected?: string;
  readonly error?: string;
  readonly disconnected?: string;
}

interface RowVm {
  readonly id: string;
  readonly integration: string;
  readonly status: OAuthStatus;
  readonly scopes: string[];
  readonly connectedAt: string;
  readonly lastError: string | null;
  readonly tokenExpiresAt: string | null;
}

function readScopesFromPayload(payload: Json | null): string[] {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const maybe = (payload as Record<string, Json | undefined>).scopes;
  if (!Array.isArray(maybe)) return [];
  return maybe.filter((s): s is string => typeof s === "string");
}

export default async function IntegrationsPage(props: {
  searchParams: Promise<SearchParams>;
}): Promise<React.ReactElement> {
  const sp = await props.searchParams;
  const supabase = await createClient();
  await requireAuth(supabase);
  const tenantId = await requireTenantId(supabase);

  // Service-role for the SELECT so we can also JOIN to the events table
  // without RLS friction. Re-checked with WHERE tenant_id = current.
  const service = getSupabaseServiceClient();

  const { data: rows } = await service
    .from("connected_accounts")
    .select(
      "id, integration, oauth_status, scope_grants, created_at, last_error, token_expires_at",
    )
    .eq("tenant_id", tenantId)
    .in("oauth_status", ["active", "expired"])
    .order("created_at", { ascending: true });

  const accounts = (rows ?? []) as ReadonlyArray<{
    id: string;
    integration: string;
    oauth_status: OAuthStatus;
    scope_grants: string[] | null;
    created_at: string;
    last_error: string | null;
    token_expires_at: string | null;
  }>;

  // Pull the latest oauth_granted/oauth_refreshed event per account for the
  // "scopes granted" display. One query, then group in memory.
  const ids = accounts.map((a) => a.id);
  const vms: RowVm[] = [];
  if (ids.length > 0) {
    const { data: events } = await service
      .from("connected_account_events")
      .select("connected_account_id, event_kind, payload, created_at")
      .in("connected_account_id", ids)
      .in("event_kind", ["oauth_granted", "oauth_refreshed"])
      .order("created_at", { ascending: false });
    const byAccount = new Map<string, Json | null>();
    for (const ev of events ?? []) {
      if (!byAccount.has(ev.connected_account_id)) {
        byAccount.set(ev.connected_account_id, ev.payload);
      }
    }
    for (const a of accounts) {
      const eventPayload = byAccount.get(a.id) ?? null;
      const scopesFromEvent = readScopesFromPayload(eventPayload);
      const scopes =
        scopesFromEvent.length > 0
          ? scopesFromEvent
          : (a.scope_grants ?? []);
      vms.push({
        id: a.id,
        integration: a.integration,
        status: a.oauth_status,
        scopes,
        connectedAt: a.created_at,
        lastError: a.last_error,
        tokenExpiresAt: a.token_expires_at,
      });
    }
  }

  const hasActiveGmail = vms.some(
    (v) => v.integration === "gmail" && v.status === "active",
  );
  const hasActiveGcal = vms.some(
    (v) => v.integration === "gcal" && v.status === "active",
  );

  return (
    <div className="wrap">
      <h1>Integrations</h1>
      <p>
        Connect external accounts so your AlterEgo can act on your behalf.
        Tokens are stored encrypted at rest — they never appear in logs or
        backups in plaintext.
      </p>

      {sp.connected !== undefined ? (
        <p role="status" aria-live="polite">
          Connected: <strong>{sp.connected}</strong>.
        </p>
      ) : null}
      {sp.disconnected !== undefined ? (
        <p role="status" aria-live="polite">
          Disconnected: <strong>{sp.disconnected}</strong>.
        </p>
      ) : null}
      {sp.error !== undefined ? (
        <p role="alert">
          Connection failed (code: <code>{sp.error}</code>). Please try again
          or contact support if the problem persists.
        </p>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Existing accounts                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-labelledby="accounts-h2"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="accounts-h2">Connected accounts</h2>
        {vms.length === 0 ? (
          <p>No accounts connected yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {vms.map((vm) => (
              <li
                key={vm.id}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--r-xl)",
                  padding: "var(--sp-16)",
                  marginBottom: "var(--sp-12)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "var(--sp-12)",
                    flexWrap: "wrap",
                  }}
                >
                  <h3 style={{ margin: 0, textTransform: "capitalize" }}>
                    {vm.integration}
                  </h3>
                  <StatusBadge status={vm.status} />
                </div>
                <dl style={{ marginTop: "var(--sp-8)" }}>
                  <dt>Connected</dt>
                  <dd>{new Date(vm.connectedAt).toLocaleString()}</dd>
                  <dt>Scopes</dt>
                  <dd>
                    {vm.scopes.length === 0 ? (
                      <em>none recorded</em>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: "var(--sp-16)" }}>
                        {vm.scopes.map((s) => (
                          <li key={s}>
                            <code>{s}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                  {vm.tokenExpiresAt !== null ? (
                    <>
                      <dt>Access token expires</dt>
                      <dd>{new Date(vm.tokenExpiresAt).toLocaleString()}</dd>
                    </>
                  ) : null}
                  {vm.lastError !== null && vm.status !== "active" ? (
                    <>
                      <dt>Last error</dt>
                      <dd>
                        <code>{vm.lastError}</code>
                      </dd>
                    </>
                  ) : null}
                </dl>
                <form action={disconnectIntegration}>
                  <input type="hidden" name="account_id" value={vm.id} />
                  <button type="submit">Disconnect</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Connect Gmail                                                       */}
      {/* ------------------------------------------------------------------ */}
      {!hasActiveGmail ? (
        <section
          aria-labelledby="connect-gmail-h2"
          style={{ marginTop: "var(--sp-32)" }}
        >
          <h2 id="connect-gmail-h2">Connect Gmail</h2>
          <p>
            Connect Gmail to let the Mailroom sub-agent triage your inbox and
            draft replies for review.
          </p>
          <p>
            <Link href="/auth/oauth/gmail/start">Connect Gmail</Link>
          </p>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Connect Google Calendar                                             */}
      {/* ------------------------------------------------------------------ */}
      {!hasActiveGcal ? (
        <section
          aria-labelledby="connect-gcal-h2"
          style={{ marginTop: "var(--sp-32)" }}
        >
          <h2 id="connect-gcal-h2">Connect Calendar</h2>
          <p>
            Connect Google Calendar to let the Scheduler sub-agent surface
            upcoming events, detect conflicts, and prepare you for what&apos;s
            next. Read-only access — the agent never writes to your calendar.
          </p>
          <p>
            <Link href="/auth/oauth/gcal/start">Connect Calendar</Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
function StatusBadge(props: { status: OAuthStatus }): React.ReactElement {
  const tone =
    props.status === "active"
      ? "var(--brand-aqua, #14C8CC)"
      : "var(--brand-gold, #E4C875)";
  return (
    <span
      aria-label={`Status: ${props.status}`}
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "var(--r-xl)",
        fontSize: "0.8em",
        background: tone,
        color: "#000",
      }}
    >
      {props.status}
    </span>
  );
}
