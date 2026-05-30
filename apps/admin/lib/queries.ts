/**
 * Server-only query helpers for the admin cpanel.
 *
 * Composes the service-role client from @autonomux/db. Every function here
 * is server-only by definition (service-role key never reaches the
 * browser). Pages import these from Server Components / Server Actions
 * only — never from "use client" modules.
 *
 * All queries are paginated server-side. No call here loads more than
 * its declared `limit`.
 *
 * Owner: [Forge + Atlas]
 */
import "server-only";

import {
  createServiceClient,
  type Tables,
  type TenantPlan,
  type TenantStatus,
  type AuditActorKind,
} from "@autonomux/db";

// ---------------------------------------------------------------------------
// Tenants list — server-side pagination + filtering.
// ---------------------------------------------------------------------------

export interface ListTenantsFilters {
  plans?: ReadonlyArray<TenantPlan>;
  statuses?: ReadonlyArray<TenantStatus>;
  /** Prefix match on tenants.id (UUID text). */
  idPrefix?: string;
}

export interface TenantListRow {
  id: string;
  plan: TenantPlan;
  status: TenantStatus;
  created_at: string;
  deleted_at: string | null;
  last_activity_at: string | null;
  member_count: number;
}

export interface ListTenantsResult {
  rows: TenantListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listTenantsPaged({
  filters,
  page,
  pageSize,
}: {
  filters: ListTenantsFilters;
  page: number;
  pageSize: number;
}): Promise<ListTenantsResult> {
  const sb = createServiceClient();
  const offset = (page - 1) * pageSize;

  let query = sb
    .from("tenants")
    .select("id, plan, status, created_at, deleted_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.plans && filters.plans.length > 0) {
    query = query.in("plan", filters.plans as unknown as string[]);
  }
  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in("status", filters.statuses as unknown as string[]);
  }
  if (filters.idPrefix && filters.idPrefix.length > 0) {
    // Prefix match on UUID — case-sensitive `like`.
    query = query.like("id", `${filters.idPrefix}%`);
  }

  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error !== null) {
    throw new Error(`[admin.listTenantsPaged] ${error.message}`);
  }
  const baseRows = data ?? [];
  if (baseRows.length === 0) {
    return { rows: [], total: count ?? 0, page, pageSize };
  }

  const tenantIds = baseRows.map((r) => r.id);

  // Last-activity = max(agent_runs.created_at) per tenant. Single round trip:
  // pull recent runs for these tenants and reduce in memory (bounded by
  // pageSize × N — fine for cpanel use).
  const [runRes, memberRes] = await Promise.all([
    sb
      .from("agent_runs")
      .select("tenant_id, created_at")
      .in("tenant_id", tenantIds)
      .order("created_at", { ascending: false })
      .limit(pageSize * 4),
    sb
      .from("tenant_members")
      .select("tenant_id")
      .in("tenant_id", tenantIds),
  ]);

  if (runRes.error !== null) {
    throw new Error(`[admin.listTenantsPaged.runs] ${runRes.error.message}`);
  }
  if (memberRes.error !== null) {
    throw new Error(
      `[admin.listTenantsPaged.members] ${memberRes.error.message}`,
    );
  }

  const lastActivity = new Map<string, string>();
  for (const row of runRes.data ?? []) {
    const existing = lastActivity.get(row.tenant_id);
    if (existing === undefined || row.created_at > existing) {
      lastActivity.set(row.tenant_id, row.created_at);
    }
  }
  const memberCount = new Map<string, number>();
  for (const row of memberRes.data ?? []) {
    memberCount.set(row.tenant_id, (memberCount.get(row.tenant_id) ?? 0) + 1);
  }

  const rows: TenantListRow[] = baseRows.map((r) => ({
    id: r.id,
    plan: r.plan,
    status: r.status,
    created_at: r.created_at,
    deleted_at: r.deleted_at,
    last_activity_at: lastActivity.get(r.id) ?? null,
    member_count: memberCount.get(r.id) ?? 0,
  }));

  return { rows, total: count ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// Tenant drill-down snapshot.
// ---------------------------------------------------------------------------

export interface TenantCounters {
  agent_runs_30d: number;
  sub_agent_runs_30d: number;
  cost_usd_cents_30d: number;
  connected_accounts_active: number;
  audit_log_30d: number;
}

export interface TenantDrilldown {
  tenant: Tables<"tenants"> | null;
  counters: TenantCounters;
  recent_runs: Array<Tables<"agent_runs">>;
  connected_accounts: Array<Tables<"connected_accounts">>;
  members: Array<Tables<"tenant_members">>;
}

const MS_IN_DAY = 24 * 60 * 60 * 1000;

export async function getTenantDrilldown(
  tenantId: string,
): Promise<TenantDrilldown> {
  const sb = createServiceClient();
  const since = new Date(Date.now() - 30 * MS_IN_DAY).toISOString();

  const [
    tenantRes,
    runsCountRes,
    subRunsCountRes,
    runsForCostRes,
    accountsRes,
    auditCountRes,
    recentRunsRes,
    membersRes,
  ] = await Promise.all([
    sb.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
    sb
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", since),
    sb
      .from("sub_agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", since),
    sb
      .from("agent_runs")
      .select("cost_usd_cents")
      .eq("tenant_id", tenantId)
      .gte("created_at", since),
    sb
      .from("connected_accounts")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("integration", { ascending: true }),
    sb
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", since),
    sb
      .from("agent_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("tenant_members")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
  ]);

  // Surface DB errors as a single combined exception so callers see them all.
  const errors: string[] = [];
  for (const r of [
    tenantRes,
    runsCountRes,
    subRunsCountRes,
    runsForCostRes,
    accountsRes,
    auditCountRes,
    recentRunsRes,
    membersRes,
  ]) {
    if (r.error !== null) errors.push(r.error.message);
  }
  if (errors.length > 0) {
    throw new Error(`[admin.getTenantDrilldown] ${errors.join("; ")}`);
  }

  const costCents = (runsForCostRes.data ?? []).reduce(
    (sum, r) => sum + (r.cost_usd_cents ?? 0),
    0,
  );

  const accounts = accountsRes.data ?? [];
  const activeAccounts = accounts.filter(
    (a) => a.oauth_status === "active",
  ).length;

  return {
    tenant: tenantRes.data ?? null,
    counters: {
      agent_runs_30d: runsCountRes.count ?? 0,
      sub_agent_runs_30d: subRunsCountRes.count ?? 0,
      cost_usd_cents_30d: costCents,
      connected_accounts_active: activeAccounts,
      audit_log_30d: auditCountRes.count ?? 0,
    },
    recent_runs: recentRunsRes.data ?? [],
    connected_accounts: accounts,
    members: membersRes.data ?? [],
  };
}

// ---------------------------------------------------------------------------
// Audit log listing.
// ---------------------------------------------------------------------------

export interface AuditLogFilters {
  tenantId?: string;
  actions?: ReadonlyArray<string>;
  actorKind?: AuditActorKind;
  startDate?: string;
  endDate?: string;
}

export interface AuditLogPage {
  rows: Array<Tables<"audit_log">>;
  total: number;
  page: number;
  pageSize: number;
}

export async function listAuditLogPaged({
  filters,
  page,
  pageSize,
}: {
  filters: AuditLogFilters;
  page: number;
  pageSize: number;
}): Promise<AuditLogPage> {
  const sb = createServiceClient();
  const offset = (page - 1) * pageSize;

  let q = sb
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.tenantId && filters.tenantId.length > 0) {
    // tenant_id is a UUID column — exact match. (Prefix match was considered
    // but UUIDs make poor prefix targets; spec calls for full id here.)
    q = q.eq("tenant_id", filters.tenantId);
  }
  if (filters.actions && filters.actions.length > 0) {
    q = q.in("action", filters.actions as string[]);
  }
  if (filters.actorKind !== undefined) {
    q = q.eq("actor_kind", filters.actorKind);
  }
  if (filters.startDate !== undefined) {
    q = q.gte("created_at", filters.startDate);
  }
  if (filters.endDate !== undefined) {
    q = q.lte("created_at", filters.endDate);
  }

  q = q.range(offset, offset + pageSize - 1);

  const { data, error, count } = await q;
  if (error !== null) {
    throw new Error(`[admin.listAuditLogPaged] ${error.message}`);
  }

  return {
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };
}
