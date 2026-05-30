/**
 * apps/admin/lib/feature-flags-queries.ts
 *
 * Server-only query helpers for the Feature Flags console.
 *
 * Reads via the @autonomux/db service-role client. Every function here
 * is server-only by definition.
 *
 * Owner: [Forge + Lens]
 */
import "server-only";

import { createServiceClient, type Tables } from "@autonomux/db";

export type FeatureFlagRow = Tables<"feature_flags">;

export interface FeatureFlagAuditEntry {
  id: string;
  action: string;
  actor_user_id: string | null;
  actor_kind: string;
  metadata: Tables<"audit_log">["metadata"];
  created_at: string;
}

export async function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("feature_flags")
    .select("*")
    .order("key", { ascending: true });
  if (error !== null) {
    throw new Error(`[admin.listFeatureFlags] ${error.message}`);
  }
  return data ?? [];
}

export async function getFeatureFlag(
  key: string,
): Promise<FeatureFlagRow | null> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("feature_flags")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (error !== null) {
    throw new Error(`[admin.getFeatureFlag] ${error.message}`);
  }
  return data;
}

/**
 * History for one flag: every audit_log row where resource_type='feature_flag'
 * AND resource_id=key, newest first. Bounded to 50 rows — older history is
 * available via the full audit-log viewer.
 */
export async function listFeatureFlagAudit(
  key: string,
): Promise<FeatureFlagAuditEntry[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("audit_log")
    .select("id, action, actor_user_id, actor_kind, metadata, created_at")
    .eq("resource_type", "feature_flag")
    .eq("resource_id", key)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error !== null) {
    throw new Error(`[admin.listFeatureFlagAudit] ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    actor_user_id: r.actor_user_id,
    actor_kind: r.actor_kind,
    metadata: r.metadata,
    created_at: r.created_at,
  }));
}
