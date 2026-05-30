/**
 * Integrations health board — Phase 1.0-C · C5.
 *
 * One row per integration (gmail, calendar, plaid, substack, x, linkedin,
 * youtube, outlook, astrology) with:
 *   - total connected accounts
 *   - oauth_status breakdown (pending / active / expired / revoked / error)
 *   - warm-only health pill (active-ratio → level)
 *   - median time since last refresh
 *   - "View tenants using this integration" deep link
 *
 * Audit-logged: every view writes `admin.integrations.viewed`.
 *
 * Owner: [Forge + Vega]
 */
import Link from "next/link";

import { logAuditEvent } from "@autonomux/db";

import { AdminHealthPill } from "@/components/AdminHealthPill";
import {
  AdminTable,
  type AdminTableColumn,
} from "@/components/AdminTable";
import {
  formatRefreshDelta,
  getIntegrationsHealth,
  INTEGRATION_DISPLAY,
  type IntegrationHealthRow,
} from "@/lib/integration-health";
import { formatInt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage(): Promise<React.ReactElement> {
  const { total_accounts: totalAccounts, rows } =
    await getIntegrationsHealth();

  await logAuditEvent({
    tenantId: null,
    actorUserId: null,
    actorKind: "admin",
    action: "admin.integrations.viewed",
    resourceType: "connected_accounts",
    metadata: {
      total_accounts: totalAccounts,
      integration_count: rows.length,
    },
  });

  const columns: ReadonlyArray<AdminTableColumn<IntegrationHealthRow>> = [
    {
      id: "integration",
      label: "Integration",
      render: (r) => (
        <strong style={{ fontWeight: 600 }}>
          {INTEGRATION_DISPLAY[r.integration]}
        </strong>
      ),
    },
    {
      id: "total",
      label: "Accounts",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">{formatInt(r.total_accounts)}</span>
      ),
    },
    {
      id: "active",
      label: "Active",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">
          {formatInt(r.status_breakdown.active)}
        </span>
      ),
    },
    {
      id: "expired",
      label: "Expired",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">
          {formatInt(r.status_breakdown.expired)}
        </span>
      ),
    },
    {
      id: "revoked",
      label: "Revoked",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">
          {formatInt(r.status_breakdown.revoked)}
        </span>
      ),
    },
    {
      id: "error",
      label: "Error",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">
          {formatInt(r.status_breakdown.error)}
        </span>
      ),
    },
    {
      id: "health",
      label: "Health",
      render: (r) => {
        if (r.total_accounts === 0) {
          // Honest empty state — no fake "100% healthy" on zero data.
          return (
            <span className="adm-table__mono" aria-label="No accounts connected">
              No accounts
            </span>
          );
        }
        return (
          <AdminHealthPill
            level={r.health}
            percent={r.active_ratio}
            srContext={`${INTEGRATION_DISPLAY[r.integration]} health`}
          />
        );
      },
    },
    {
      id: "refresh",
      label: "Median last refresh",
      render: (r) => (
        <span className="adm-table__mono">
          {formatRefreshDelta(r.median_refresh_delta_ms)}
        </span>
      ),
    },
    {
      id: "tenants",
      label: "Tenants",
      render: (r) =>
        r.total_accounts > 0 ? (
          <Link
            href={`/tenants?integration=${r.integration}`}
            className="adm-table__row-link"
            aria-label={`View tenants using ${INTEGRATION_DISPLAY[r.integration]}`}
          >
            View tenants →
          </Link>
        ) : (
          <span className="adm-table__mono" aria-hidden="true">
            —
          </span>
        ),
    },
  ];

  return (
    <section aria-labelledby="integrations-h1">
      <div className="adm-pageheader">
        <p
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-mono-meta)",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--brand-orange)",
          }}
        >
          Phase 1.0-C5 &middot; Integrations health
        </p>
        <h1
          id="integrations-h1"
          style={{ fontSize: "var(--fs-display-s)" }}
        >
          Integrations health
        </h1>
        <p
          style={{
            fontSize: "var(--fs-body-lg)",
            color: "var(--ink-soft)",
            maxWidth: "720px",
          }}
        >
          Per-integration OAuth posture across every tenant. Health pills use
          a warm-only ladder (gold → orange → wine), never green or red.
        </p>
      </div>

      {totalAccounts === 0 ? (
        <div className="adm-empty" role="status">
          No integrations connected yet.
        </div>
      ) : (
        <section
          className="adm-section"
          aria-labelledby="integrations-table-h2"
          style={{ marginTop: 0 }}
        >
          <div className="adm-section__head">
            <h2
              id="integrations-table-h2"
              className="adm-section__title"
            >
              All integrations
            </h2>
            <span className="adm-table__mono">
              {formatInt(totalAccounts)} accounts total
            </span>
          </div>
          <AdminTable
            caption="Integration health: total accounts, OAuth status breakdown, warm-only health pill, and median time since last refresh."
            columns={columns}
            rows={rows}
            rowKey={(r) => r.integration}
            emptyMessage="No integrations recorded."
          />
        </section>
      )}
    </section>
  );
}
