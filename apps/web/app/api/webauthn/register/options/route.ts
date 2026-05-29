/**
 * apps/web/app/api/webauthn/register/options/route.ts
 *
 * POST: generate WebAuthn registration options. Stores the challenge in an
 * encrypted, single-use, 5-minute cookie. Returns the options JSON for the
 * browser to feed into navigator.credentials.create().
 *
 * Owner: [Cipher + Shield]
 */

import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { generateRegistrationOptions } from "@autonomux/auth";

import { requireAuth } from "@/lib/auth-helpers";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getWebAuthnConfig } from "@/lib/twofa/config";
import {
  WEBAUTHN_CHALLENGE_COOKIE_MAX_AGE,
  WEBAUTHN_REG_COOKIE_NAME,
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

  // Jury F-TRC-02 fix 2026-05-29: rate-limit challenge minting so an
  // authed caller can't burn unlimited registration challenges. 100/min
  // via the `api` bucket is generous for legitimate enrollment.
  const ip = extractClientIp(request.headers);
  const rl = await checkRateLimit(
    "api",
    `webauthn:reg:options:${user.id}:${ip}`,
  );
  if (!rl.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Too many enrollment attempts. Try again shortly.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  const cfg = getWebAuthnConfig();
  const service = getSupabaseServiceClient();

  // Pull existing credentials so the authenticator refuses duplicate enrollment.
  const { data: existing } = await service
    .from("user_2fa_factors")
    .select("credential_id, credential_transports")
    .eq("user_id", user.id)
    .eq("kind", "webauthn")
    .is("revoked_at", null);

  const excludeCredentials = (existing ?? [])
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
    }));

  const options = await generateRegistrationOptions({
    user: {
      id: user.id,
      name: user.email ?? user.id,
      displayName: user.email ?? "Autonomux user",
    },
    rpName: cfg.rpName,
    rpID: cfg.rpID,
    excludeCredentials,
  });

  // Park the challenge in an encrypted, single-use cookie.
  const cookieStore = await cookies();
  cookieStore.set(
    WEBAUTHN_REG_COOKIE_NAME,
    encodeWebAuthnChallengeCookie({
      userId: user.id,
      challenge: options.challenge,
    }),
    twoFaCookieAttrs(WEBAUTHN_CHALLENGE_COOKIE_MAX_AGE),
  );

  return NextResponse.json(options);
}
