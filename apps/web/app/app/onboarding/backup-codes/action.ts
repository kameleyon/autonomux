/**
 * apps/web/app/app/onboarding/backup-codes/action.ts
 *
 * Server Action `confirmBackupCodesSaved(formData)`:
 *   - Validates the user actually checked the box.
 *   - Stamps `user_2fa_factors.backup_codes_displayed_at`. The audit trigger
 *     on the table writes a `2fa.backup_codes_displayed` row.
 *   - Clears the display cookie (codes leave server memory).
 *   - Redirects to /app.
 *
 * Owner: [Cipher + Shield]
 */

"use server";

import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  BACKUP_DISPLAY_COOKIE_NAME,
  decodeBackupDisplayCookie,
} from "@/lib/twofa/cookie";

const schema = z.object({
  factor_id: z.string().uuid(),
  confirm: z.string().min(1, "Confirmation required"),
});

export type ConfirmBackupCodesResult =
  | { ok: true }
  | { ok: false; code: "VALIDATION" | "NO_PENDING" | "UNKNOWN"; message: string };

/** Form-friendly void wrapper for `<form action>`. */
export async function submitBackupCodesConfirm(
  formData: FormData,
): Promise<void> {
  const result = await confirmBackupCodesSaved(formData);
  if (result.ok) return;
  redirect(
    `/app/onboarding/backup-codes?err=${encodeURIComponent(result.code)}&msg=${encodeURIComponent(result.message)}`,
  );
}

export async function confirmBackupCodesSaved(
  formData: FormData,
): Promise<ConfirmBackupCodesResult> {
  const parsed = schema.safeParse({
    factor_id: formData.get("factor_id"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? "Confirmation required",
    };
  }

  const supabase = await createClient();
  const user = await requireAuth(supabase);

  const cookieStore = await cookies();
  const raw = cookieStore.get(BACKUP_DISPLAY_COOKIE_NAME)?.value;
  const payload = decodeBackupDisplayCookie(raw);
  if (payload === null || payload.userId !== user.id) {
    return {
      ok: false,
      code: "NO_PENDING",
      message: "Backup-code display session expired.",
    };
  }
  if (payload.factorId !== parsed.data.factor_id) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Factor mismatch.",
    };
  }

  const service = getSupabaseServiceClient();
  const { error } = await service
    .from("user_2fa_factors")
    .update({ backup_codes_displayed_at: new Date().toISOString() })
    .eq("id", parsed.data.factor_id)
    .eq("user_id", user.id);
  if (error !== null) {
    return { ok: false, code: "UNKNOWN", message: error.message };
  }

  // Wipe the display cookie — codes are gone from the server side.
  cookieStore.delete(BACKUP_DISPLAY_COOKIE_NAME);

  redirect("/app");
}
