/**
 * Costs dashboard — Phase 1.0-C · C4.
 *
 * Real rollups against agent_runs + sub_agent_runs + usage_meters.
 * No mock data: if the DB is fresh, every counter renders an honest zero.
 *
 * Cost values format via Intl.NumberFormat (USD, 2dp) through `formatUsd`.
 *
 * Audit-logged: every view writes `admin.costs.viewed`.
 *
 * Owner: [Forge + Vega]
 */
import { logAuditEvent } from "@autonomux/db";

import { AdminCounterCard } from "@/components/AdminCounterCard";
import {
  AdminTable,
  type AdminTableColumn,
} from "@/components/AdminTable";
import {
  formatUsd,
  getBudgetAlertSummary,
  getCostByModel,
  getCostBySubAgent,
  getCostSummary,
  getCurrentMonthUsage,
  getTopTenantsByCost,
  projectMonthEndCost,
  type ModelCostRow,
  type SubAgentCostRow,
  type TenantCostRow,
} from "@/lib/cost-rollup";
import { formatInt, truncateId } from "@/lib/format";

export const dynamic = "force-dynamic";

const MS_IN_DAY = 24 * 60 * 60 * 1000;

function dateNDaysAgo(n: number): Date {
  return new Date(Date.now() - n * MS_IN_DAY);
}

function startOfThisMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export default async function CostsPage(): Promise<React.ReactElement> {
  // Fire all rollups in parallel — every query goes through the service-role
  // helper and is parameterised by Supabase-js (no string interpolation).
  const [
    summary24h,
    summary7d,
    summary30d,
    monthUsage,
    costByModel,
    costBySubAgent,
    topTenants,
    budgetAlerts,
  ] = await Promise.all([
    getCostSummary({ since: dateNDaysAgo(1) }),
    getCostSummary({ since: dateNDaysAgo(7) }),
    getCostSummary({ since: dateNDaysAgo(30) }),
    getCurrentMonthUsage(),
    getCostByModel(startOfThisMonthUtc()),
    getCostBySubAgent(startOfThisMonthUtc()),
    getTopTenantsByCost(10),
    getBudgetAlertSummary(),
  ]);

  // Audit (non-blocking).
  await logAuditEvent({
    tenantId: null,
    actorUserId: null,
    actorKind: "admin",
    action: "admin.costs.viewed",
    resourceType: "agent_runs",
    metadata: {
      windows: ["24h", "7d", "30d", "month"],
      total_30d_usd: summary30d.total_usd,
      month_period: monthUsage.period,
    },
  });

  const projectedMonthEnd = projectMonthEndCost(monthUsage.cost_usd);

  // ─── Table column shapes ─────────────────────────────────────────────
  const modelColumns: ReadonlyArray<AdminTableColumn<ModelCostRow>> = [
    {
      id: "model",
      label: "Model",
      render: (r) => <span className="adm-table__mono">{r.model}</span>,
    },
    {
      id: "runs",
      label: "Runs (MTD)",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">{formatInt(r.run_count)}</span>
      ),
    },
    {
      id: "cost",
      label: "Cost (MTD)",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">{formatUsd(r.cost_usd)}</span>
      ),
    },
  ];

  const subAgentColumns: ReadonlyArray<AdminTableColumn<SubAgentCostRow>> = [
    {
      id: "sub_agent",
      label: "Sub-agent",
      render: (r) => <span className="adm-table__mono">{r.sub_agent}</span>,
    },
    {
      id: "runs",
      label: "Invocations (MTD)",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">{formatInt(r.run_count)}</span>
      ),
    },
    {
      id: "cost",
      label: "Apportioned cost (MTD)",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">{formatUsd(r.cost_usd)}</span>
      ),
    },
  ];

  const tenantColumns: ReadonlyArray<AdminTableColumn<TenantCostRow>> = [
    {
      id: "tenant_id",
      label: "Tenant",
      render: (r) => (
        <a
          href={`/tenants/${r.tenant_id}`}
          className="adm-table__row-link"
          aria-label={`Open tenant ${r.tenant_id}`}
          title={r.tenant_id}
        >
          {truncateId(r.tenant_id, 8)}
        </a>
      ),
    },
    {
      id: "runs",
      label: "Runs (30d)",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">{formatInt(r.run_count)}</span>
      ),
    },
    {
      id: "cost",
      label: "Cost (30d)",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">{formatUsd(r.total_usd)}</span>
      ),
    },
  ];

  return (
    <section aria-labelledby="costs-h1">
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
          Phase 1.0-C4 &middot; Cost rollups
        </p>
        <h1
          id="costs-h1"
          style={{ fontSize: "var(--fs-display-s)" }}
        >
          Costs
        </h1>
        <p
          style={{
            fontSize: "var(--fs-body-lg)",
            color: "var(--ink-soft)",
            maxWidth: "720px",
          }}
        >
          LLM cost per window, per model, per sub-agent, and top tenants —
          all summed live from agent_runs.
        </p>
      </div>

      {/* ─── Cost-window counters ─────────────────────────────────── */}
      <div className="adm-grid" style={{ marginBottom: "var(--sp-32)" }}>
        <AdminCounterCard
          kicker="Cost · last 24h"
          value={formatUsd(summary24h.total_usd)}
          caption={`${formatInt(summary24h.run_count)} runs · ${formatInt(
            summary24h.input_tokens + summary24h.output_tokens,
          )} tokens`}
        />
        <AdminCounterCard
          kicker="Cost · last 7d"
          value={formatUsd(summary7d.total_usd)}
          caption={`${formatInt(summary7d.run_count)} runs · ${formatInt(
            summary7d.input_tokens + summary7d.output_tokens,
          )} tokens`}
        />
        <AdminCounterCard
          kicker="Cost · last 30d"
          value={formatUsd(summary30d.total_usd)}
          caption={`${formatInt(summary30d.run_count)} runs · ${formatInt(
            summary30d.input_tokens + summary30d.output_tokens,
          )} tokens`}
        />
      </div>

      {/* ─── This-month rollups ───────────────────────────────────── */}
      <section
        className="adm-section"
        aria-labelledby="costs-month-h2"
      >
        <div className="adm-section__head">
          <h2
            id="costs-month-h2"
            className="adm-section__title"
          >
            This month ({monthUsage.period})
          </h2>
          <span className="adm-table__mono">
            {formatInt(monthUsage.tenant_count)} tenants metered
          </span>
        </div>
        <div className="adm-grid">
          <AdminCounterCard
            kicker="Tokens in (MTD)"
            value={formatInt(monthUsage.tokens_in)}
            caption="From usage_meters"
          />
          <AdminCounterCard
            kicker="Tokens out (MTD)"
            value={formatInt(monthUsage.tokens_out)}
            caption="From usage_meters"
          />
          <AdminCounterCard
            kicker="Cost (MTD)"
            value={formatUsd(monthUsage.cost_usd)}
            caption="Sum of usage_meters.cost_usd_cents"
          />
          <AdminCounterCard
            kicker="Projected month-end"
            value={formatUsd(projectedMonthEnd)}
            caption="Linear extrapolation from MTD"
          />
        </div>
      </section>

      {/* ─── Budget alerts (placeholder until tier ceilings ship) ─── */}
      <section
        className="adm-section"
        aria-labelledby="costs-budget-h2"
      >
        <h2
          id="costs-budget-h2"
          className="adm-section__title"
          style={{ marginBottom: "var(--sp-12)" }}
        >
          Budget alerts
        </h2>
        {budgetAlerts.ceiling_basis === "placeholder" ? (
          <div className="adm-empty" role="status">
            Awaiting tier ceilings. Tenant token budgets will surface here once
            `tenants.monthly_token_budget` lands (Phase 1.0-C+1).
          </div>
        ) : (
          <div className="adm-empty" role="status">
            {budgetAlerts.tenants_above_80pct === 0
              ? "No tenants currently above 80% of their monthly token budget."
              : `${formatInt(budgetAlerts.tenants_above_80pct)} tenants are above 80% of their monthly token budget.`}
          </div>
        )}
      </section>

      {/* ─── Cost split by model ──────────────────────────────────── */}
      <section
        className="adm-section"
        aria-labelledby="costs-model-h2"
      >
        <div className="adm-section__head">
          <h2
            id="costs-model-h2"
            className="adm-section__title"
          >
            Cost by model (MTD)
          </h2>
          <span className="adm-table__mono">
            {formatInt(costByModel.length)} model{costByModel.length === 1 ? "" : "s"}
          </span>
        </div>
        <AdminTable
          caption="Per-model breakdown of LLM cost month-to-date, summed from agent_runs."
          columns={modelColumns}
          rows={costByModel}
          rowKey={(r) => r.model}
          emptyMessage="No agent runs this month yet."
        />
      </section>

      {/* ─── Cost split by sub-agent ──────────────────────────────── */}
      <section
        className="adm-section"
        aria-labelledby="costs-subagent-h2"
      >
        <div className="adm-section__head">
          <h2
            id="costs-subagent-h2"
            className="adm-section__title"
          >
            Cost by sub-agent (MTD)
          </h2>
          <span className="adm-table__mono">
            Apportioned by duration share
          </span>
        </div>
        <AdminTable
          caption="Per-sub-agent breakdown of LLM cost month-to-date, apportioned by each sub-run's share of its parent run's duration."
          columns={subAgentColumns}
          rows={costBySubAgent}
          rowKey={(r) => r.sub_agent}
          emptyMessage="No sub-agent invocations this month yet."
        />
      </section>

      {/* ─── Top tenants by 30d cost ──────────────────────────────── */}
      <section
        className="adm-section"
        aria-labelledby="costs-top-h2"
      >
        <div className="adm-section__head">
          <h2
            id="costs-top-h2"
            className="adm-section__title"
          >
            Top tenants · last 30d
          </h2>
          <span className="adm-table__mono">
            Up to 10 tenants
          </span>
        </div>
        <AdminTable
          caption="Top tenants by cost over the trailing 30 days."
          columns={tenantColumns}
          rows={topTenants}
          rowKey={(r) => r.tenant_id}
          emptyMessage="No tenant cost recorded in the last 30 days."
        />
      </section>
    </section>
  );
}
