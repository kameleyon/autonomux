/**
 * apps/web/app/api/webauthn/auth/verify/route.ts
 *
 * POST: verify the WebAuthn assertion, bump the credential's signature
 * counter, mark the session as 2FA-passed.
 *
 *   - Looks up the credential by `id` (browser-supplied).
 *   - Rate-limited (5/min/user).
 *   - SimpleWebAuthn throws on counter regression → clone detection.
 *
 * Owner: [Cipher + Shield]
 */

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  checkRateLimit,
  recordAttempt,
  verifyAuthentication,
} from "@autonomux/auth";
import { logAuditEvent } from "@autonomux/db";

import {
  requireAuth,
  requireTenantId,
} from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getWebAuthnConfig } from "@/lib/twofa/config";
import {
  WEBAUTHN_AUTH_COOKIE_NAME,
  decodeWebAuthnChallengeCookie,
} from "@/lib/twofa/cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

export async function POST(req: Request): Promise<Response> {
  let user;
  let tenantId: string;
  try {
    const supabase = await createClient();
    user = await requireAuth(supabase);
    tenantId = await requireTenantId(supabase);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "auth required" },
      { status: 401 },
    );
  }

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "bad request" },
      { status: 400 },
    );
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = reqHeaders.get("user-agent") ?? null;
  const service = getSupabaseServiceClient();

  const rlCtx = {
    sb: service,
    userId: user.id,
    kind: "webauthn" as const,
    ip,
    userAgent,
  };
  const rl = await checkRateLimit(rlCtx);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many attempts", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
    );
  }

  const cookieStore = await cookies();
  const challengeRaw = cookieStore.get(WEBAUTHN_AUTH_COOKIE_NAME)?.value;
  const challengePayload = decodeWebAuthnChallengeCookie(challengeRaw);
  cookieStore.delete(WEBAUTHN_AUTH_COOKIE_NAME); // single-use

  if (challengePayload === null || challengePayload.userId !== user.id) {
    await recordAttempt(rlCtx, false);
    return NextResponse.json(
      { ok: false, message: "Challenge expired or invalid." },
      { status: 400 },
    );
  }

  // Locate credential.
  const credentialId = payload.response.id;
  const { data: factor, error: fetchErr } = await service
    .from("user_2fa_factors")
    .select(
      "id, credential_id, credential_public_key, credential_counter, credential_transports",
    )
    .eq("user_id", user.id)
    .eq("kind", "webauthn")
    .eq("credential_id", credentialId)
    .is("revoked_at", null)
    .maybeSingle();

  if (fetchErr !== null || factor === null) {
    await recordAttempt(rlCtx, false);
    return NextResponse.json(
      { ok: false, message: "Credential not enrolled." },
      { status: 400 },
    );
  }

  const cfg = getWebAuthnConfig();
  let result;
  try {
    result = await verifyAuthentication({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: payload.response as any,
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      credential: {
        credentialId: factor.credential_id as string,
        publicKey: factor.credential_public_key as string,
        counter: factor.credential_counter ?? 0,
        transports:
          (factor.credential_transports as string[] | null) as
            | undefined
            | (
                | "usb"
                | "nfc"
                | "ble"
                | "internal"
                | "hybrid"
                | "cable"
                | "smart-card"
              )[],
      },
    });
  } catch (e) {
    await recordAttempt(rlCtx, false);
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "verification failed",
      },
      { status: 400 },
    );
  }

  await recordAttempt(rlCtx, true);

  await service
    .from("user_2fa_factors")
    .update({
      credential_counter: result.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", factor.id);

  try {
    await logAuditEvent({
      tenantId,
      actorUserId: user.id,
      actorKind: "user",
      action: "2fa.verify.webauthn",
      resourceType: "user_2fa_factor",
      resourceId: factor.id,
      metadata: { ip, userAgent },
    });
  } catch {
    // non-blocking
  }

  return NextResponse.json({ ok: true });
}
