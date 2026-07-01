"use server";

/**
 * apps/web/app/forgot-password/action.ts
 *
 * Initiates a password-reset email via Supabase Auth. We always return a
 * generic success message (whether the email exists or not) to avoid leaking
 * which accounts are registered — that's an account-enumeration defense.
 */

import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

const ForgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
});

export interface ForgotPasswordResult {
  ok: boolean;
  message: string;
}

export async function forgotPasswordAction(
  _prev: ForgotPasswordResult | null,
  formData: FormData,
): Promise<ForgotPasswordResult> {
  const parsed = ForgotSchema.safeParse({
    email: formData.get("email")?.toString() ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid email.",
    };
  }

  const requestHeaders = await headers();
  const ip = extractClientIp(requestHeaders);

  // Rate-limit on IP only — preventing per-account enumeration via the
  // rate-limit response would itself leak existence.
  const rl = await checkRateLimit("auth", `forgot:${ip}`);
  if (!rl.success) {
    return {
      ok: false,
      message: "Too many requests. Try again in a few minutes.",
    };
  }

  const siteUrlRaw =
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    requestHeaders.get("origin") ??
    `https://${requestHeaders.get("host") ?? ""}`;
  /* Route the recovery link through /auth/callback — that handler exchanges
   * the recovery code/token for a session (exchangeCodeForSession / verifyOtp)
   * and then forwards to `next`. Pointing straight at /reset-password skipped
   * the exchange, so getUser() there was always null → "link expired". */
  const siteUrl = siteUrlRaw.replace(/\/+$/, "");
  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent("/reset-password")}`;

  const supabase = await createClient();
  /* We intentionally do NOT inspect the response error — Supabase returns
   * success even for unknown emails, but we'd leak rate-limit details
   * otherwise. Any genuine misconfiguration is logged server-side. */
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo },
  );

  if (error !== null) {
    console.error("[forgot-password] supabase.resetPasswordForEmail error", {
      message: error.message,
    });
    // Still return generic success to avoid enumeration.
  }

  return { ok: true, message: "If an account exists, we sent a reset link." };
}
