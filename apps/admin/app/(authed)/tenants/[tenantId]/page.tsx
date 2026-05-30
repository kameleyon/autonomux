/**
 * Tenant drill-down — Phase 1.0-C1.
 *
 * Operator view per PRD §3.2. All numbers are 30-day windows because
 * that's the support-facing horizon ("what has this tenant done lately?").
 *
 * Service-role reads cross every table; we audit-log the view event so
 * the chain has a record of every cpanel impression.
 *
 * Owner: [Forge + Vega]
 */
import { notFound } from "next/navigation";

import { logAuditEvent } from "@autonomux/db";

import { AdminBackButton } from "@/components/AdminBackButton";
import { AdminCounterCard } from "@/components/AdminCounterCard";
import {
  AdminTable,
  type AdminTableColumn,
} from "@/components/AdminTable";
import { getTenantDrilldown } from "@/lib/queries";
import {
  formatDate,
  formatDurationMs,
  formatInt,
  formatTimestamp,
  formatUsdFromCents,
  truncateId,
} from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = Promise<{ tenantId: string }>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TenantDetailPage({
  params,
}: {
  params: Params;
}): Promise<React.ReactElement> {
  const { tenantId } = await params;
  if (!UUID_RE.test(tenantId)) {
    notFound();
  }

  const snapshot = await getTenantDrilldown(tenantId);
  if (snapshot.tenant === null) {
    notFound();
  }
  const tenant = snapshot.tenant;

  await logAuditEvent({
    tenantId,
    actorUserId: null,
    actorKind: "admin",
    action: "admin.tenant.viewed",
    resourceType: "tenant",
    resourceId: tenantId,
    metadata: { surface: "cpanel.tenant.drilldown" },
  });

  const recentRunCols: ReadonlyArray<
    AdminTableColumn<(typeof snapshot.recent_runs)[number]>
  > = [
    {
      id: "created_at",
      label: "When",
      render: (r) => (
        <span className="adm-table__mono">
          {formatTimestamp(r.created_at)}
        </span>
      ),
    },
    {
      id: "model",
      label: "Model",
      render: (r) => (
        <span className="adm-table__mono">{r.model}</span>
      ),
    },
    {
      id: "status",
      label: "Status",
      render: (r) => (
        <span
          className={
            r.status === "success"
              ? "adm-pill adm-pill--ok"
              : r.status === "failed"
                ? "adm-pill adm-pill--alert"
                : r.status === "partial" || r.status === "cancelled"
                  ? "adm-pill adm-pill--warn"
                  : "adm-pill"
          }
        >
          {r.status}
        </span>
      ),
    },
    {
      id: "in",
      label: "Tokens in",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">
          {formatInt(r.input_tokens)}
        </span>
      ),
    },
    {
      id: "out",
      label: "Tokens out",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">
          {formatInt(r.output_tokens)}
        </span>
      ),
    },
    {
      id: "cost",
      label: "Cost",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">
          {formatUsdFromCents(r.cost_usd_cents)}
        </span>
      ),
    },
    {
      id: "duration",
      label: "Duration",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">
          {formatDurationMs(r.duration_ms)}
        </span>
      ),
    },
  ];

  const accountCols: ReadonlyArray<
    AdminTableColumn<(typeof snapshot.connected_accounts)[number]>
  > = [
    {
      id: "integration",
      label: "Integration",
      render: (r) => <span>{r.integration}</span>,
    },
    {
      id: "oauth_status",
      label: "OAuth status",
      render: (r) => (
        <span
          className={
            r.oauth_status === "active"
              ? "adm-pill adm-pill--ok"
              : r.oauth_status === "expired" || r.oauth_status === "pending"
                ? "adm-pill adm-pill--warn"
                : "adm-pill adm-pill--alert"
          }
        >
          {r.oauth_status}
        </span>
      ),
    },
    {
      id: "last_refresh",
      label: "Last refresh",
      render: (r) => (
        <span className="adm-table__mono">
          {formatTimestamp(r.last_refresh_at)}
        </span>
      ),
    },
  ];

  const memberCols: ReadonlyArray<
    AdminTableColumn<(typeof snapshot.members)[number]>
  > = [
    {
      id: "user_id",
      label: "User",
      render: (r) => (
        <span
          className="adm-table__mono"
          title={r.user_id}
        >
          {truncateId(r.user_id, 8)}
        </span>
      ),
    },
    {
      id: "role",
      label: "Role",
      render: (r) => <span className="adm-pill">{r.role}</span>,
    },
    {
      id: "joined_at",
      label: "Joined",
      render: (r) => (
        <span className="adm-table__mono">
          {formatDate(r.created_at)}
        </span>
      ),
    },
  ];

  return (
    <section aria-labelledby="tenant-h1">
      <div style={{ marginBottom: "var(--sp-16)" }}>
        <AdminBackButton href="/tenants" label="Back to tenants" />
      </div>

      <p
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: "var(--fs-mono-meta)",
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: "var(--brand-orange)",
          marginBottom: "var(--sp-12)",
        }}
      >
        Phase 1.0-C1 &middot; Tenant drill-down
      </p>
      <h1
        id="tenant-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Tenant <em>{truncateId(tenant.id, 8)}</em>
      </h1>

      {/* Header card */}
      <section
        className="adm-card"
        aria-labelledby="tenant-summary-h2"
        style={{ marginBottom: "var(--sp-24)" }}
      >
        <span className="adm-card__kicker">Summary</span>
        <h2
          id="tenant-summary-h2"
          className="adm-card__title"
          style={{ wordBreak: "break-all" }}
        >
          {tenant.id}
        </h2>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--sp-12)",
            margin: 0,
            fontSize: "var(--fs-body-sm)",
          }}
        >
          <div>
            <dt className="adm-label">Plan</dt>
            <dd style={{ margin: 0 }}>
              <span className="adm-pill">{tenant.plan}</span>
            </dd>
          </div>
          <div>
            <dt className="adm-label">Status</dt>
            <dd style={{ margin: 0 }}>
              <span className="adm-pill">{tenant.status}</span>
            </dd>
          </div>
          <div>
            <dt className="adm-label">Created</dt>
            <dd style={{ margin: 0 }} className="adm-table__mono">
              {formatTimestamp(tenant.created_at)}
            </dd>
          </div>
          <div>
            <dt className="adm-label">Deleted</dt>
            <dd style={{ margin: 0 }} className="adm-table__mono">
              {tenant.deleted_at !== null
                ? formatTimestamp(tenant.deleted_at)
                : "—"}
            </dd>
          </div>
        </dl>

        <div
          style={{
            display: "flex",
            gap: "var(--sp-8)",
            flexWrap: "wrap",
            marginTop: "var(--sp-12)",
          }}
        >
          <span
            title="Sign-out wires in Phase 1.1+"
            aria-label="Sign-out quick action — wires in Phase 1.1+"
          >
            <button
              type="button"
              className="adm-toolbtn"
              disabled
            >
              Force sign-out
            </button>
          </span>
          <span
            title="Revoke OAuth wires in Phase 1.1+"
            aria-label="Revoke OAuth quick action — wires in Phase 1.1+"
          >
            <button
              type="button"
              className="adm-toolbtn"
              disabled
            >
              Revoke OAuth
            </button>
          </span>
          <span
            title="Impersonate-with-audit lands at v1.7"
            aria-label="Impersonate — lands at v1.7"
          >
            <button
              type="button"
              className="adm-toolbtn"
              disabled
            >
              Impersonate
            </button>
          </span>
        </div>
      </section>

      {/* Counter row */}
      <section
        className="adm-grid"
        aria-label="30-day counters"
        style={{ marginBottom: "var(--sp-32)" }}
      >
        <AdminCounterCard
          kicker="Agent runs (30d)"
          value={formatInt(snapshot.counters.agent_runs_30d)}
        />
        <AdminCounterCard
          kicker="Sub-agent runs (30d)"
          value={formatInt(snapshot.counters.sub_agent_runs_30d)}
        />
        <AdminCounterCard
          kicker="Cost (30d)"
          value={formatUsdFromCents(snapshot.counters.cost_usd_cents_30d)}
        />
        <AdminCounterCard
          kicker="Active connected accounts"
          value={formatInt(snapshot.counters.connected_accounts_active)}
        />
        <AdminCounterCard
          kicker="Audit log entries (30d)"
          value={formatInt(snapshot.counters.audit_log_30d)}
        />
      </section>

      {/* Recent runs */}
      <section
        className="adm-section"
        aria-labelledby="tenant-runs-h2"
      >
        <div className="adm-section__head">
          <h2 id="tenant-runs-h2" className="adm-section__title">
            Recent agent runs
          </h2>
          <span className="adm-table__mono">last 10</span>
        </div>
        <AdminTable
          caption="Recent agent runs for this tenant with model, status, tokens, cost, and duration."
          columns={recentRunCols}
          rows={snapshot.recent_runs}
          rowKey={(r) => r.id}
          emptyMessage="No agent runs yet for this tenant."
        />
      </section>

      {/* Connected accounts */}
      <section
        className="adm-section"
        aria-labelledby="tenant-accts-h2"
      >
        <div className="adm-section__head">
          <h2 id="tenant-accts-h2" className="adm-section__title">
            Connected accounts
          </h2>
        </div>
        <AdminTable
          caption="OAuth and Plaid integrations linked to this tenant."
          columns={accountCols}
          rows={snapshot.connected_accounts}
          rowKey={(r) => r.id}
          emptyMessage="No connected accounts."
        />
      </section>

      {/* Members */}
      <section
        className="adm-section"
        aria-labelledby="tenant-members-h2"
      >
        <div className="adm-section__head">
          <h2 id="tenant-members-h2" className="adm-section__title">
            Members
          </h2>
        </div>
        <AdminTable
          caption="Users with access to this tenant."
          columns={memberCols}
          rows={snapshot.members}
          rowKey={(r) => r.id}
          emptyMessage="No members yet."
        />
      </section>
    </section>
  );
}
