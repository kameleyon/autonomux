/**
 * apps/web/app/app/onboarding/totp/action.ts
 *
 * Server Action: `verifyAndEnrollTotp(formData)`.
 *
 *   1. zod-validate 6-digit code.
 *   2. Pull encrypted secret from the signed enrollment cookie (set during
 *      the GET render of the page).
 *   3. Decrypt the envelope via @autonomux/cipher.
 *   4. Verify the user's code with otplib (constant-time HMAC inside otplib).
 *   5. On success:
 *        - generate 10 backup codes (display-time plaintext is returned to
 *          the next page via a separate signed cookie),
 *        - hash them (SHA-256),
 *        - INSERT user_2fa_factors row (service-role: the audit trigger
 *          attached to the table fires after-insert),
 *        - log audit (extra app-level row in case trigger ever drops).
 *   6. Redirect to /app/onboarding/backup-codes.
 *
 *   Returns a typed Result on failure so the page can render the error
 *   inline. Success branch never returns — it redirects.
 *
 *   Rate-limit: 5 verify attempts / minute / user (PRD §7.1). Records every
 *   attempt regardless of success.
 *
 * Owner: [Cipher + Shield]
 */

"use server";

import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { decryptToString } from "@autonomux/cipher";
import type { Json } from "@autonomux/db";
import {
  checkRateLimit,
  generateBackupCodes,
  hashBackupCodes,
  recordAttempt,
  verifyTotp,
} from "@autonomux/auth";
import { logAuditEvent } from "@autonomux/db";

import {
  requireAuth,
  requireTenantId,
} from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  BACKUP_DISPLAY_COOKIE_MAX_AGE,
  BACKUP_DISPLAY_COOKIE_NAME,
  TOTP_ENROLL_COOKIE_NAME,
  decodeTotpEnrollCookie,
  encodeBackupDisplayCookie,
  twoFaCookieAttrs,
} from "@/lib/twofa/cookie";

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Code must be exactly 6 digits"),
});

export type VerifyAndEnrollTotpResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "VALIDATION"
        | "NO_PENDING"
        | "USER_MISMATCH"
        | "BAD_CODE"
        | "RATE_LIMITED"
        | "ALREADY_ENROLLED"
        | "UNKNOWN";
      message: string;
      retryAfterSeconds?: number;
    };

/**
 * Form-friendly wrapper used by `<form action={...}>`. React 19 requires
 * Server Action form-handlers to return void; we surface errors by redirecting
 * back with a `?err=` query string.
 */
export async function submitTotpVerify(formData: FormData): Promise<void> {
  const result = await verifyAndEnrollTotp(formData);
  if (result.ok) return; // unreachable — success path redirects.
  redirect(
    `/app/onboarding/totp?err=${encodeURIComponent(result.code)}&msg=${encodeURIComponent(result.message)}`,
  );
}

export async function verifyAndEnrollTotp(
  formData: FormData,
): Promise<VerifyAndEnrollTotpResult> {
  // 1. Validate.
  const parsed = codeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? "Invalid code",
    };
  }
  const { code } = parsed.data;

  // 2. Resolve user + tenant.
  const supabase = await createClient();
  const user = await requireAuth(supabase);
  const tenantId = await requireTenantId(supabase);
  const service = getSupabaseServiceClient();

  // 3. Idempotency: already enrolled? Treat as success → redirect.
  const { data: existing } = await service
    .from("user_2fa_factors")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "totp")
    .is("revoked_at", null)
    .maybeSingle();
  if (existing !== null && existing !== undefined) {
    return {
      ok: false,
      code: "ALREADY_ENROLLED",
      message: "TOTP already enrolled. Go to settings to manage.",
    };
  }

  // 4. Rate-limit BEFORE we decrypt — never burn KMS round-trips on
  //    throttled callers.
  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = reqHeaders.get("user-agent") ?? null;
  const rlCtx = {
    sb: service,
    userId: user.id,
    kind: "totp" as const,
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

  // 5. Pull pending envelope from cookie.
  const cookieStore = await cookies();
  const raw = cookieStore.get(TOTP_ENROLL_COOKIE_NAME)?.value;
  const pending = decodeTotpEnrollCookie(raw);
  if (pending === null) {
    return {
      ok: false,
      code: "NO_PENDING",
      message:
        "Enrollment session expired. Refresh the page to start over.",
    };
  }
  if (pending.userId !== user.id) {
    // Stale cookie from another session — refuse and clear it.
    cookieStore.delete(TOTP_ENROLL_COOKIE_NAME);
    return {
      ok: false,
      code: "USER_MISMATCH",
      message: "Enrollment session does not belong to this account.",
    };
  }

  // 6. Decrypt + verify.
  let secret: string;
  try {
    secret = await decryptToString(pending.envelope, tenantId, "totp_secret");
  } catch {
    cookieStore.delete(TOTP_ENROLL_COOKIE_NAME);
    return {
      ok: false,
      code: "UNKNOWN",
      message: "Could not validate the pending enrollment. Try again.",
    };
  }

  const valid = verifyTotp(secret, code);
  await recordAttempt(rlCtx, valid);

  if (!valid) {
    return { ok: false, code: "BAD_CODE", message: "Code did not match." };
  }

  // 7. Generate + hash backup codes.
  const backupCodes = generateBackupCodes(10);
  const backupHashes = hashBackupCodes(backupCodes);

  // 8. Persist factor via service role (the table's INSERT is service-only
  //    and the audit trigger writes the audit_log row).
  const { data: inserted, error: insertErr } = await service
    .from("user_2fa_factors")
    .insert({
      user_id: user.id,
      tenant_id: tenantId,
      kind: "totp",
      secret_encrypted: pending.envelope as unknown as Json,
      backup_codes_encrypted: backupHashes as unknown as Json,
    })
    .select("id")
    .single();

  if (insertErr !== null || inserted === null) {
    return {
      ok: false,
      code: "UNKNOWN",
      message: insertErr?.message ?? "Could not persist the factor.",
    };
  }

  // 9. Belt + suspenders: app-level audit row (trigger writes another).
  try {
    await logAuditEvent({
      tenantId,
      actorUserId: user.id,
      actorKind: "user",
      action: "2fa.enroll.totp",
      resourceType: "user_2fa_factor",
      resourceId: inserted.id,
      metadata: { kind: "totp", method: "self_serve_onboarding" },
    });
  } catch {
    // Trigger row covers compliance; we don't block enrollment on the
    // app-level mirror.
  }

  // 10. Clear the enrollment cookie + drop plaintext codes in a one-shot
  //     signed cookie for the next page to display.
  cookieStore.delete(TOTP_ENROLL_COOKIE_NAME);

  cookieStore.set(
    BACKUP_DISPLAY_COOKIE_NAME,
    encodeBackupDisplayCookie({
      userId: user.id,
      factorId: inserted.id,
      codes: backupCodes,
      issuedAt: Date.now(),
    }),
    twoFaCookieAttrs(BACKUP_DISPLAY_COOKIE_MAX_AGE),
  );

  redirect("/app/onboarding/backup-codes");
}
