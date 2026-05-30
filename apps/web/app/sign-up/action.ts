"use server";

/**
 * apps/web/app/sign-up/action.ts
 *
 * Sign-up Server Action.
 *
 * Flow:
 *   1. zod-validate (email + password ≥12 chars + zxcvbn score ≥3).
 *   2. rate-limit `signup` bucket by IP.
 *   3. supabase.auth.signUp() with emailRedirectTo → /auth/callback.
 *   4. AFTER auth user exists, service-role: create tenants row + tenant_members.
 *   5. audit-log the event.
 *   6. redirect → /sign-in?check_email=1.
 *
 * Email verification is mandatory (PRD §7.1) — we do NOT auto-sign-in here.
 *
 * Owner: [Forge + Shield + Atlas]
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import * as zxcvbnEnglish from "@zxcvbn-ts/language-en";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { logAuditEvent } from "@autonomux/db/audit";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

zxcvbnOptions.setOptions({
  translations: zxcvbnEnglish.translations,
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommon.dictionary,
    ...zxcvbnEnglish.dictionary,
  },
});

const SignUpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters."),
  // Honeypot. Real users leave it empty.
  hp: z.string().max(0).optional(),
});

export type SignUpError =
  | "INVALID_INPUT"
  | "WEAK_PASSWORD"
  | "EMAIL_TAKEN"
  | "RATE_LIMITED"
  | "PROVISIONING_FAILED"
  | "UNKNOWN";

export interface SignUpResult {
  ok: false;
  error: SignUpError;
  message: string;
  /** Set when error=RATE_LIMITED. */
  retryAfterSeconds?: number;
  /** Set when error=WEAK_PASSWORD. */
  passwordWarning?: string;
}

/**
 * Server Action invoked from the sign-up form. Throws via Next.js redirect()
 * on success (idiomatic — redirect() is a control-flow throw).
 */
export async function signUpAction(
  _prev: SignUpResult | null,
  formData: FormData,
): Promise<SignUpResult> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const rawHoneypot = formData.get("hp");

  const parsed = SignUpSchema.safeParse({
    email: typeof rawEmail === "string" ? rawEmail : "",
    password: typeof rawPassword === "string" ? rawPassword : "",
    hp: typeof rawHoneypot === "string" ? rawHoneypot : "",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: issue?.message ?? "Invalid input.",
    };
  }
  const { email, password } = parsed.data;

  // Strength gate: zxcvbn score must be ≥3 (good).
  const strength = zxcvbn(password, [email, email.split("@")[0] ?? ""]);
  if (strength.score < 3) {
    return {
      ok: false,
      error: "WEAK_PASSWORD",
      message: "Password is too predictable — try a longer passphrase.",
      passwordWarning:
        strength.feedback.warning !== null && strength.feedback.warning.length > 0
          ? strength.feedback.warning
          : strength.feedback.suggestions[0] ?? "",
    };
  }

  // Rate-limit by IP — 3 signups per hour.
  const requestHeaders = await headers();
  const ip = extractClientIp(requestHeaders);
  const rl = await checkRateLimit("signup", ip);
  if (!rl.success) {
    return {
      ok: false,
      error: "RATE_LIMITED",
      message: "Too many sign-up attempts from this network. Try again later.",
      retryAfterSeconds: rl.retryAfterSeconds,
    };
  }

  /* Resolve + normalize the callback URL.
   *
   * NEXT_PUBLIC_SITE_URL on Vercel sometimes ships with a trailing slash
   * (e.g. `https://autonomux-zmfs.vercel.app/`), which would yield
   * `https://autonomux-zmfs.vercel.app//auth/callback` (double slash) —
   * Supabase rejects that with "Invalid path specified in request URL".
   *
   * If the env var is missing entirely we fall back to the inferred
   * origin from request headers — better than failing the signup. */
  const siteUrlRaw =
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    requestHeaders.get("origin") ??
    `https://${requestHeaders.get("host") ?? ""}`;
  const siteUrl = siteUrlRaw.replace(/\/+$/, "");
  const emailRedirectTo = `${siteUrl}/auth/callback`;

  if (siteUrl.length === 0) {
    return {
      ok: false,
      error: "PROVISIONING_FAILED",
      message: "Server misconfigured (site URL missing). Contact support.",
    };
  }

  const supabase = await createClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });

  if (signUpError !== null) {
    /* Surface the full Supabase error to runtime logs so operators can
     * see exactly which validation failed (Supabase error messages are
     * generic at the UI layer). Vercel runtime logs are operator-only. */
    console.error("[sign-up] supabase.auth.signUp rejected", {
      message: signUpError.message,
      status: signUpError.status,
      emailRedirectTo,
      siteUrlRaw,
    });
    // Supabase returns "User already registered" as a status 400.
    const lower = signUpError.message.toLowerCase();
    if (lower.includes("already") || lower.includes("registered")) {
      return {
        ok: false,
        error: "EMAIL_TAKEN",
        message: "An account already exists for that email.",
      };
    }
    return {
      ok: false,
      error: "UNKNOWN",
      message: signUpError.message,
    };
  }

  const userId = signUpData.user?.id;
  if (userId === undefined) {
    return {
      ok: false,
      error: "UNKNOWN",
      message: "Sign-up returned no user — please retry.",
    };
  }

  // Provision tenant + membership via service-role. This is the one place
  // a non-tenant-scoped write is correct — the user has no tenant_id claim
  // until this insert lands.
  const service = getSupabaseServiceClient();

  const { data: tenantRow, error: tenantError } = await service
    .from("tenants")
    .insert({
      // master_key_ref will be set by KMS provisioning in Phase 1.0-C; for
      // now we pin a deterministic placeholder so the FK + RLS pass.
      master_key_ref: `pending:${userId}`,
    })
    .select("id")
    .single();

  if (tenantError !== null || tenantRow === null) {
    return {
      ok: false,
      error: "PROVISIONING_FAILED",
      message:
        "Account created but tenant provisioning failed. Sign in to retry.",
    };
  }

  const { error: memberError } = await service
    .from("tenant_members")
    .insert({
      tenant_id: tenantRow.id,
      user_id: userId,
      role: "owner",
    });

  if (memberError !== null) {
    return {
      ok: false,
      error: "PROVISIONING_FAILED",
      message:
        "Account created but tenant membership failed. Sign in to retry.",
    };
  }

  // Audit log — required by SOC 2 CC6.1.
  try {
    await logAuditEvent(
      {
        tenantId: tenantRow.id,
        actorUserId: userId,
        actorKind: "user",
        action: "user.signup",
        resourceType: "user",
        resourceId: userId,
        metadata: { email_hash_prefix: email.slice(0, 2) },
      },
      service,
    );
  } catch {
    // Audit failure is logged elsewhere; signup itself succeeded. Do not
    // expose the failure to the user — they'd be unable to act on it.
  }

  // Email verification gate — redirect to sign-in with check_email banner.
  redirect("/sign-in?check_email=1");
}
