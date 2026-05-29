/**
 * apps/web/app/sign-in/totp/action.ts
 *
 * Server Action: verify a TOTP code OR a backup code during sign-in.
 *
 *   - Rate-limited (5/min/user).
 *   - On TOTP success: bumps `last_used_at`, marks session 2FA-passed.
 *   - On backup-code success: strikes the consumed hash from
 *     `backup_codes_encrypted`, bumps `last_used_at`, marks session
 *     2FA-passed. We do NOT regenerate — that is a manual support flow for
 *     Phase 1.0-B; PRD will get a "Regenerate codes" button in 1.0-C.
 *   - Sets a step-up token so the next 5 minutes count as fresh-TOTP.
 *
 * Owner: [Cipher + Shield]
 */

"use server";

import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { decryptToString } from "@autonomux/cipher";
import type { EncryptedEnvelope } from "@autonomux/cipher";
import {
  checkRateLimit,
  issueStepUpToken,
  issueTwoFaSessionToken,
  recordAttempt,
  TWO_FA_SESSION_COOKIE_NAME,
  TWO_FA_SESSION_TTL_MS,
  verifyBackupCode,
  verifyTotp,
} from "@autonomux/auth";
import { logAuditEvent } from "@autonomux/db";

import {
  requireAuth,
  requireTenantId,
} from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getStepUpSecret } from "@/lib/twofa/config";
import { twoFaCookieAttrs } from "@/lib/twofa/cookie";

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(6)
    .max(10),
});

// Cookie carrying the step-up token (verifies that the user has TOTP-ed
// within the last 5 minutes — required for sensitive ops like 2FA revoke).
export const STEP_UP_COOKIE = "autonomux_step_up";

export type VerifySignInTotpResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "VALIDATION"
        | "NO_FACTOR"
        | "BAD_CODE"
        | "RATE_LIMITED"
        | "UNKNOWN";
      message: string;
      retryAfterSeconds?: number;
    };

function looksLikeBackupCode(s: string): boolean {
  // 8 alphanumeric (with optional dash). Our codes never contain digits 0/1.
  return /^[A-Z2-9]{4}-?[A-Z2-9]{4}$/i.test(s);
}

/** Form-friendly void wrapper for `<form action>`. */
export async function submitSignInTotp(formData: FormData): Promise<void> {
  const result = await verifySignInTotp(formData);
  if (result.ok) return; // unreachable — success branch redirects to /app.
  redirect(
    `/sign-in/totp?err=${encodeURIComponent(result.code)}&msg=${encodeURIComponent(result.message)}`,
  );
}

export async function verifySignInTotp(
  formData: FormData,
): Promise<VerifySignInTotpResult> {
  const parsed = schema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? "Invalid code",
    };
  }
  const raw = parsed.data.code;

  const supabase = await createClient();
  const user = await requireAuth(supabase);
  const tenantId = await requireTenantId(supabase);
  const service = getSupabaseServiceClient();

  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = reqHeaders.get("user-agent") ?? null;

  // Rate-limit (counts ALL attempts — TOTP and backup_code share the budget).
  const isBackup = looksLikeBackupCode(raw);
  const rlCtx = {
    sb: service,
    userId: user.id,
    kind: isBackup ? ("backup_code" as const) : ("totp" as const),
    ip,
    userAgent,
  };
  const rl = await checkRateLimit(rlCtx);
  if (!rl.allowed) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.`,
      retryAfterSeconds: rl.retryAfterSeconds,
    };
  }

  // Pull the user's active TOTP factor.
  const { data: factor, error: fetchErr } = await service
    .from("user_2fa_factors")
    .select("id, secret_encrypted, backup_codes_encrypted")
    .eq("user_id", user.id)
    .eq("kind", "totp")
    .is("revoked_at", null)
    .maybeSingle();

  if (fetchErr !== null || factor === null) {
    return {
      ok: false,
      code: "NO_FACTOR",
      message: "No two-factor enrollment found.",
    };
  }

  let success = false;
  let consumedHash: string | null = null;

  if (isBackup) {
    const hashes = Array.isArray(factor.backup_codes_encrypted)
      ? (factor.backup_codes_encrypted as unknown as string[])
      : [];
    consumedHash = verifyBackupCode(raw, hashes);
    success = consumedHash !== null;
  } else {
    if (factor.secret_encrypted === null) {
      await recordAttempt(rlCtx, false);
      return {
        ok: false,
        code: "UNKNOWN",
        message: "Factor missing secret. Contact support.",
      };
    }
    let secret: string;
    try {
      secret = await decryptToString(
        factor.secret_encrypted as unknown as EncryptedEnvelope,
        tenantId,
        "totp_secret",
      );
    } catch {
      await recordAttempt(rlCtx, false);
      return {
        ok: false,
        code: "UNKNOWN",
        message: "Could not validate the factor.",
      };
    }
    success = verifyTotp(secret, raw);
  }

  await recordAttempt(rlCtx, success);

  if (!success) {
    return { ok: false, code: "BAD_CODE", message: "Code did not match." };
  }

  // Persist: bump last_used_at; on backup-code use, strike the hash.
  const update: Record<string, unknown> = {
    last_used_at: new Date().toISOString(),
  };
  if (isBackup && consumedHash !== null) {
    const remaining = (
      (factor.backup_codes_encrypted as unknown as string[]) ?? []
    ).filter((h) => h !== consumedHash);
    update.backup_codes_encrypted = remaining;
  }
  const { error: updErr } = await service
    .from("user_2fa_factors")
    .update(update)
    .eq("id", factor.id);
  if (updErr !== null) {
    return { ok: false, code: "UNKNOWN", message: updErr.message };
  }

  // Audit the verify (the trigger does NOT fire on this update path).
  try {
    await logAuditEvent({
      tenantId,
      actorUserId: user.id,
      actorKind: "user",
      action: isBackup ? "2fa.verify.backup_code" : "2fa.verify.totp",
      resourceType: "user_2fa_factor",
      resourceId: factor.id,
      metadata: { ip, userAgent },
    });
  } catch {
    // non-blocking
  }

  // Issue a step-up token (5-min fresh-TOTP window for sensitive ops).
  const cookieStore = await cookies();
  const token = issueStepUpToken(
    {
      userId: user.id,
      issuedAt: Date.now(),
      purpose: "step_up_2fa_revoke",
    },
    getStepUpSecret(),
  );
  cookieStore.set(STEP_UP_COOKIE, token, twoFaCookieAttrs(5 * 60));

  /**
   * Jury F-TRC-03 fix 2026-05-29: also issue the 12-hour 2FA-session
   * token that middleware checks on every `/app/*` request. Without
   * this cookie, a user who has TOTP enrolled cannot reach any
   * protected route — the password handshake alone is not enough.
   */
  const twoFaToken = issueTwoFaSessionToken(user.id, getStepUpSecret());
  cookieStore.set(
    TWO_FA_SESSION_COOKIE_NAME,
    twoFaToken,
    twoFaCookieAttrs(Math.floor(TWO_FA_SESSION_TTL_MS / 1000)),
  );

  redirect("/app");
}
