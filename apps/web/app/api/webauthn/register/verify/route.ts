/**
 * apps/web/app/api/webauthn/register/verify/route.ts
 *
 * POST: verify the registration response from the browser, persist the
 * credential as a new `user_2fa_factors` row of kind 'webauthn', clear the
 * challenge cookie.
 *
 * Owner: [Cipher + Shield]
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyRegistration } from "@autonomux/auth";
import { logAuditEvent } from "@autonomux/db";

import {
  requireAuth,
  requireTenantId,
} from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getWebAuthnConfig } from "@/lib/twofa/config";
import {
  WEBAUTHN_REG_COOKIE_NAME,
  decodeWebAuthnChallengeCookie,
} from "@/lib/twofa/cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  response: z.unknown(),
  nickname: z.string().min(1).max(64).nullable().optional(),
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

  // Pull challenge from cookie and consume immediately.
  const cookieStore = await cookies();
  const raw = cookieStore.get(WEBAUTHN_REG_COOKIE_NAME)?.value;
  const challengePayload = decodeWebAuthnChallengeCookie(raw);
  cookieStore.delete(WEBAUTHN_REG_COOKIE_NAME); // single-use

  if (challengePayload === null || challengePayload.userId !== user.id) {
    return NextResponse.json(
      { ok: false, message: "Challenge expired or invalid." },
      { status: 400 },
    );
  }

  const cfg = getWebAuthnConfig();

  let verified;
  try {
    verified = await verifyRegistration({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: payload.response as any,
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "verification failed",
      },
      { status: 400 },
    );
  }

  const service = getSupabaseServiceClient();
  const { data: inserted, error } = await service
    .from("user_2fa_factors")
    .insert({
      user_id: user.id,
      tenant_id: tenantId,
      kind: "webauthn",
      credential_id: verified.credentialId,
      credential_public_key: verified.credentialPublicKey,
      credential_counter: verified.counter,
      credential_transports: verified.transports,
      credential_device_type: verified.deviceType,
      credential_backed_up: verified.backedUp,
      credential_nickname: payload.nickname ?? null,
    })
    .select("id")
    .single();

  if (error !== null || inserted === null) {
    return NextResponse.json(
      { ok: false, message: error?.message ?? "persist failed" },
      { status: 500 },
    );
  }

  try {
    await logAuditEvent({
      tenantId,
      actorUserId: user.id,
      actorKind: "user",
      action: "2fa.enroll.webauthn",
      resourceType: "user_2fa_factor",
      resourceId: inserted.id,
      metadata: {
        device_type: verified.deviceType,
        backed_up: verified.backedUp,
        nickname: payload.nickname ?? null,
      },
    });
  } catch {
    // non-blocking
  }

  return NextResponse.json({ ok: true, factorId: inserted.id });
}
