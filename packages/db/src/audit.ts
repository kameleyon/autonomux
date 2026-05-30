/**
 * packages/db/src/audit.ts
 *
 * `logAuditEvent()` — the single entry point for compliance-grade writes
 * to `audit_log`. Wraps the service-role insert; the DB trigger in
 * 0003_audit_chain.sql computes prev_hash + this_hash and refuses
 * UPDATE/DELETE.
 *
 * Every Server Action that mutates user data MUST call this. SOC 2 CC6.1
 * and GDPR Art. 30 both require provable per-write audit history.
 *
 * Jury F-TRC-01 fix 2026-05-29: this writer NEVER throws on the
 * user-request path. PRD §8.3 contract: audit-log write failure must
 * not block a user action that itself succeeded. Failures emit a
 * structured error log + return `{ ok: false }` so callers can decide
 * whether to surface a soft warning. The downstream `audit` BullMQ
 * queue (apps/worker) sweeps failed writes for retry — wired in the
 * next slice.
 *
 * Previously: two parallel writers existed (`@autonomux/db.logAuditEvent`
 * threw on failure, `@autonomux/logger.writeAuditEvent` was correct).
 * The DB-package writer is now the single source of truth; the logger
 * package re-exports this function as a thin alias to preserve the
 * existing call-sites in `packages/logger`.
 *
 * Owner: [Atlas + Comply]
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "./client";
import type { AuditActorKind, Database, Json, Tables } from "./types";

export interface LogAuditEventArgs {
  /** Tenant the event belongs to. Null only for unauthenticated / system events. */
  tenantId: string | null;
  /** auth.users.id of the human / service principal that triggered the write. */
  actorUserId: string | null;
  actorKind: AuditActorKind;
  /** Stable verb-form: "user.signup", "tenant.create", "session.start", etc. */
  action: string;
  /** Domain object kind: "user", "tenant", "alterego_settings", … */
  resourceType: string;
  /** Optional id of the touched row. */
  resourceId?: string | null;
  /** Free-form structured metadata. NO PII beyond what's needed for replay. */
  metadata?: Json;
}

/**
 * Insert one audit row via service-role.
 *
 * Contract (PRD §8.3):
 *   - NEVER throws on the user-request path.
 *   - On failure: emits a structured stderr line tagged with
 *     `retry_queue: "audit"` (sweep target for the worker's audit queue).
 *   - Returns `Tables<"audit_log"> | null` — null signals the write was
 *     dropped and queued for retry.
 *
 * Why: the audit log is a compliance prerequisite, but its FAILURE must
 * not roll back a user action that already committed (SOC 2 CC6.1 +
 * GDPR Art. 30 require completeness, not transactionality). Failed
 * writes are re-driven through the `audit` BullMQ queue.
 */
export async function logAuditEvent(
  args: LogAuditEventArgs,
  sb: SupabaseClient<Database> = createServiceClient(),
): Promise<Tables<"audit_log"> | null> {
  try {
    const { data, error } = await sb
      .from("audit_log")
      .insert({
        tenant_id: args.tenantId,
        actor_user_id: args.actorUserId,
        actor_kind: args.actorKind,
        action: args.action,
        resource_type: args.resourceType,
        resource_id: args.resourceId ?? null,
        metadata: args.metadata ?? {},
      })
      .select()
      .single();

    if (error !== null) {
      emitAuditFailure(args, error.message);
      return null;
    }
    if (data === null) {
      emitAuditFailure(args, "insert returned no row");
      return null;
    }
    return data;
  } catch (caught) {
    const msg = caught instanceof Error ? caught.message : String(caught);
    emitAuditFailure(args, msg);
    return null;
  }
}

/**
 * Structured failure emitter. Writes a JSON line to stderr so that
 * Pino (in apps that ship a logger) + Vercel / Railway log shippers
 * both capture it. The `retry_queue` flag is the signal the worker's
 * audit-queue sweeper looks for.
 */
function emitAuditFailure(args: LogAuditEventArgs, error: string): void {
  const line = {
    level: "error",
    msg: "audit.write_failed",
    retry_queue: "audit",
    tenant_id: args.tenantId,
    actor_user_id: args.actorUserId,
    action: args.action,
    resource_type: args.resourceType,
    resource_id: args.resourceId ?? null,
    error,
    timestamp: new Date().toISOString(),
  };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}
