/**
 * apps/web/app/api/gdpr/cancel-deletion/route.ts
 *
 * POST /api/gdpr/cancel-deletion
 *   body: { requestId: string }
 *
 * Cancels a pending Article 17 deletion during the 30-day grace window.
 *
 * Flow:
 *   1. Require auth.
 *   2. Look up the gdpr_requests row by id, scoped to user_id = current user.
 *   3. Confirm it's a deletion request in a cancellable state
 *      (pending / processing / completed-soft-phase) and not past expires_at.
 *   4. Remove the delayed BullMQ hard-delete job by bullmq_job_id.
 *   5. Update the row: status='cancelled', cancelled_at=now(), tenants.deleted_at
 *      cleared, tenants.status restored to 'active'.
 *   6. SQL trigger writes `gdpr.deletion.cancelled` to audit_log.
 *
 * Owner: [Atlas + Comply]
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { cancelDelayedGdprJob } from "@/lib/gdpr-queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  requestId: z.string().uuid(),
});

export async function POST(req: Request): Promise<Response> {
  let userId: string;
  try {
    const supabase = await createClient();
    const user = await requireAuth(supabase);
    userId = user.id;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "auth required",
      },
      { status: 401 },
    );
  }

  /**
   * Jury F-Trace-03 fix 2026-05-29: accept both JSON (programmatic
   * callers) AND form-urlencoded (the in-page Cancel button on
   * /app/settings/data uses a plain HTML form, no JS). Read the
   * Content-Type and parse accordingly.
   */
  let payload: z.infer<typeof schema>;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      payload = schema.parse(await req.json());
    } else {
      const form = await req.formData();
      const raw =
        form.get("requestId") ??
        form.get("request_id") ??
        form.get("id");
      payload = schema.parse({ requestId: typeof raw === "string" ? raw : "" });
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "bad request",
      },
      { status: 400 },
    );
  }

  const service = getSupabaseServiceClient();

  const { data: request, error: lookupErr } = await service
    .from("gdpr_requests")
    .select(
      "id, tenant_id, user_id, kind, status, bullmq_job_id, expires_at",
    )
    .eq("id", payload.requestId)
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupErr !== null) {
    return NextResponse.json(
      { ok: false, message: lookupErr.message },
      { status: 500 },
    );
  }
  if (request === null) {
    return NextResponse.json(
      { ok: false, message: "Request not found." },
      { status: 404 },
    );
  }
  if (request.kind !== "deletion") {
    return NextResponse.json(
      { ok: false, message: "Not a deletion request." },
      { status: 400 },
    );
  }
  if (
    request.status !== "pending" &&
    request.status !== "processing" &&
    request.status !== "completed"
  ) {
    return NextResponse.json(
      { ok: false, message: `Cannot cancel — status is ${request.status}.` },
      { status: 400 },
    );
  }
  // Grace window check — expires_at is the planned hard-delete moment.
  if (
    request.expires_at !== null &&
    new Date(request.expires_at).getTime() < Date.now()
  ) {
    return NextResponse.json(
      { ok: false, message: "Grace period has expired." },
      { status: 400 },
    );
  }

  // Remove the delayed hard-delete job. If it's already running / gone, we
  // still let the cancel proceed at the data layer — the hard-delete worker
  // re-checks status before purging.
  if (request.bullmq_job_id !== null) {
    await cancelDelayedGdprJob(request.bullmq_job_id);
  }

  // Restore the tenant.
  if (request.tenant_id !== null) {
    const { error: restoreErr } = await service
      .from("tenants")
      .update({
        deleted_at: null,
        status: "active",
      })
      .eq("id", request.tenant_id);
    if (restoreErr !== null) {
      return NextResponse.json(
        { ok: false, message: restoreErr.message },
        { status: 500 },
      );
    }
  }

  // Cancel the gdpr_requests row — SQL trigger writes the audit row.
  const { error: cancelErr } = await service
    .from("gdpr_requests")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", request.id);
  if (cancelErr !== null) {
    return NextResponse.json(
      { ok: false, message: cancelErr.message },
      { status: 500 },
    );
  }

  // Form submissions get a 303 redirect back to the page; JSON callers
  // get the typed result. Determined by the original Accept header so
  // server-action callers (fetch with Accept: application/json) keep
  // the structured response.
  const accept = req.headers.get("accept") ?? "";
  if (!accept.includes("application/json")) {
    return NextResponse.redirect(
      new URL("/app/settings/data?cancelled=1", req.url),
      303,
    );
  }
  return NextResponse.json({ ok: true });
}
