/**
 * apps/web/app/sign-in/totp/page.tsx
 *
 * TOTP challenge during sign-in. Reached after the user has passed
 * email+password but before the session is upgraded to "2FA-passed".
 *
 *   - If user has no TOTP factor, bounce to enrollment.
 *   - Otherwise render an input that accepts EITHER a 6-digit TOTP token
 *     OR an 8-char (XXXX-XXXX) backup code.
 *   - Action verifies, marks session as 2FA-passed, redirects to /app.
 *
 * The "2FA-passed" signal in Phase 1.0-B is a JWT app_metadata flag set via
 * the service-role admin API after a successful verify. (A Supabase Auth
 * Hook in Phase 1.0-C will gate session minting on the presence of the
 * flag — until then, middleware enforces the redirect.)
 *
 * Owner: [Cipher + Shield]
 */

import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

import { submitSignInTotp } from "./action";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Two-factor sign in",
};

export default async function SignInTotpPage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const user = await requireAuth(supabase);

  const { data: factor } = await supabase
    .from("user_2fa_factors")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "totp")
    .is("revoked_at", null)
    .maybeSingle();

  if (factor === null || factor === undefined) {
    redirect("/app/onboarding/totp");
  }

  return (
    <main id="main" className="wrap">
      <h1>Two-factor sign in</h1>
      <p>
        Enter the 6-digit code from your authenticator app, or use one of
        your backup codes.
      </p>

      <form action={submitSignInTotp} style={{ marginTop: "var(--sp-24)" }}>
        <label htmlFor="totp-code">Code or backup code</label>
        <input
          id="totp-code"
          name="code"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          maxLength={10}
          required
          aria-required="true"
          placeholder="123456 or ABCD-1234"
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "1.25rem",
            letterSpacing: "0.2em",
            padding: "var(--sp-12)",
            width: "16ch",
            display: "block",
            marginTop: "var(--sp-8)",
          }}
        />
        <button type="submit" style={{ marginTop: "var(--sp-16)" }}>
          Verify
        </button>
      </form>

      <p style={{ marginTop: "var(--sp-32)", fontSize: "0.9em" }}>
        Lost your codes? Contact support — we will verify identity before
        resetting two-factor.
      </p>
    </main>
  );
}
