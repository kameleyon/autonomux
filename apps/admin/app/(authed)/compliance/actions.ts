/**
 * apps/admin/app/(authed)/compliance/actions.ts
 *
 * Admin-initiated GDPR Server Actions.
 *
 *   initiateExportForTenantAction({ tenantId, userId, adminOpToken })
 *     — file an Article 20 export on behalf of a tenant (support case).
 *
 *   initiateDeletionForTenantAction({ tenantId, userId, adminOpToken,
 *     confirmation })
 *     — file an Article 17 deletion. DESTRUCTIVE. Both gates required:
 *         1. AUTONOMUX_ADMIN_GDPR_TOKEN matches AUTONOMUX_ADMIN_OP_TOKEN env
 *            (this is the placeholder for admin TOTP step-up, which is owned
 *            by Phase 1.0-B admin-auth — once it lands, swap the env gate
 *            for `verifyStepUpToken({ purpose: 'step_up_account_delete', ... })`).
 *         2. confirmation === "delete tenant <tenantId-prefix>".
 *
 * Both actions enqueue to the same `gdpr` BullMQ queue the user-side actions
 * use; the worker doesn't care who originated the request. The
 * `admin_actor_user_id` column on gdpr_requests tags the row so the audit log
 * captures who pulled the trigger.
 *
 * Owner: [Atlas + Comply]
 */

"use server";

import "server-only";

import { timingSafeEqual } from "node:crypto";

import { redirect } from "next/navigation";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

import { createServiceClient, logAuditEvent } from "@autonomux/db";

const GDPR_QUEUE_NAME = "gdpr" as const;
const GDPR_JOB_EXPORT = "gdpr.export" as const;
const GDPR_JOB_DELETION_SOFT = "gdpr.deletion.soft" as const;

interface GdprPayload {
  readonly requestId: string;
  readonly tenantId: string;
  readonly data: Readonly<{ requestId: string }>;
}

interface GdprResult {
  readonly requestId: string;
  readonly status: "ok" | "deduped" | "stub";
  readonly note?: string;
}

let cachedQueue: Queue<GdprPayload, GdprResult> | null = null;

function getQueue(): Queue<GdprPayload, GdprResult> {
  if (cachedQueue !== null) return cachedQueue;
  const url = process.env["REDIS_URL"];
  if (url === undefined || url.length === 0) {
    throw new Error("[admin/compliance] REDIS_URL required");
  }
  const conn = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  cachedQueue = new Queue<GdprPayload, GdprResult>(GDPR_QUEUE_NAME, {
    connection: conn,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { age: 24 * 3600, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 3600, count: 5_000 },
    },
  });
  return cachedQueue;
}

// ---------------------------------------------------------------------------
// Admin-token gate — placeholder until Phase 1.0-B admin TOTP step-up lands
// ---------------------------------------------------------------------------

/**
 * Jury F-Trace-02 fix 2026-05-29: constant-time compare so the response
 * latency doesn't leak the prefix of the expected token. Length-mismatch
 * still returns same generic error — never confirm the token length to
 * the caller. Phase 1.0-D will replace the env-token gate with real
 * admin TOTP step-up.
 */
function assertAdminOpToken(suppliedToken: string): void {
  const expected = process.env["AUTONOMUX_ADMIN_OP_TOKEN"];
  if (expected === undefined || expected.length < 32) {
    throw new Error(
      "Admin destructive ops are not configured. Set AUTONOMUX_ADMIN_OP_TOKEN.",
    );
  }
  const suppliedBuf = Buffer.from(suppliedToken, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    throw new Error("Admin step-up token did not match.");
  }
}

/**
 * Jury F-Compass-01 / F-Trace-07 fix 2026-05-29: admin operations now
 * stamp the operator identity from `AUTONOMUX_ADMIN_USER_ID`. Until
 * Phase 1.0-D wires real admin Supabase auth, the operator UUID lives
 * in env so every admin-initiated row in `gdpr_requests` carries who
 * pulled the trigger. NULL is no longer acceptable — GDPR Art. 30 +
 * PRD §10 require an identifiable actor in the audit trail.
 */
function getAdminActorUserId(): string {
  const v = process.env["AUTONOMUX_ADMIN_USER_ID"];
  if (v === undefined || v.length === 0) {
    throw new Error(
      "Admin actor identity missing. Set AUTONOMUX_ADMIN_USER_ID to the operator UUID.",
    );
  }
  return v;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type AdminGdprResult =
  | { ok: true; requestId: string }
  | { ok: false; message: string };

// ---------------------------------------------------------------------------
// initiateExportForTenantAction
// ---------------------------------------------------------------------------

const exportSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  adminOpToken: z.string().min(32),
});

export async function submitInitiateExportForTenant(
  formData: FormData,
): Promise<void> {
  const result = await initiateExportForTenantAction({
    tenantId: String(formData.get("tenant_id") ?? ""),
    userId: String(formData.get("user_id") ?? ""),
    adminOpToken: String(formData.get("admin_op_token") ?? ""),
  });
  if (result.ok) {
    redirect(`/compliance?ok=export_queued&id=${encodeURIComponent(result.requestId)}`);
  }
  redirect(`/compliance?err=${encodeURIComponent(result.message)}`);
}

export async function initiateExportForTenantAction(args: {
  tenantId: string;
  userId: string;
  adminOpToken: string;
}): Promise<AdminGdprResult> {
  const parsed = exportSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Validation failed",
    };
  }
  try {
    assertAdminOpToken(parsed.data.adminOpToken);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Auth required",
    };
  }

  const sb = createServiceClient();
  const { data: inserted, error } = await sb
    .from("gdpr_requests")
    .insert({
      tenant_id: parsed.data.tenantId,
      user_id: parsed.data.userId,
      kind: "export",
      status: "pending",
      // Jury F-Compass-01 fix: admin operator UUID from env until 1.0-D wires session.
      admin_actor_user_id: getAdminActorUserId(),
    })
    .select("id")
    .single();
  if (error !== null || inserted === null) {
    return { ok: false, message: error?.message ?? "Insert failed" };
  }

  try {
    await getQueue().add(
      GDPR_JOB_EXPORT,
      {
        requestId: `gdpr.export:${inserted.id}`,
        tenantId: parsed.data.tenantId,
        data: { requestId: inserted.id },
      },
      { jobId: `gdpr.export:${inserted.id}` },
    );
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Enqueue failed",
    };
  }

  // Jury F-Compass-01 fix: audit-log the admin action with operator id.
  await logAuditEvent({
    tenantId: parsed.data.tenantId,
    actorUserId: getAdminActorUserId(),
    actorKind: "admin",
    action: "admin.gdpr.export.initiated",
    resourceType: "gdpr_request",
    resourceId: inserted.id,
    metadata: { target_user_id: parsed.data.userId },
  });

  return { ok: true, requestId: inserted.id };
}

// ---------------------------------------------------------------------------
// initiateDeletionForTenantAction
// ---------------------------------------------------------------------------

const deletionSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  adminOpToken: z.string().min(32),
  confirmation: z.string().trim().toLowerCase(),
});

export async function submitInitiateDeletionForTenant(
  formData: FormData,
): Promise<void> {
  const result = await initiateDeletionForTenantAction({
    tenantId: String(formData.get("tenant_id") ?? ""),
    userId: String(formData.get("user_id") ?? ""),
    adminOpToken: String(formData.get("admin_op_token") ?? ""),
    confirmation: String(formData.get("confirmation") ?? ""),
  });
  if (result.ok) {
    redirect(`/compliance?ok=deletion_queued&id=${encodeURIComponent(result.requestId)}`);
  }
  redirect(`/compliance?err=${encodeURIComponent(result.message)}`);
}

export async function initiateDeletionForTenantAction(args: {
  tenantId: string;
  userId: string;
  adminOpToken: string;
  confirmation: string;
}): Promise<AdminGdprResult> {
  const parsed = deletionSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Validation failed",
    };
  }

  // Typed confirmation: "delete tenant <first-8-of-tenantId>".
  const expectedPhrase = `delete tenant ${parsed.data.tenantId.slice(0, 8)}`;
  if (parsed.data.confirmation !== expectedPhrase) {
    return {
      ok: false,
      message: `Confirmation phrase did not match. Expected: "${expectedPhrase}".`,
    };
  }

  try {
    assertAdminOpToken(parsed.data.adminOpToken);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Auth required",
    };
  }

  const sb = createServiceClient();
  const { data: inserted, error } = await sb
    .from("gdpr_requests")
    .insert({
      tenant_id: parsed.data.tenantId,
      user_id: parsed.data.userId,
      kind: "deletion",
      status: "pending",
      admin_actor_user_id: getAdminActorUserId(),
    })
    .select("id")
    .single();
  if (error !== null || inserted === null) {
    return { ok: false, message: error?.message ?? "Insert failed" };
  }

  try {
    await getQueue().add(
      GDPR_JOB_DELETION_SOFT,
      {
        requestId: `gdpr.deletion.soft:${inserted.id}`,
        tenantId: parsed.data.tenantId,
        data: { requestId: inserted.id },
      },
      { jobId: `gdpr.deletion.soft:${inserted.id}` },
    );
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Enqueue failed",
    };
  }

  // Jury F-Compass-01 fix: audit-log the admin destructive action.
  await logAuditEvent({
    tenantId: parsed.data.tenantId,
    actorUserId: getAdminActorUserId(),
    actorKind: "admin",
    action: "admin.gdpr.deletion.initiated",
    resourceType: "gdpr_request",
    resourceId: inserted.id,
    metadata: { target_user_id: parsed.data.userId },
  });

  return { ok: true, requestId: inserted.id };
}
