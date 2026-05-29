/**
 * apps/web/app/app/onboarding/totp/page.tsx
 *
 * Step 1 of two-step 2FA enrollment (PRD §7.1 — TOTP mandatory at signup).
 *
 *   - Server generates a fresh TOTP secret.
 *   - Encrypts it via @autonomux/cipher envelope (purpose='totp_secret').
 *   - Stores the envelope in a signed, httpOnly, SameSite=Strict cookie
 *     (10-min TTL). The cookie is NOT a session cookie — it is single-purpose
 *     and dies on enroll-or-abandon.
 *   - Renders a QR (otpauth:// URI as data URL) and the secret as text
 *     fallback. The plaintext secret leaves server memory only via the QR
 *     image data URL and the hidden monospace block — both rendered ONCE on
 *     this page and never re-fetched.
 *   - User submits 6-digit code → action verifies → persists factor + backup
 *     codes → redirects to /app/onboarding/backup-codes.
 *
 * Security notes:
 *   - Secret is in the HTML payload exactly once (no JS state, no localStorage).
 *   - Refreshing the page generates a NEW secret + cookie — last one wins.
 *     This is intentional: a captured secret-cookie that hasn't been verified
 *     is invalidated by the refresh.
 *   - Already-enrolled users are redirected to settings.
 *
 * Owner: [Cipher + Shield]
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { encrypt } from "@autonomux/cipher";
import { generateTotpSecret, provisioningUri } from "@autonomux/auth";

import {
  requireAuth,
  requireTenantId,
} from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import {
  TOTP_ENROLL_COOKIE_MAX_AGE,
  TOTP_ENROLL_COOKIE_NAME,
  encodeTotpEnrollCookie,
  twoFaCookieAttrs,
} from "@/lib/twofa/cookie";

import { submitTotpVerify } from "./action";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Set up two-factor",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TotpEnrollPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}): Promise<React.ReactElement> {
  const params = searchParams !== undefined ? await searchParams : {};
  const errMsg = typeof params.msg === "string" ? params.msg : null;

  const supabase = await createClient();
  const user = await requireAuth(supabase);
  const tenantId = await requireTenantId(supabase);

  // Already enrolled? Bounce to settings.
  const { data: existing } = await supabase
    .from("user_2fa_factors")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "totp")
    .is("revoked_at", null)
    .maybeSingle();

  if (existing !== null && existing !== undefined) {
    redirect("/app/settings/security");
  }

  // Fresh secret per page render. Encrypt before placing in the cookie.
  const secret = generateTotpSecret();
  const envelope = await encrypt(secret, tenantId, "totp_secret");

  const accountName = user.email ?? user.id;
  const otpauthUri = provisioningUri(secret, accountName, "Autonomux");

  // QR code rendered server-side → data URL → <img src>. Keeps the secret
  // out of any client bundle / script.
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
  });

  // Drop the pending envelope in a short-lived signed cookie.
  const cookieStore = await cookies();
  cookieStore.set(
    TOTP_ENROLL_COOKIE_NAME,
    encodeTotpEnrollCookie({ userId: user.id, envelope }),
    twoFaCookieAttrs(TOTP_ENROLL_COOKIE_MAX_AGE),
  );

  return (
    <div className="wrap">
      <h1>Set up two-factor</h1>
      {errMsg !== null ? (
        <p role="alert" style={{ color: "var(--brand-red)" }}>
          {errMsg}
        </p>
      ) : null}
      <p>
        Two-factor authentication is required. Open your authenticator app
        (Google Authenticator, 1Password, Authy, Aegis) and scan the code
        below — or paste the secret manually.
      </p>

      <section
        aria-labelledby="totp-qr-heading"
        style={{ marginTop: "var(--sp-24)" }}
      >
        <h2 id="totp-qr-heading">Scan with your authenticator</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="Two-factor QR code"
          width={256}
          height={256}
          style={{
            display: "block",
            background: "var(--brand-white)",
            padding: "var(--sp-12)",
            borderRadius: "var(--r-md)",
          }}
        />
      </section>

      <section
        aria-labelledby="totp-secret-heading"
        style={{ marginTop: "var(--sp-24)" }}
      >
        <h2 id="totp-secret-heading">Or enter the secret manually</h2>
        <p>
          If your authenticator cannot scan QR codes, paste this secret
          instead.
        </p>
        <code
          aria-label="Two-factor secret"
          style={{
            display: "block",
            padding: "var(--sp-12)",
            background: "var(--ink-2)",
            color: "var(--brand-white)",
            borderRadius: "var(--r-sm)",
            fontFamily: "DM Mono, monospace",
            letterSpacing: "0.1em",
            wordBreak: "break-all",
          }}
        >
          {secret}
        </code>
      </section>

      <section
        aria-labelledby="totp-verify-heading"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="totp-verify-heading">Confirm with a 6-digit code</h2>
        <p>
          Enter the current 6-digit code from your authenticator app to
          finish enrollment.
        </p>
        <form action={submitTotpVerify}>
          <label htmlFor="totp-code" style={{ display: "block" }}>
            Code
          </label>
          <input
            id="totp-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            aria-required="true"
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: "1.5rem",
              letterSpacing: "0.4em",
              padding: "var(--sp-12)",
              width: "12ch",
            }}
          />
          <button
            type="submit"
            style={{ marginLeft: "var(--sp-12)" }}
          >
            Verify &amp; enroll
          </button>
        </form>
      </section>

      <p style={{ marginTop: "var(--sp-32)", fontSize: "0.9em" }}>
        Lost your authenticator? You will be given 10 backup codes after
        enrollment. Save them somewhere safe — we cannot recover them later.
      </p>
    </div>
  );
}
