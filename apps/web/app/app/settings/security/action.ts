/**
 * apps/web/app/app/settings/security/action.ts
 *
 * Server Action: `revokeFactor(formData)`.
 *
 *   - Requires fresh step-up (TOTP within last 5 min).
 *   - Refuses to revoke the LAST factor (an account must always have ≥1 2FA).
 *   - Soft-revoke: sets `revoked_at`. Audit trigger logs the change.
 *
 * Owner: [Cipher + Shield]
 */

"use server";

import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifyStepUpToken } from "@autonomux/auth";

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getStepUpSecret } from "@/lib/twofa/config";
import { STEP_UP_COOKIE } from "@/app/sign-in/totp/action";

const schema = z.object({
  factor_id: z.string().uuid(),
});

export type RevokeFactorResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "VALIDATION"
        | "STEP_UP_REQUIRED"
        | "LAST_FACTOR"
        | "NOT_FOUND"
        | "UNKNOWN";
      message: string;
    };

/** Form-friendly void wrapper for `<form action>`. */
export async function submitRevokeFactor(formData: FormData): Promise<void> {
  const result = await revokeFactor(formData);
  if (result.ok) {
    redirect("/app/settings/security?revoked=1");
  }
  redirect(
    `/app/settings/security?err=${encodeURIComponent(result.code)}&msg=${encodeURIComponent(result.message)}`,
  );
}

export async function revokeFactor(
  formData: FormData,
): Promise<RevokeFactorResult> {
  const parsed = schema.safeParse({ factor_id: formData.get("factor_id") });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? "Invalid factor id",
    };
  }

  const supabase = await createClient();
  const user = await requireAuth(supabase);
  const service = getSupabaseServiceClient();

  // Step-up: require fresh TOTP token in cookie.
  const cookieStore = await cookies();
  const stepUp = verifyStepUpToken(cookieStore.get(STEP_UP_COOKIE)?.value, {
    userId: user.id,
    purpose: "step_up_2fa_revoke",
    secret: getStepUpSecret(),
  });
  if (stepUp === null) {
    // Force a fresh TOTP challenge.
    redirect("/sign-in/totp?next=/app/settings/security");
  }

  // Count active factors to refuse the last one.
  const { data: active, error: countErr } = await service
    .from("user_2fa_factors")
    .select("id, kind")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (countErr !== null) {
    return { ok: false, code: "UNKNOWN", message: countErr.message };
  }
  const activeRows = active ?? [];
  if (!activeRows.some((r) => r.id === parsed.data.factor_id)) {
    return { ok: false, code: "NOT_FOUND", message: "Factor not found." };
  }
  if (activeRows.length <= 1) {
    return {
      ok: false,
      code: "LAST_FACTOR",
      message:
        "Cannot revoke your only 2FA factor. Enroll another first.",
    };
  }

  const { error } = await service
    .from("user_2fa_factors")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.factor_id)
    .eq("user_id", user.id);
  if (error !== null) {
    return { ok: false, code: "UNKNOWN", message: error.message };
  }

  // Consume the step-up token (revoke is one-shot).
  cookieStore.delete(STEP_UP_COOKIE);

  return { ok: true };
}
