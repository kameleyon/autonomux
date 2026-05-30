/**
 * Activity log mirror — Phase 1.0-C · C3.
 *
 * The SAME feed the tenant sees in their app (PRD §8.1) — but with a
 * tenant_id column for cross-tenant admin context. Service-role read,
 * server-driven filters + pagination, expandable chain-of-thought.
 *
 * Audit-logged: every view writes `admin.activity.viewed` with the
 * filter context so we can prove which operator saw which slice.
 *
 * Owner: [Forge + Vega]
 */
import Link from "next/link";

import { createServiceClient, logAuditEvent } from "@autonomux/db";

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
  formatTimestamp,
  truncateId,
} from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 50;

interface ActivityRow {
  id: string;
  tenant_id: string;
  summary: string;
  chain_of_thought_summary: string | null;
  action_kind: string;
  created_at: string;
}

/**
 * The user-app surfaces every action_kind verb its sub-agents emit. We
 * can't enumerate them all here (the set grows with each sub-agent) so
 * the multi-select is populated dynamically from the rows currently in
 * the database — bounded by a probe query.
 */
async function getDistinctActionKinds(): Promise<string[]> {
  const sb = createServiceClient();
  // Pull a recent window's worth — sufficient signal for the filter.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("activity_log")
    .select("action_kind")
    .gte("created_at", since)
    .limit(2000);

  if (error) return [];
  const seen = new Set<string>();
  for (const row of data ?? []) seen.add(row.action_kind);
  return Array.from(seen).sort();
}

interface FetchArgs {
  tenantId?: string;
  actionKinds?: ReadonlyArray<string>;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

async function fetchActivity(
  args: FetchArgs,
): Promise<{ rows: ActivityRow[]; total: number }> {
  const sb = createServiceClient();
  let q = sb
    .from("activity_log")
    .select(
      "id, tenant_id, summary, chain_of_thought_summary, action_kind, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (args.tenantId && args.tenantId.length > 0) {
    // Tenant IDs are UUIDs — accept prefix match (text-search per spec).
    q = q.like("tenant_id", `${args.tenantId}%`);
  }
  if (args.actionKinds && args.actionKinds.length > 0) {
    q = q.in("action_kind", args.actionKinds as unknown as string[]);
  }
  if (args.from && args.from.length > 0) {
    q = q.gte("created_at", `${args.from}T00:00:00.000Z`);
  }
  if (args.to && args.to.length > 0) {
    q = q.lte("created_at", `${args.to}T23:59:59.999Z`);
  }

  const offset = (args.page - 1) * args.pageSize;
  q = q.range(offset, offset + args.pageSize - 1);

  const { data, error, count } = await q;
  if (error) {
    throw new Error(`[activity.fetch] ${error.message}`);
  }
  return { rows: (data ?? []) as ActivityRow[], total: count ?? 0 };
}

function asString(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

function asStringArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function asPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}): Promise<React.ReactElement> {
  const params = searchParams !== undefined ? await searchParams : {};

  const tenantId = asString(params.tenant_id);
  const actionKindsRaw = asStringArray(params.action_kind);
  const fromDate = asString(params.from);
  const toDate = asString(params.to);
  const page = asPage(params.page);

  const distinctKinds = await getDistinctActionKinds();

  // Sanitize: only allow action_kinds we've actually seen, so junk values
  // can't pollute the filter (defense in depth — the DB query is already
  // parameterised).
  const allowedKinds = new Set(distinctKinds);
  const actionKinds = actionKindsRaw.filter((k) => allowedKinds.has(k));

  const { rows, total } = await fetchActivity({
    tenantId: tenantId.length > 0 ? tenantId : undefined,
    actionKinds,
    from: fromDate.length > 0 ? fromDate : undefined,
    to: toDate.length > 0 ? toDate : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  // Audit (non-blocking). Captures filter context so the admin-action
  // history is forensically reconstructable.
  await logAuditEvent({
    tenantId: null,
    actorUserId: null,
    actorKind: "admin",
    action: "admin.activity.viewed",
    resourceType: "activity_log",
    metadata: {
      filters: {
        tenant_id_prefix: tenantId,
        action_kinds: actionKinds,
        from: fromDate,
        to: toDate,
      },
      page,
      page_size: PAGE_SIZE,
    },
  });

  const filterFields: ReadonlyArray<AdminFilterField> = [
    {
      kind: "text",
      name: "tenant_id",
      label: "Tenant ID (prefix)",
      defaultValue: tenantId,
      placeholder: "e.g. 1a2b3c4d",
    },
    {
      kind: "multi-select",
      name: "action_kind",
      label: "Action kind",
      defaultValues: actionKinds,
      options: distinctKinds.map((k) => ({ value: k, label: k })),
    },
    {
      kind: "date",
      name: "from",
      label: "From",
      defaultValue: fromDate,
    },
    {
      kind: "date",
      name: "to",
      label: "To",
      defaultValue: toDate,
    },
  ];

  const columns: ReadonlyArray<AdminTableColumn<ActivityRow>> = [
    {
      id: "created_at",
      label: "When",
      width: "180px",
      render: (r) => (
        <span className="adm-table__mono">{formatTimestamp(r.created_at)}</span>
      ),
    },
    {
      id: "tenant_id",
      label: "Tenant",
      width: "140px",
      render: (r) => (
        <span
          className="adm-table__mono"
          title={r.tenant_id}
        >
          {truncateId(r.tenant_id, 8)}
        </span>
      ),
    },
    {
      id: "summary",
      label: "What AlterEgo did",
      render: (r) => (
        <span style={{ display: "block", maxWidth: "560px" }}>
          {r.summary}
        </span>
      ),
    },
    {
      id: "action_kind",
      label: "Kind",
      render: (r) => <span className="adm-pill">{r.action_kind}</span>,
    },
    {
      id: "chain_of_thought_summary",
      label: "Reasoning",
      render: (r) =>
        r.chain_of_thought_summary && r.chain_of_thought_summary.length > 0 ? (
          <details className="adm-json">
            <summary className="adm-json__summary">View reasoning</summary>
            <div className="adm-json__body">
              {r.chain_of_thought_summary}
            </div>
          </details>
        ) : (
          <span className="adm-table__mono" aria-label="No reasoning recorded">
            —
          </span>
        ),
    },
    {
      id: "open",
      label: "Tenant view",
      render: (r) => (
        <Link
          href={`/tenants/${r.tenant_id}/activity`}
          className="adm-table__row-link"
          aria-label={`Open tenant ${r.tenant_id} activity view`}
        >
          Open →
        </Link>
      ),
    },
  ];

  // Passthrough current filter state for pagination links.
  const passthrough: Record<string, string | string[]> = {};
  if (tenantId.length > 0) passthrough.tenant_id = tenantId;
  if (actionKinds.length > 0) passthrough.action_kind = actionKinds;
  if (fromDate.length > 0) passthrough.from = fromDate;
  if (toDate.length > 0) passthrough.to = toDate;

  return (
    <section aria-labelledby="activity-h1">
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
          Phase 1.0-C3 &middot; Activity mirror
        </p>
        <h1
          id="activity-h1"
          style={{ fontSize: "var(--fs-display-s)" }}
        >
          Activity log
        </h1>
        <p
          style={{
            fontSize: "var(--fs-body-lg)",
            color: "var(--ink-soft)",
            maxWidth: "720px",
          }}
        >
          The same feed each tenant sees in their app, mirrored here with a
          tenant column so support can see who did what without leaving the
          cpanel.
        </p>
      </div>

      <AdminFilterBar action="/activity" fields={filterFields} />

      <section
        className="adm-section"
        aria-labelledby="activity-table-h2"
      >
        <div className="adm-section__head">
          <h2
            id="activity-table-h2"
            className="adm-section__title"
          >
            Results
          </h2>
          <span className="adm-table__mono">
            {total.toLocaleString("en-US")} matched
          </span>
        </div>

        <AdminTable
          caption="Activity entries with timestamp, tenant, summary, action kind, and reasoning."
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          emptyMessage={
            tenantId.length > 0 ||
            actionKinds.length > 0 ||
            fromDate.length > 0 ||
            toDate.length > 0
              ? "No activity matches these filters."
              : "No activity recorded yet."
          }
        />

        <AdminPagination
          pathname="/activity"
          page={page}
          pageSize={PAGE_SIZE}
          rowsOnPage={rows.length}
          totalRows={total}
          searchParams={passthrough}
        />
      </section>
    </section>
  );
}
