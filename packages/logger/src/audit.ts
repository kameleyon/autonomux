/**
 * Audit-log writer (PRD §8.3).
 *
 * Wraps a service-role insert against `public.audit_log`. The DB-side
 * trigger (`packages/db/migrations/0003_audit_chain.sql`) computes
 * `prev_hash` + `this_hash` — this function only inserts the row.
 *
 * Contract — NON-NEGOTIABLE:
 *   - On Supabase error: emit a structured `audit.write_failed` log at
 *     ERROR and DO NOT throw. The user action that triggered this audit
 *     write already succeeded; failing the action because the audit
 *     write hiccuped would harm the user AND obscure the original
 *     success.
 *   - On Supabase error: caller (or a downstream sweep) is expected to
 *     enqueue a retry on the `audit` BullMQ queue. We do NOT do the
 *     enqueue here to keep this package free of BullMQ deps; the
 *     `audit.write_failed` log line is the signal.
 *   - Audit writes that succeed are silent. No success log — the row
 *     itself is the receipt.
 *
 * TODO (Phase 1.0-B6): wire the `audit` queue retry consumer in
 * apps/worker. PRD line 305 should note: "audit log writer NEVER throws
 * on the user request path; failures emit `audit.write_failed` and are
 * re-driven by the `audit` BullMQ queue."
 */

import type { Logger } from "pino";

/**
 * Minimal Supabase client surface this module needs. Keeps us decoupled
 * from a hard `@supabase/supabase-js` import (the caller passes in a
 * concrete service-role client built in their app/package).
 */
export type AuditSupabaseClient = {
  from(table: "audit_log"): {
    insert(row: AuditLogInsert): {
      select(): {
        single(): Promise<{
          data: { id: string } | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
};

export type AuditActorKind = "user" | "service" | "admin" | "system" | "webhook";

export type WriteAuditEventInput = {
  /** Service-role Supabase client. Caller's responsibility to construct. */
  readonly supabase: AuditSupabaseClient;
  /** Logger to emit failure events on. */
  readonly logger: Logger;
  /** UUID of the user performing the action. Null for system/webhook actions. */
  readonly actor_user_id: string | null;
  /** Action verb. Use dot-namespaced lowercase, e.g. `oauth.grant`. */
  readonly action: string;
  /** Resource type, e.g. `agent_facts`. */
  readonly resource_type: string;
  /** Optional resource UUID / external id. */
  readonly resource_id?: string;
  /** Optional tenant scope. Null for cross-tenant admin/system events. */
  readonly tenant_id?: string | null;
  /** Optional actor kind override. Defaults to `user` when actor_user_id set, `system` otherwise. */
  readonly actor_kind?: AuditActorKind;
  /**
   * Free-form structured metadata. Will be PII-redacted by the logger
   * if the write fails and we log it; the DB row stores it verbatim,
   * so callers MUST NOT put raw secrets/PII here.
   */
  readonly metadata?: Record<string, unknown>;
};

type AuditLogInsert = {
  tenant_id?: string | null;
  actor_user_id: string | null;
  actor_kind: AuditActorKind;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Write an audit-log row. Never throws.
 *
 * Return value:
 *   - `{ ok: true, id }` on success.
 *   - `{ ok: false, error }` on failure (failure is also logged).
 *
 * Callers may ignore the return value entirely; the function is
 * fire-and-forget by design.
 */
export async function writeAuditEvent(
  input: WriteAuditEventInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const row: AuditLogInsert = {
    actor_user_id: input.actor_user_id,
    actor_kind:
      input.actor_kind ?? (input.actor_user_id ? "user" : "system"),
    action: input.action,
    resource_type: input.resource_type,
    metadata: input.metadata ?? {},
  };

  if (input.tenant_id !== undefined) row.tenant_id = input.tenant_id;
  if (input.resource_id !== undefined) row.resource_id = input.resource_id;

  try {
    const { data, error } = await input.supabase
      .from("audit_log")
      .insert(row)
      .select()
      .single();

    if (error || !data) {
      const message = error?.message ?? "unknown supabase error";
      input.logger.error(
        {
          event: "audit.write_failed",
          action: input.action,
          resource_type: input.resource_type,
          resource_id: input.resource_id,
          actor_user_id: input.actor_user_id,
          tenant_id: input.tenant_id,
          err_code: error?.code,
          err: message,
          // Signal to retry consumer: this row needs re-enqueue on
          // the `audit` BullMQ queue. The metric counter
          // `audit.write_failed` (emitted via logger fields) wires
          // the Axiom → PagerDuty alert.
          retry_queue: "audit",
        },
        "audit log write failed — original action succeeded; retry will be enqueued",
      );
      return { ok: false, error: message };
    }

    return { ok: true, id: data.id };
  } catch (err) {
    // Network/runtime error talking to Supabase. Same posture: log,
    // do not throw.
    const message = err instanceof Error ? err.message : String(err);
    input.logger.error(
      {
        event: "audit.write_failed",
        action: input.action,
        resource_type: input.resource_type,
        resource_id: input.resource_id,
        actor_user_id: input.actor_user_id,
        tenant_id: input.tenant_id,
        err: message,
        retry_queue: "audit",
      },
      "audit log write threw — original action succeeded; retry will be enqueued",
    );
    return { ok: false, error: message };
  }
}
