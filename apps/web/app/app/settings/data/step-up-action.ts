/**
 * apps/web/app/app/settings/data/step-up-action.ts
 *
 * Issue a `step_up_account_delete` token after the user re-enters their TOTP
 * code on the Settings → Data page. Separate from the sign-in TOTP flow so
 * that:
 *   - the step-up cookie is scoped to a fresh, intentional re-verification
 *   - the verb in the audit log is specific ("2fa.verify.step_up.account_delete")
 *   - the redirect target is always /app/settings/data
 *
 * Owner: [Shield + Comply]
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
  recordAttempt,
  verifyTotp,
} from "@autonomux/auth";
import { logAuditEvent } from "@autonomux/db";

import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getStepUpSecret } from "@/lib/twofa/config";
import { twoFaCookieAttrs } from "@/lib/twofa/cookie";
import { STEP_UP_COOKIE } from "@/lib/twofa/cookie";

const schema = z.object({
  code: z.string().trim().min(6).max(10),
});

export type StepUpForDeletionResult =
  | { ok: true }
  | {
      ok: false;
      code: "VALIDATION" | "NO_FACTOR" | "BAD_CODE" | "RATE_LIMITED" | "UNKNOWN";
      message: string;
    };

/** Form-friendly wrapper. */
export async function submitStepUpForDeletion(
  formData: FormData,
): Promise<void> {
  const result = await stepUpForDeletion(formData);
  if (result.ok) {
    redirect("/app/settings/data?step_up=ok");
  }
  redirect(
    `/app/settings/data?err=${encodeURIComponent(result.code)}&msg=${encodeURIComponent(result.message)}`,
  );
}

export async function stepUpForDeletion(
  formData: FormData,
): Promise<StepUpForDeletionResult> {
  const parsed = schema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? "Invalid code",
    };
  }

  const supabase = await createClient();
  const user = await requireAuth(supabase);
  const tenantId = await requireTenantId(supabase);
  const service = getSupabaseServiceClient();

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
    };
  }

  const { data: factor, error } = await service
    .from("user_2fa_factors")
    .select("id, secret_encrypted")
    .eq("user_id", user.id)
    .eq("kind", "totp")
    .is("revoked_at", null)
    .maybeSingle();
  if (error !== null || factor === null || factor.secret_encrypted === null) {
    return {
      ok: false,
      code: "NO_FACTOR",
      message: "Authenticator not enrolled.",
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
      message: "Could not validate factor.",
    };
  }

  const success = verifyTotp(secret, parsed.data.code);
  await recordAttempt(rlCtx, success);
  if (!success) {
    return { ok: false, code: "BAD_CODE", message: "Code did not match." };
  }

  // Issue purpose=step_up_account_delete token (5-min TTL).
  const cookieStore = await cookies();
  const token = issueStepUpToken(
    {
      userId: user.id,
      issuedAt: Date.now(),
      purpose: "step_up_account_delete",
    },
    getStepUpSecret(),
  );
  cookieStore.set(STEP_UP_COOKIE, token, twoFaCookieAttrs(5 * 60));

  try {
    await logAuditEvent({
      tenantId,
      actorUserId: user.id,
      actorKind: "user",
      action: "2fa.verify.step_up.account_delete",
      resourceType: "user_2fa_factor",
      resourceId: factor.id,
      metadata: { ip, userAgent },
    });
  } catch {
    // non-blocking
  }

  return { ok: true };
}
