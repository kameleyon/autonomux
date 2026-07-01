/**
 * apps/web/app/auth/callback/route.ts
 *
 * Handles the redirect from the email verification link.
 *
 * Supabase email confirm links arrive as either:
 *   - ?code=<pkce code>            → exchangeCodeForSession
 *   - ?token_hash=<hash>&type=...  → verifyOtp (legacy magic link path)
 *
 * On success, route to /app/onboarding/totp — B2 will render the TOTP
 * enrollment surface there. Until B2 lands, the middleware will allow
 * the user through to /app once email is verified.
 *
 * Owner: [Forge + Shield]
 */

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the post-auth destination. Callers (e.g. the password-recovery
 * email) pass ?next=/some/path so the exchange lands them on the right page
 * with a live session. We only accept same-origin relative paths — a single
 * leading slash, never `//` or a scheme — to prevent open-redirect abuse.
 * Falls back to the TOTP onboarding surface (the signup-confirm destination).
 */
function resolveTarget(next: string | null, origin: string): URL {
  // Single leading slash, and the next char must not be `/` or `\` — both
  // would let `//host` / `/\host` normalize into a cross-origin redirect.
  if (next !== null && /^\/(?![/\\])/.test(next)) {
    return new URL(next, origin);
  }
  return new URL("/app/onboarding/totp", origin);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const target = resolveTarget(url.searchParams.get("next"), url.origin);

  if (errorParam !== null) {
    const fail = new URL("/sign-in", url.origin);
    fail.searchParams.set(
      "auth_error",
      errorDescription !== null ? errorDescription : errorParam,
    );
    return NextResponse.redirect(fail);
  }

  const supabase = await createClient();

  if (code !== null && code.length > 0) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error !== null) {
      const fail = new URL("/sign-in", url.origin);
      fail.searchParams.set("auth_error", error.message);
      return NextResponse.redirect(fail);
    }
    return NextResponse.redirect(target);
  }

  if (
    tokenHash !== null &&
    tokenHash.length > 0 &&
    otpType !== null &&
    (otpType === "signup" ||
      otpType === "email" ||
      otpType === "email_change" ||
      otpType === "recovery" ||
      otpType === "magiclink" ||
      otpType === "invite")
  ) {
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash,
    });
    if (error !== null) {
      const fail = new URL("/sign-in", url.origin);
      fail.searchParams.set("auth_error", error.message);
      return NextResponse.redirect(fail);
    }
    return NextResponse.redirect(target);
  }

  // No usable params — drop back to sign-in.
  const fail = new URL("/sign-in", url.origin);
  fail.searchParams.set("auth_error", "Missing verification token.");
  return NextResponse.redirect(fail);
}
