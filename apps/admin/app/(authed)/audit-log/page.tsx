/**
 * Audit log — Phase 1.0-C2.
 *
 * Operator surface per PRD §3.2 / §7.5. Reads the signed-chain audit_log
 * table cross-tenant via service-role. Verify-chain button calls the
 * `verify_audit_chain` Postgres function (see migrations/0003) so the
 * cpanel can confirm tamper-evidence without a CLI.
 *
 * Owner: [Forge + Vega]
 */
import {
  type AuditActorKind,
  logAuditEvent,
} from "@autonomux/db";

import {
  AdminFilterBar,
  type AdminFilterField,
} from "@/components/AdminFilterBar";
import { AdminPagination } from "@/components/AdminPagination";
import {
  AdminTable,
  type AdminTableColumn,
} from "@/components/AdminTable";
import { JsonPreview } from "@/components/JsonPreview";
import { listAuditLogPaged } from "@/lib/queries";
import { formatTimestamp, truncateId } from "@/lib/format";

import { VerifyChainButton } from "./VerifyChainButton";

export const dynamic = "force-dynamic";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const PAGE_SIZE = 50;

// Common verbs ship now; the audit log accepts any string action so the
// dropdown stays a *shortlist* — operators can also pass an exact
// `action` value via querystring.
const ACTION_OPTIONS = [
  "user.signup",
  "user.signin",
  "user.signout",
  "tenant.create",
  "tenant.suspend",
  "session.start",
  "session.end",
  "alterego_settings.update",
  "connected_account.granted",
  "connected_account.revoked",
  "agent_run.executed",
  "admin.tenant.list_viewed",
  "admin.tenant.viewed",
  "admin.audit.chain_verified",
] as const;

const ACTOR_KIND_OPTIONS: ReadonlyArray<{
  value: "" | AuditActorKind;
  label: string;
}> = [
  { value: "", label: "Any" },
  { value: "user", label: "User" },
  { value: "service", label: "Service" },
  { value: "admin", label: "Admin" },
  { value: "system", label: "System" },
  { value: "webhook", label: "Webhook" },
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asStringArray(
  value: string | string[] | undefined,
): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
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

function parseActorKind(
  value: string | string[] | undefined,
): AuditActorKind | undefined {
  const raw = asStr(value);
  if (raw.length === 0) return undefined;
  const allowed: ReadonlyArray<AuditActorKind> = [
    "user",
    "service",
    "admin",
    "system",
    "webhook",
  ];
  return allowed.includes(raw as AuditActorKind)
    ? (raw as AuditActorKind)
    : undefined;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}): Promise<React.ReactElement> {
  const params =
    searchParams !== undefined ? await searchParams : {};

  const tenantIdRaw = asStr(params.tenant_id);
  const tenantIdValid =
    tenantIdRaw.length === 0 || UUID_RE.test(tenantIdRaw)
      ? tenantIdRaw
      : "";
  const actions = asStringArray(params.action).filter((a) =>
    (ACTION_OPTIONS as readonly string[]).includes(a),
  );
  const actorKind = parseActorKind(params.actor_kind);
  const startDateRaw = asStr(params.start);
  const endDateRaw = asStr(params.end);

  const page = asPage(params.page);

  const startIso =
    startDateRaw.length > 0
      ? new Date(`${startDateRaw}T00:00:00Z`).toISOString()
      : undefined;
  const endIso =
    endDateRaw.length > 0
      ? new Date(`${endDateRaw}T23:59:59Z`).toISOString()
      : undefined;

  const { rows, total } = await listAuditLogPaged({
    filters: {
      tenantId: tenantIdValid.length > 0 ? tenantIdValid : undefined,
      actions,
      actorKind,
      startDate: startIso,
      endDate: endIso,
    },
    page,
    pageSize: PAGE_SIZE,
  });

  await logAuditEvent({
    tenantId: tenantIdValid.length > 0 ? tenantIdValid : null,
    actorUserId: null,
    actorKind: "admin",
    action: "admin.audit.list_viewed",
    resourceType: "audit_log",
    metadata: {
      filters: {
        tenant_id: tenantIdValid,
        actions,
        actor_kind: actorKind ?? null,
        start: startDateRaw,
        end: endDateRaw,
      },
      page,
      page_size: PAGE_SIZE,
    },
  });

  const filterFields: ReadonlyArray<AdminFilterField> = [
    {
      kind: "text",
      name: "tenant_id",
      label: "Tenant ID (exact)",
      defaultValue: tenantIdValid,
      placeholder: "uuid",
    },
    {
      kind: "multi-select",
      name: "action",
      label: "Action",
      defaultValues: actions,
      options: ACTION_OPTIONS.map((a) => ({ value: a, label: a })),
    },
    {
      kind: "select",
      name: "actor_kind",
      label: "Actor",
      defaultValue: actorKind ?? "",
      options: ACTOR_KIND_OPTIONS,
    },
    {
      kind: "date",
      name: "start",
      label: "Start date",
      defaultValue: startDateRaw,
    },
    {
      kind: "date",
      name: "end",
      label: "End date",
      defaultValue: endDateRaw,
    },
  ];

  type AuditRow = (typeof rows)[number];

  const columns: ReadonlyArray<AdminTableColumn<AuditRow>> = [
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
      id: "actor",
      label: "Actor",
      render: (r) => (
        <span className="adm-table__mono" title={r.actor_user_id ?? ""}>
          {truncateId(r.actor_user_id, 8)}
        </span>
      ),
    },
    {
      id: "actor_kind",
      label: "Kind",
      render: (r) => <span className="adm-pill">{r.actor_kind}</span>,
    },
    {
      id: "action",
      label: "Action",
      render: (r) => (
        <span className="adm-table__mono">{r.action}</span>
      ),
    },
    {
      id: "resource_type",
      label: "Resource",
      render: (r) => (
        <span className="adm-table__mono">{r.resource_type}</span>
      ),
    },
    {
      id: "resource_id",
      label: "Resource ID",
      render: (r) => (
        <span className="adm-table__mono" title={r.resource_id ?? ""}>
          {truncateId(r.resource_id, 8)}
        </span>
      ),
    },
    {
      id: "metadata",
      label: "Metadata",
      render: (r) => <JsonPreview value={r.metadata} label="meta" />,
    },
  ];

  const passthroughParams: Record<string, string | string[]> = {};
  if (tenantIdValid.length > 0) passthroughParams.tenant_id = tenantIdValid;
  if (actions.length > 0) passthroughParams.action = actions;
  if (actorKind !== undefined) passthroughParams.actor_kind = actorKind;
  if (startDateRaw.length > 0) passthroughParams.start = startDateRaw;
  if (endDateRaw.length > 0) passthroughParams.end = endDateRaw;

  return (
    <section aria-labelledby="audit-h1">
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
        Phase 1.0-C2 &middot; Audit log
      </p>
      <h1
        id="audit-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Audit log
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
          marginBottom: "var(--sp-24)",
        }}
      >
        Signed-chain audit trail with 7-year retention (PRD §7.5).
        Replays the chain hash on demand.
      </p>

      <section
        aria-labelledby="audit-verify-h2"
        style={{ marginBottom: "var(--sp-24)" }}
      >
        <div className="adm-section__head">
          <h2 id="audit-verify-h2" className="adm-section__title">
            Chain verification
          </h2>
          <span className="adm-table__mono">
            {tenantIdValid.length > 0
              ? `scope: tenant ${truncateId(tenantIdValid, 8)}`
              : "scope: all tenants"}
          </span>
        </div>
        <VerifyChainButton
          tenantId={tenantIdValid.length > 0 ? tenantIdValid : null}
        />
      </section>

      <AdminFilterBar action="/audit-log" fields={filterFields} />

      <section className="adm-section" aria-labelledby="audit-rows-h2">
        <div className="adm-section__head">
          <h2 id="audit-rows-h2" className="adm-section__title">
            Entries
          </h2>
          <span className="adm-table__mono">
            {total.toLocaleString()} matched
          </span>
        </div>

        <AdminTable
          caption="Audit log entries: when, actor, action, resource, metadata."
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          emptyMessage={
            tenantIdValid.length > 0 ||
            actions.length > 0 ||
            actorKind !== undefined ||
            startDateRaw.length > 0 ||
            endDateRaw.length > 0
              ? "No audit entries match these filters."
              : "No audit entries recorded yet."
          }
        />

        <AdminPagination
          pathname="/audit-log"
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
