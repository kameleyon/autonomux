"use server";

/**
 * apps/web/app/sign-in/action.ts
 *
 * Sign-in Server Action.
 *
 * Flow:
 *   1. zod-validate input.
 *   2. rate-limit `auth` bucket by (IP + email).
 *   3. supabase.auth.signInWithPassword().
 *   4. Honest error surfacing: bad creds, unverified email.
 *   5. audit-log session.start.
 *   6. redirect → next || /app.
 *
 * TOTP is collected here for forward compatibility (B2 lands TOTP enrollment).
 * If user has no MFA factor enrolled yet, the totp field is ignored.
 *
 * Owner: [Forge + Shield]
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { logAuditEvent } from "@autonomux/db/audit";
import { tryExtractJwtClaims } from "@autonomux/db/jwt";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

const SignInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
  totp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "TOTP must be 6 digits.")
    .optional()
    .or(z.literal("")),
  next: z.string().startsWith("/").optional().or(z.literal("")),
});

export type SignInError =
  | "INVALID_INPUT"
  | "INVALID_CREDENTIALS"
  | "EMAIL_UNVERIFIED"
  | "RATE_LIMITED"
  | "TOTP_REQUIRED"
  | "TOTP_INVALID"
  | "UNKNOWN";

export interface SignInResult {
  ok: false;
  error: SignInError;
  message: string;
  retryAfterSeconds?: number;
}

export async function signInAction(
  _prev: SignInResult | null,
  formData: FormData,
): Promise<SignInResult> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email")?.toString() ?? "",
    password: formData.get("password")?.toString() ?? "",
    totp: formData.get("totp")?.toString() ?? "",
    next: formData.get("next")?.toString() ?? "",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: issue?.message ?? "Invalid input.",
    };
  }
  const { email, password, next } = parsed.data;

  // Rate-limit per (IP, email).
  const requestHeaders = await headers();
  const ip = extractClientIp(requestHeaders);
  const rl = await checkRateLimit("auth", `${ip}:${email}`);
  if (!rl.success) {
    return {
      ok: false,
      error: "RATE_LIMITED",
      message: "Too many sign-in attempts. Wait a few minutes.",
      retryAfterSeconds: rl.retryAfterSeconds,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error !== null) {
    // Supabase returns a generic "Invalid login credentials" so we don't
    // leak which field was wrong — keep that on the wire.
    const lower = error.message.toLowerCase();
    if (lower.includes("email not confirmed") || lower.includes("not verified")) {
      return {
        ok: false,
        error: "EMAIL_UNVERIFIED",
        message:
          "Please verify your email before signing in. Check your inbox.",
      };
    }
    return {
      ok: false,
      error: "INVALID_CREDENTIALS",
      message: "Incorrect email or password.",
    };
  }

  const user = data.user;
  if (user === null) {
    return {
      ok: false,
      error: "UNKNOWN",
      message: "Sign-in returned no user — please retry.",
    };
  }

  // Belt-and-braces email verification check — Supabase usually blocks
  // unverified sign-ins server-side when "Confirm email" is on; we re-check
  // because the project setting could drift.
  if (
    user.email_confirmed_at === null ||
    user.email_confirmed_at === undefined
  ) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "EMAIL_UNVERIFIED",
      message: "Please verify your email before signing in.",
    };
  }

  // Audit-log the session start. tenant_id pulled from the freshly minted JWT.
  const accessToken = data.session?.access_token;
  const claims = tryExtractJwtClaims(accessToken);
  try {
    await logAuditEvent(
      {
        tenantId: claims?.tenant_id ?? null,
        actorUserId: user.id,
        actorKind: "user",
        action: "session.start",
        resourceType: "session",
        resourceId: data.session?.access_token.slice(-8) ?? null,
        metadata: {
          ip_prefix: ip.split(".").slice(0, 2).join(".") + ".x.x",
        },
      },
      getSupabaseServiceClient(),
    );
  } catch {
    // Same posture as signup — audit failure does not block legitimate sign-in.
  }

  /**
   * Jury F-TRC-04 fix 2026-05-29: PRD §7.1 mandates TOTP at sign-in
   * once the factor is enrolled. After password sign-in succeeds we
   * check for an active TOTP factor for this user; if present, the
   * password handshake is not enough — we route to /sign-in/totp for
   * the second factor. Without TOTP factor we route directly. The
   * "2FA-passed" session flag is set on successful TOTP verify and
   * is what middleware checks for protected routes (F-TRC-03).
   */
  const serviceClient = getSupabaseServiceClient();
  const { data: factorRows } = await serviceClient
    .from("user_2fa_factors")
    .select("kind, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .eq("kind", "totp")
    .limit(1);

  const hasTotp = (factorRows ?? []).length > 0;
  const target = next !== undefined && next.length > 0 ? next : "/app";

  if (hasTotp) {
    const totpUrl = `/sign-in/totp?next=${encodeURIComponent(target)}`;
    redirect(totpUrl);
  }

  redirect(target);
}
