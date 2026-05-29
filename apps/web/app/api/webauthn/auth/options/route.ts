/**
 * apps/web/app/api/webauthn/auth/options/route.ts
 *
 * POST: generate WebAuthn authentication options for the signed-in user
 * during the sign-in 2FA step. Stores the challenge in an encrypted,
 * single-use, 5-minute cookie.
 *
 * Note: caller must already be authenticated (email+password done; we're
 * just upgrading to 2FA-passed). The `user.id` from the session is the
 * scope.
 *
 * Owner: [Cipher + Shield]
 */

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { generateAuthenticationOptions } from "@autonomux/auth";

import { requireAuth } from "@/lib/auth-helpers";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getWebAuthnConfig } from "@/lib/twofa/config";
import {
  WEBAUTHN_AUTH_COOKIE_NAME,
  WEBAUTHN_CHALLENGE_COOKIE_MAX_AGE,
  encodeWebAuthnChallengeCookie,
  twoFaCookieAttrs,
} from "@/lib/twofa/cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  let user;
  try {
    const supabase = await createClient();
    user = await requireAuth(supabase);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "auth required" },
      { status: 401 },
    );
  }

  // Jury F-TRC-02 fix 2026-05-29: rate-limit challenge minting.
  const ip = extractClientIp(request.headers);
  const rl = await checkRateLimit(
    "api",
    `webauthn:auth:options:${user.id}:${ip}`,
  );
  if (!rl.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Too many sign-in attempts. Try again shortly.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  const service = getSupabaseServiceClient();
  const { data: rows } = await service
    .from("user_2fa_factors")
    .select("credential_id, credential_transports")
    .eq("user_id", user.id)
    .eq("kind", "webauthn")
    .is("revoked_at", null);

  if (rows === null || rows.length === 0) {
    return NextResponse.json(
      { ok: false, message: "No passkeys enrolled." },
      { status: 400 },
    );
  }

  const cfg = getWebAuthnConfig();
  const options = await generateAuthenticationOptions({
    rpID: cfg.rpID,
    allowCredentials: rows
      .filter((r) => r.credential_id !== null)
      .map((r) => ({
        id: r.credential_id as string,
        transports: (r.credential_transports ?? []) as string[] as
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
      })),
    userVerification: "preferred",
  });

  const cookieStore = await cookies();
  cookieStore.set(
    WEBAUTHN_AUTH_COOKIE_NAME,
    encodeWebAuthnChallengeCookie({
      userId: user.id,
      challenge: options.challenge,
    }),
    twoFaCookieAttrs(WEBAUTHN_CHALLENGE_COOKIE_MAX_AGE),
  );

  return NextResponse.json(options);
}
