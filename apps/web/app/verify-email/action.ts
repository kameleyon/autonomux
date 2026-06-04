"use server";

/**
 * apps/web/app/verify-email/action.ts
 *
 * Verifies the 6-digit code from Supabase's signup email
 * (supabase.auth.verifyOtp with type='signup'). On success the user is
 * authenticated; we route to /sign-in?verified=1 so the existing TOTP
 * gate runs on their next sign-in (or directly to /app if no TOTP).
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

const VerifySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export type VerifyError =
  | "INVALID_INPUT"
  | "INVALID_CODE"
  | "RATE_LIMITED"
  | "EXPIRED"
  | "UNKNOWN";

export interface VerifyResult {
  ok: false;
  error: VerifyError;
  message: string;
  retryAfterSeconds?: number;
}

export async function verifyEmailAction(
  _prev: VerifyResult | null,
  formData: FormData,
): Promise<VerifyResult> {
  const parsed = VerifySchema.safeParse({
    email: formData.get("email")?.toString() ?? "",
    code: formData.get("code")?.toString() ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const { email, code } = parsed.data;

  const requestHeaders = await headers();
  const ip = extractClientIp(requestHeaders);
  const rl = await checkRateLimit("auth", `verify:${ip}:${email}`);
  if (!rl.success) {
    return {
      ok: false,
      error: "RATE_LIMITED",
      message: "Too many attempts. Wait a few minutes.",
      retryAfterSeconds: rl.retryAfterSeconds,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "signup",
  });

  if (error !== null) {
    const lower = error.message.toLowerCase();
    if (lower.includes("expired")) {
      return {
        ok: false,
        error: "EXPIRED",
        message: "Code expired. Tap Resend to get a new one.",
      };
    }
    if (lower.includes("invalid") || lower.includes("not valid")) {
      return {
        ok: false,
        error: "INVALID_CODE",
        message: "That code didn't match. Try again or resend.",
      };
    }
    return { ok: false, error: "UNKNOWN", message: error.message };
  }

  redirect("/sign-in?verified=1");
}

export interface ResendResult {
  ok: boolean;
  message: string;
}

const ResendSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function resendVerifyAction(
  formData: FormData,
): Promise<ResendResult> {
  const parsed = ResendSchema.safeParse({
    email: formData.get("email")?.toString() ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid email." };
  }

  const requestHeaders = await headers();
  const ip = extractClientIp(requestHeaders);
  const rl = await checkRateLimit("auth", `resend:${ip}:${parsed.data.email}`);
  if (!rl.success) {
    return { ok: false, message: "Slow down — try again in a minute." };
  }

  const siteUrlRaw =
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    requestHeaders.get("origin") ??
    `https://${requestHeaders.get("host") ?? ""}`;
  const emailRedirectTo = `${siteUrlRaw.replace(/\/+$/, "")}/auth/callback`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo },
  });

  if (error !== null) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Sent. Check your inbox." };
}
