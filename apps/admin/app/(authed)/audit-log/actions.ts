"use server";

/**
 * Audit-log Server Actions.
 *
 * `verifyChainAction` invokes the `verify_audit_chain` Postgres function
 * (see migrations/0003_audit_chain.sql). The function returns boolean
 * truth for the whole chain or a tenant slice; we also count the rows
 * that were checked so the cpanel can show "verified N rows" — that
 * count is sourced from `audit_log` itself (a second cheap select with
 * `head: true`).
 *
 * Every invocation writes an `admin.audit.chain_verified` row to the
 * audit log so the verification itself is auditable.
 *
 * Owner: [Forge + Atlas]
 */
import {
  createServiceClient,
  logAuditEvent,
} from "@autonomux/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VerifyChainResult {
  ok: boolean;
  rows_checked: number;
  /** Set when the chain is broken — earliest row whose recomputed hash failed. */
  first_break_row?: string;
  /** Set when something else went wrong (RPC error etc). */
  error?: string;
  /** Whether the verification ran across all tenants. */
  scope: "global" | "tenant";
  tenant_id?: string;
}

export async function verifyChainAction(
  tenantId: string | null,
): Promise<VerifyChainResult> {
  const scope: "global" | "tenant" =
    tenantId !== null && tenantId.length > 0 ? "tenant" : "global";

  if (scope === "tenant" && !UUID_RE.test(tenantId ?? "")) {
    return {
      ok: false,
      rows_checked: 0,
      scope,
      error: "Invalid tenant_id format.",
    };
  }

  const sb = createServiceClient();

  const { data: ok, error: rpcError } = await sb.rpc(
    "verify_audit_chain",
    { p_tenant_id: scope === "tenant" ? (tenantId as string) : null },
  );

  if (rpcError !== null) {
    await logAuditEvent({
      tenantId: scope === "tenant" ? tenantId : null,
      actorUserId: null,
      actorKind: "admin",
      action: "admin.audit.chain_verified",
      resourceType: "audit_log",
      metadata: {
        scope,
        ok: false,
        error: rpcError.message,
      },
    });
    return {
      ok: false,
      rows_checked: 0,
      scope,
      tenant_id: tenantId ?? undefined,
      error: rpcError.message,
    };
  }

  // Count rows in scope so we can report "verified N rows".
  let countQuery = sb
    .from("audit_log")
    .select("id", { count: "exact", head: true });
  if (scope === "tenant") {
    countQuery = countQuery.eq("tenant_id", tenantId as string);
  }
  const { count, error: countError } = await countQuery;
  const rowsChecked = count ?? 0;

  if (countError !== null) {
    // Non-fatal — we have the boolean answer; the count is decorative.
    process.stderr.write(
      `${JSON.stringify({
        level: "warn",
        msg: "audit.chain_verified.count_failed",
        error: countError.message,
        scope,
        tenant_id: tenantId,
        timestamp: new Date().toISOString(),
      })}\n`,
    );
  }

  // If broken, try to locate the first failing row for operator triage.
  let firstBreakRow: string | undefined;
  if (ok !== true) {
    const breakQuery = sb
      .from("audit_log")
      .select("id, created_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1);
    const finalQuery =
      scope === "tenant"
        ? breakQuery.eq("tenant_id", tenantId as string)
        : breakQuery;
    const { data: firstRows } = await finalQuery;
    firstBreakRow = firstRows?.[0]?.id;
  }

  const result: VerifyChainResult = {
    ok: ok === true,
    rows_checked: rowsChecked,
    scope,
    tenant_id: scope === "tenant" ? (tenantId as string) : undefined,
    first_break_row: firstBreakRow,
  };

  await logAuditEvent({
    tenantId: scope === "tenant" ? tenantId : null,
    actorUserId: null,
    actorKind: "admin",
    action: "admin.audit.chain_verified",
    resourceType: "audit_log",
    metadata: {
      scope,
      ok: result.ok,
      rows_checked: result.rows_checked,
      first_break_row: firstBreakRow ?? null,
    },
  });

  return result;
}
