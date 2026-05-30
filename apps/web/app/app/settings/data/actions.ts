/**
 * apps/web/app/app/settings/data/actions.ts
 *
 * Server Actions for GDPR Settings → Data:
 *
 *   requestExportAction()                  — enqueue Article 20 export
 *   requestDeletionAction({...})           — enqueue Article 17 deletion;
 *                                              requires typed confirmation +
 *                                              fresh TOTP step-up
 *   getRequestStatusAction(id)             — poll for the UI
 *
 * Every action:
 *   - re-validates auth + tenant on the server
 *   - inserts via service-role (the user does not have INSERT on gdpr_requests
 *     by RLS design — only service-role does)
 *   - enqueues to the `gdpr` BullMQ queue
 *   - audit-logs the request (the SQL trigger handles it on INSERT; the
 *     transition trigger handles every subsequent state change)
 *
 * Owner: [Atlas + Comply + Shield]
 */

"use server";

import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifyStepUpToken } from "@autonomux/auth";
import type { GdprRequestStatus } from "@autonomux/db";

import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getStepUpSecret } from "@/lib/twofa/config";
import { STEP_UP_COOKIE } from "@/app/sign-in/totp/action";
import {
  enqueueGdprDeletionSoft,
  enqueueGdprExport,
} from "@/lib/gdpr-queue";

// ---------------------------------------------------------------------------
// Result types — Server Actions return discriminated unions
// ---------------------------------------------------------------------------

export type ActionError =
  | "AUTH_REQUIRED"
  | "TENANT_MISSING"
  | "VALIDATION"
  | "STEP_UP_REQUIRED"
  | "CONFIRMATION_MISMATCH"
  | "DUPLICATE_PENDING"
  | "QUEUE_FAILED"
  | "UNKNOWN";

export type RequestExportResult =
  | { ok: true; requestId: string }
  | { ok: false; code: ActionError; message: string };

export type RequestDeletionResult =
  | { ok: true; requestId: string }
  | { ok: false; code: ActionError; message: string };

export interface GdprRequestPublic {
  readonly id: string;
  readonly kind: "export" | "deletion";
  readonly status: GdprRequestStatus;
  readonly requested_at: string;
  readonly completed_at: string | null;
  readonly expires_at: string | null;
  readonly download_url: string | null;
  readonly failure_reason: string | null;
}

// ---------------------------------------------------------------------------
// requestExportAction — Article 20
// ---------------------------------------------------------------------------

/**
 * Form-friendly wrapper for `<form action>`. Redirects to the page with a
 * status query param.
 */
export async function submitRequestExport(): Promise<void> {
  const result = await requestExportAction();
  if (result.ok) {
    redirect(`/app/settings/data?ok=export_queued&id=${encodeURIComponent(result.requestId)}`);
  }
  redirect(
    `/app/settings/data?err=${encodeURIComponent(result.code)}&msg=${encodeURIComponent(result.message)}`,
  );
}

export async function requestExportAction(): Promise<RequestExportResult> {
  let userId: string;
  let tenantId: string;
  try {
    const supabase = await createClient();
    const user = await requireAuth(supabase);
    userId = user.id;
    tenantId = await requireTenantId(supabase);
  } catch (err) {
    const code =
      err instanceof Error && err.name === "TenantMissingError"
        ? "TENANT_MISSING"
        : "AUTH_REQUIRED";
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : "Authentication required",
    };
  }

  const service = getSupabaseServiceClient();

  // Refuse to queue a second export if one is already pending/processing
  // for this user. UX guard — the SQL doesn't prevent it, but multiple
  // simultaneous exports are wasteful and confusing.
  const { data: existing } = await service
    .from("gdpr_requests")
    .select("id, status")
    .eq("user_id", userId)
    .eq("kind", "export")
    .in("status", ["pending", "processing"])
    .limit(1)
    .maybeSingle();
  if (existing !== null && existing !== undefined) {
    return {
      ok: false,
      code: "DUPLICATE_PENDING",
      message: "An export is already in progress.",
    };
  }

  const { data: inserted, error: insertErr } = await service
    .from("gdpr_requests")
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      kind: "export",
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr !== null || inserted === null) {
    return {
      ok: false,
      code: "UNKNOWN",
      message: insertErr?.message ?? "Could not create request.",
    };
  }

  try {
    await enqueueGdprExport({ tenantId, requestId: inserted.id });
  } catch (err) {
    // Roll back the row — leaving a permanent 'pending' would be confusing.
    await service
      .from("gdpr_requests")
      .update({
        status: "failed",
        failure_reason:
          err instanceof Error ? err.message : "queue enqueue failed",
      })
      .eq("id", inserted.id);
    return {
      ok: false,
      code: "QUEUE_FAILED",
      message: err instanceof Error ? err.message : "Could not queue the job.",
    };
  }

  return { ok: true, requestId: inserted.id };
}

// ---------------------------------------------------------------------------
// requestDeletionAction — Article 17
// ---------------------------------------------------------------------------
//
// Two gates BOTH required:
//   1. Typed confirmation: the user types "delete my account" exactly.
//   2. Fresh TOTP step-up: the STEP_UP_COOKIE must verify against purpose
//      "step_up_account_delete" within the 5-min TTL.
//
// On success: gdpr_requests row inserted (status=pending), gdpr.deletion.soft
// job enqueued, user signed out (Supabase session ended), redirect to /.
// ---------------------------------------------------------------------------

const DELETION_CONFIRMATION_PHRASE = "delete my account" as const;

const deletionSchema = z.object({
  confirmation: z.string().trim().toLowerCase(),
});

export async function submitRequestDeletion(formData: FormData): Promise<void> {
  const result = await requestDeletionAction({
    confirmation: String(formData.get("confirmation") ?? ""),
  });
  if (result.ok) {
    // Account is marked; sign the session out and redirect to landing.
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // best-effort
    }
    redirect("/?signed_out=deletion_scheduled");
  }
  redirect(
    `/app/settings/data?err=${encodeURIComponent(result.code)}&msg=${encodeURIComponent(result.message)}`,
  );
}

export async function requestDeletionAction(args: {
  confirmation: string;
}): Promise<RequestDeletionResult> {
  const parsed = deletionSchema.safeParse({ confirmation: args.confirmation });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  if (parsed.data.confirmation !== DELETION_CONFIRMATION_PHRASE) {
    return {
      ok: false,
      code: "CONFIRMATION_MISMATCH",
      message: `You must type "${DELETION_CONFIRMATION_PHRASE}" exactly to confirm.`,
    };
  }

  let userId: string;
  let tenantId: string;
  try {
    const supabase = await createClient();
    const user = await requireAuth(supabase);
    userId = user.id;
    tenantId = await requireTenantId(supabase);
  } catch (err) {
    const code =
      err instanceof Error && err.name === "TenantMissingError"
        ? "TENANT_MISSING"
        : "AUTH_REQUIRED";
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : "Authentication required",
    };
  }

  // Step-up: require fresh TOTP for `step_up_account_delete`. If the user
  // arrived here without one, send them to /sign-in/totp first.
  const cookieStore = await cookies();
  const stepUp = verifyStepUpToken(cookieStore.get(STEP_UP_COOKIE)?.value, {
    userId,
    purpose: "step_up_account_delete",
    secret: getStepUpSecret(),
  });
  if (stepUp === null) {
    return {
      ok: false,
      code: "STEP_UP_REQUIRED",
      message: "Please re-enter your authenticator code first.",
    };
  }

  const service = getSupabaseServiceClient();

  // Block duplicate deletion requests.
  const { data: existing } = await service
    .from("gdpr_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "deletion")
    .in("status", ["pending", "processing", "completed"])
    .limit(1)
    .maybeSingle();
  if (existing !== null && existing !== undefined) {
    return {
      ok: false,
      code: "DUPLICATE_PENDING",
      message: "A deletion is already in progress for this account.",
    };
  }

  const { data: inserted, error: insertErr } = await service
    .from("gdpr_requests")
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      kind: "deletion",
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr !== null || inserted === null) {
    return {
      ok: false,
      code: "UNKNOWN",
      message: insertErr?.message ?? "Could not create request.",
    };
  }

  try {
    await enqueueGdprDeletionSoft({ tenantId, requestId: inserted.id });
  } catch (err) {
    await service
      .from("gdpr_requests")
      .update({
        status: "failed",
        failure_reason:
          err instanceof Error ? err.message : "queue enqueue failed",
      })
      .eq("id", inserted.id);
    return {
      ok: false,
      code: "QUEUE_FAILED",
      message: err instanceof Error ? err.message : "Could not queue the job.",
    };
  }

  // Consume step-up token (one-shot).
  cookieStore.delete(STEP_UP_COOKIE);

  return { ok: true, requestId: inserted.id };
}

// ---------------------------------------------------------------------------
// getRequestStatusAction — UI polling
// ---------------------------------------------------------------------------

export type GetStatusResult =
  | { ok: true; request: GdprRequestPublic }
  | { ok: false; code: ActionError; message: string };

const statusSchema = z.object({ id: z.string().uuid() });

export async function getRequestStatusAction(
  rawId: string,
): Promise<GetStatusResult> {
  const parsed = statusSchema.safeParse({ id: rawId });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Invalid request id",
    };
  }

  let userId: string;
  try {
    const supabase = await createClient();
    const user = await requireAuth(supabase);
    userId = user.id;
  } catch (err) {
    return {
      ok: false,
      code: "AUTH_REQUIRED",
      message: err instanceof Error ? err.message : "Authentication required",
    };
  }

  // Read via service-role and re-check ownership in the WHERE clause —
  // belt + suspenders for RLS.
  const service = getSupabaseServiceClient();
  const { data, error } = await service
    .from("gdpr_requests")
    .select(
      "id, kind, status, requested_at, completed_at, expires_at, download_url, failure_reason",
    )
    .eq("id", parsed.data.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error !== null) {
    return { ok: false, code: "UNKNOWN", message: error.message };
  }
  if (data === null) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Request not found.",
    };
  }
  return { ok: true, request: data as GdprRequestPublic };
}

// ---------------------------------------------------------------------------
// listMyRequests — RSC helper (NOT an action, but co-located for cohesion)
// ---------------------------------------------------------------------------

/**
 * Read the current user's GDPR request history. Used by the Settings → Data
 * page to render the "past requests" table. Service-role + WHERE re-check
 * for the ownership guarantee.
 */
export async function listMyGdprRequests(): Promise<GdprRequestPublic[]> {
  let userId: string;
  try {
    const supabase = await createClient();
    const user = await requireAuth(supabase);
    userId = user.id;
  } catch {
    return [];
  }

  const service = getSupabaseServiceClient();
  const { data } = await service
    .from("gdpr_requests")
    .select(
      "id, kind, status, requested_at, completed_at, expires_at, download_url, failure_reason",
    )
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(20);
  return (data ?? []) as unknown as GdprRequestPublic[];
}
