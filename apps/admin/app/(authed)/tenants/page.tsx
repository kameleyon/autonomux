/**
 * Tenants — Phase 1.0-C1.
 *
 * Server-side list of every tenant. Service-role reads are by design
 * (admin cross-tenant view per PRD §3.2). Filters + pagination are
 * server-driven via querystring so the view is bookmarkable and JS-free.
 *
 * Owner: [Forge + Vega]
 */
import Link from "next/link";

import {
  type TenantPlan,
  type TenantStatus,
  logAuditEvent,
} from "@autonomux/db";

import {
  AdminTable,
  type AdminTableColumn,
} from "@/components/AdminTable";
import {
  AdminFilterBar,
  type AdminFilterField,
} from "@/components/AdminFilterBar";
import { AdminPagination } from "@/components/AdminPagination";
import {
  listTenantsPaged,
  type TenantListRow,
} from "@/lib/queries";
import {
  formatDate,
  formatInt,
  formatTimestamp,
  truncateId,
} from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const PAGE_SIZE = 25;

const PLAN_OPTIONS: ReadonlyArray<{ value: TenantPlan; label: string }> = [
  { value: "free", label: "Free" },
  { value: "personal", label: "Personal" },
  { value: "pro", label: "Pro" },
  { value: "founder", label: "Founder" },
];

const STATUS_OPTIONS: ReadonlyArray<{
  value: TenantStatus;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "past_due", label: "Past due" },
  { value: "cancelled", label: "Cancelled" },
  { value: "pending_deletion", label: "Pending deletion" },
];

function asStringArray(
  value: string | string[] | undefined,
): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function asPlans(value: string | string[] | undefined): TenantPlan[] {
  const allowed = new Set(PLAN_OPTIONS.map((o) => o.value));
  return asStringArray(value).filter((v): v is TenantPlan =>
    allowed.has(v as TenantPlan),
  );
}

function asStatuses(value: string | string[] | undefined): TenantStatus[] {
  const allowed = new Set(STATUS_OPTIONS.map((o) => o.value));
  return asStringArray(value).filter((v): v is TenantStatus =>
    allowed.has(v as TenantStatus),
  );
}

function asPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function asStr(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

export default async function TenantsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}): Promise<React.ReactElement> {
  const params =
    searchParams !== undefined ? await searchParams : {};

  const plans = asPlans(params.plan);
  const statuses = asStatuses(params.status);
  const idPrefix = asStr(params.id);
  const page = asPage(params.page);

  const { rows, total } = await listTenantsPaged({
    filters: {
      plans,
      statuses,
      idPrefix: idPrefix.length > 0 ? idPrefix : undefined,
    },
    page,
    pageSize: PAGE_SIZE,
  });

  // Audit the cross-tenant read. Non-blocking (logAuditEvent never throws).
  await logAuditEvent({
    tenantId: null,
    actorUserId: null,
    actorKind: "admin",
    action: "admin.tenant.list_viewed",
    resourceType: "tenant",
    metadata: {
      filters: {
        plans,
        statuses,
        idPrefix,
      },
      page,
      page_size: PAGE_SIZE,
    },
  });

  const filterFields: ReadonlyArray<AdminFilterField> = [
    {
      kind: "text",
      name: "id",
      label: "Tenant ID prefix",
      defaultValue: idPrefix,
      placeholder: "e.g. 1a2b3c4d",
    },
    {
      kind: "multi-select",
      name: "plan",
      label: "Plan",
      defaultValues: plans,
      options: PLAN_OPTIONS,
    },
    {
      kind: "multi-select",
      name: "status",
      label: "Status",
      defaultValues: statuses,
      options: STATUS_OPTIONS,
    },
  ];

  const columns: ReadonlyArray<AdminTableColumn<TenantListRow>> = [
    {
      id: "id",
      label: "Tenant",
      render: (r) => (
        <Link
          href={`/tenants/${r.id}`}
          className="adm-table__row-link"
          aria-label={`Open tenant ${r.id}`}
        >
          {truncateId(r.id, 8)}
        </Link>
      ),
    },
    {
      id: "plan",
      label: "Plan",
      render: (r) => <span className="adm-pill">{r.plan}</span>,
    },
    {
      id: "status",
      label: "Status",
      render: (r) => (
        <span
          className={
            r.status === "active"
              ? "adm-pill adm-pill--ok"
              : r.status === "past_due" || r.status === "suspended"
                ? "adm-pill adm-pill--warn"
                : r.status === "cancelled" ||
                    r.status === "pending_deletion"
                  ? "adm-pill adm-pill--alert"
                  : "adm-pill"
          }
        >
          {r.status}
        </span>
      ),
    },
    {
      id: "created_at",
      label: "Created",
      render: (r) => (
        <span className="adm-table__mono">
          {formatDate(r.created_at)}
        </span>
      ),
    },
    {
      id: "last_activity",
      label: "Last activity",
      render: (r) => (
        <span className="adm-table__mono">
          {formatTimestamp(r.last_activity_at)}
        </span>
      ),
    },
    {
      id: "members",
      label: "Members",
      align: "right",
      render: (r) => (
        <span className="adm-table__num">
          {formatInt(r.member_count)}
        </span>
      ),
    },
  ];

  // Build a plain object of current params for AdminPagination.
  const passthroughParams: Record<string, string | string[]> = {};
  if (idPrefix.length > 0) passthroughParams.id = idPrefix;
  if (plans.length > 0) passthroughParams.plan = plans;
  if (statuses.length > 0) passthroughParams.status = statuses;

  return (
    <section aria-labelledby="tenants-h1">
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
        Phase 1.0-C1 &middot; Tenants
      </p>
      <h1
        id="tenants-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Tenants
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
          marginBottom: "var(--sp-24)",
        }}
      >
        Every tenant in the database. Drill into a row for usage, cost,
        connected accounts, and recent agent runs.
      </p>

      <AdminFilterBar action="/tenants" fields={filterFields} />

      <section className="adm-section" aria-labelledby="tenants-table-h2">
        <div className="adm-section__head">
          <h2 id="tenants-table-h2" className="adm-section__title">
            Results
          </h2>
          <span className="adm-table__mono">
            {formatInt(total)} matched
          </span>
        </div>

        <AdminTable
          caption="Tenant list with plan, status, created date, last activity, and member count."
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          emptyMessage={
            plans.length > 0 ||
            statuses.length > 0 ||
            idPrefix.length > 0
              ? "No tenants match these filters."
              : "No tenants in the database yet."
          }
        />

        <AdminPagination
          pathname="/tenants"
          page={page}
          pageSize={PAGE_SIZE}
          rowsOnPage={rows.length}
          totalRows={total}
          searchParams={passthroughParams}
        />
      </section>
    </section>
  );
}
