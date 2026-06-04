"use server";

/**
 * apps/web/app/reset-password/action.ts
 *
 * Updates the signed-in user's password. The user is auth'd via the recovery
 * session created when they clicked the email link → /auth/callback → here.
 * If the session is missing (link expired, token bad), we surface that
 * and route them back to /forgot-password.
 */

import { z } from "zod";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import * as zxcvbnEnglish from "@zxcvbn-ts/language-en";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

zxcvbnOptions.setOptions({
  translations: zxcvbnEnglish.translations,
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommon.dictionary,
    ...zxcvbnEnglish.dictionary,
  },
});

const ResetSchema = z
  .object({
    newpw: z.string().min(12, "Password must be at least 12 characters."),
    confirmpw: z.string().min(1, "Confirm your password."),
  })
  .refine((v) => v.newpw === v.confirmpw, {
    message: "Passwords don't match.",
    path: ["confirmpw"],
  });

export interface ResetPasswordResult {
  ok: false;
  message: string;
}

export async function resetPasswordAction(
  _prev: ResetPasswordResult | null,
  formData: FormData,
): Promise<ResetPasswordResult> {
  const parsed = ResetSchema.safeParse({
    newpw: formData.get("newpw")?.toString() ?? "",
    confirmpw: formData.get("confirmpw")?.toString() ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid password.",
    };
  }

  // Strength gate — same threshold as sign-up.
  const strength = zxcvbn(parsed.data.newpw);
  if (strength.score < 3) {
    return {
      ok: false,
      message:
        strength.feedback.warning !== null &&
        strength.feedback.warning.length > 0
          ? strength.feedback.warning
          : "Password too predictable — try a longer passphrase.",
    };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user === null) {
    return {
      ok: false,
      message:
        "Reset link expired or already used. Request a new one from /forgot-password.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newpw,
  });

  if (error !== null) {
    return { ok: false, message: error.message };
  }

  // Sign them out so they re-authenticate with the new password — clean
  // session boundary, and the TOTP gate gets to run again.
  await supabase.auth.signOut();
  redirect("/sign-in?reset=1");
}
