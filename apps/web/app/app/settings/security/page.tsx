/**
 * apps/web/app/app/settings/security/page.tsx
 *
 * Settings → Security. Lists enrolled 2FA factors and lets the user:
 *   - enroll a WebAuthn passkey (calls /api/webauthn/register/options +
 *     navigator.credentials.create() in a client island);
 *   - revoke a factor (TOTP or WebAuthn) — requires a fresh TOTP step-up.
 *
 * Revoking the LAST TOTP is allowed only if no WebAuthn keys remain (we
 * never want to leave the account with zero 2FA). Front-end disables the
 * button; the action also rejects it.
 *
 * Owner: [Cipher + Shield]
 */

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

import { submitRevokeFactor } from "./action";
import { WebAuthnEnrollButton } from "./WebAuthnEnroll.client";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Security",
};

interface FactorRow {
  id: string;
  kind: "totp" | "webauthn";
  enrolled_at: string;
  last_used_at: string | null;
  credential_nickname: string | null;
  credential_device_type: "singleDevice" | "multiDevice" | null;
}

export default async function SecurityPage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const user = await requireAuth(supabase);

  const { data, error } = await supabase
    .from("user_2fa_factors")
    .select(
      "id,kind,enrolled_at,last_used_at,credential_nickname,credential_device_type",
    )
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("enrolled_at", { ascending: true });

  const factors: FactorRow[] = (data ?? []) as FactorRow[];
  const totp = factors.find((f) => f.kind === "totp") ?? null;
  const passkeys = factors.filter((f) => f.kind === "webauthn");

  return (
    <div className="wrap">
      <h1>Security</h1>

      {error !== null ? (
        <p role="alert">Could not load factors: {error.message}</p>
      ) : null}

      <section
        aria-labelledby="totp-section"
        style={{ marginTop: "var(--sp-24)" }}
      >
        <h2 id="totp-section">Authenticator app (TOTP)</h2>
        {totp === null ? (
          <p>
            Not enrolled.{" "}
            <a href="/app/onboarding/totp">Set up an authenticator app</a>.
          </p>
        ) : (
          <ul>
            <li>
              Enrolled {new Date(totp.enrolled_at).toLocaleDateString()}.
              {totp.last_used_at !== null
                ? ` Last used ${new Date(totp.last_used_at).toLocaleDateString()}.`
                : " Not yet used."}
            </li>
            <li>
              <form action={submitRevokeFactor}>
                <input type="hidden" name="factor_id" value={totp.id} />
                <button
                  type="submit"
                  disabled={passkeys.length === 0}
                  aria-disabled={passkeys.length === 0}
                  title={
                    passkeys.length === 0
                      ? "Enroll a passkey first; an account must always keep at least one 2FA factor."
                      : ""
                  }
                >
                  Revoke TOTP
                </button>
              </form>
            </li>
          </ul>
        )}
      </section>

      <section
        aria-labelledby="passkeys-section"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="passkeys-section">Passkeys (WebAuthn)</h2>
        {passkeys.length === 0 ? (
          <p>
            No passkeys enrolled. Passkeys let you sign in with Touch ID,
            Face ID, Windows Hello, or a hardware key — and are
            phishing-resistant.
          </p>
        ) : (
          <ul>
            {passkeys.map((p) => (
              <li key={p.id} style={{ marginBottom: "var(--sp-8)" }}>
                <strong>{p.credential_nickname ?? "Unnamed passkey"}</strong>{" "}
                — {p.credential_device_type === "multiDevice"
                  ? "synced"
                  : "device-bound"}
                . Enrolled{" "}
                {new Date(p.enrolled_at).toLocaleDateString()}.
                <form action={submitRevokeFactor} style={{ display: "inline" }}>
                  <input type="hidden" name="factor_id" value={p.id} />
                  <button type="submit" style={{ marginLeft: "var(--sp-8)" }}>
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <WebAuthnEnrollButton />
      </section>

      <p style={{ marginTop: "var(--sp-32)", fontSize: "0.9em" }}>
        Revoking TOTP requires a fresh authenticator code entered within
        the last 5 minutes (step-up). If your step-up has expired, you will
        be redirected to the sign-in challenge.
      </p>
    </div>
  );
}
