/**
 * apps/admin/lib/gdpr-queries.ts
 *
 * Server-only read helpers for the admin cpanel Compliance page.
 *
 * Reads:
 *   - listPendingGdprRequests()  — status in (pending, processing)
 *   - listCompletedGdprRequests({ days }) — completed in the last N days
 *   - listRecentGdprAuditEvents({ limit })
 *
 * All via service-role; RLS already permits admins to SELECT
 * gdpr_requests + audit_log (per 0007_gdpr.sql + 0002_rls.sql).
 *
 * Owner: [Forge + Comply]
 */
import "server-only";

import { createServiceClient, type Tables } from "@autonomux/db";

export type GdprRequestAdminRow = Pick<
  Tables<"gdpr_requests">,
  | "id"
  | "tenant_id"
  | "user_id"
  | "kind"
  | "status"
  | "admin_actor_user_id"
  | "failure_reason"
  | "requested_at"
  | "started_at"
  | "completed_at"
  | "expires_at"
>;

const REQUEST_COLUMNS =
  "id, tenant_id, user_id, kind, status, admin_actor_user_id, failure_reason, requested_at, started_at, completed_at, expires_at";

export async function listPendingGdprRequests(): Promise<GdprRequestAdminRow[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("gdpr_requests")
    .select(REQUEST_COLUMNS)
    .in("status", ["pending", "processing"])
    .order("requested_at", { ascending: false })
    .limit(100);
  if (error !== null) {
    throw new Error(`[admin/gdpr] listPendingGdprRequests: ${error.message}`);
  }
  return (data ?? []) as GdprRequestAdminRow[];
}

export async function listCompletedGdprRequests({
  days,
}: {
  days: number;
}): Promise<GdprRequestAdminRow[]> {
  const sb = createServiceClient();
  const sinceIso = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await sb
    .from("gdpr_requests")
    .select(REQUEST_COLUMNS)
    .eq("status", "completed")
    .gte("completed_at", sinceIso)
    .order("completed_at", { ascending: false })
    .limit(100);
  if (error !== null) {
    throw new Error(`[admin/gdpr] listCompletedGdprRequests: ${error.message}`);
  }
  return (data ?? []) as GdprRequestAdminRow[];
}

export interface GdprAuditEvent {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  actor_kind: Tables<"audit_log">["actor_kind"];
  action: string;
  resource_id: string | null;
  created_at: string;
}

export async function listRecentGdprAuditEvents({
  limit,
}: {
  limit: number;
}): Promise<GdprAuditEvent[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("audit_log")
    .select(
      "id, tenant_id, actor_user_id, actor_kind, action, resource_id, created_at",
    )
    .like("action", "gdpr.%")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));
  if (error !== null) {
    throw new Error(`[admin/gdpr] listRecentGdprAuditEvents: ${error.message}`);
  }
  return (data ?? []) as GdprAuditEvent[];
}
