/**
 * apps/web/app/app/onboarding/backup-codes/page.tsx
 *
 * Step 2 of TOTP enrollment: display the 10 backup codes ONCE. User must
 * confirm "I've saved these" before continuing. After confirmation:
 *   - `user_2fa_factors.backup_codes_displayed_at` is set (trigger logs).
 *   - The display cookie is cleared.
 *   - User is redirected to /app (or /app/onboarding/next-step).
 *
 * If the display cookie is missing (e.g. user navigated here directly),
 * bounce back to /app/onboarding/totp to start over.
 *
 * Codes are shown as monospace blocks suitable for copy-paste, with a
 * "Download .txt" link as a fallback for users who prefer paper / a vault.
 *
 * Owner: [Cipher + Shield]
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import {
  BACKUP_DISPLAY_COOKIE_NAME,
  decodeBackupDisplayCookie,
} from "@/lib/twofa/cookie";

import { submitBackupCodesConfirm } from "./action";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Save your backup codes",
};

export default async function BackupCodesPage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const user = await requireAuth(supabase);

  const cookieStore = await cookies();
  const raw = cookieStore.get(BACKUP_DISPLAY_COOKIE_NAME)?.value;
  const payload = decodeBackupDisplayCookie(raw);

  if (payload === null || payload.userId !== user.id) {
    redirect("/app/onboarding/totp");
  }

  // Build a data URL for the "Download .txt" button so the codes never round-trip.
  const txt = [
    "Autonomux — Backup codes",
    "Issued: " + new Date(payload.issuedAt).toISOString(),
    "Account: " + (user.email ?? user.id),
    "",
    ...payload.codes,
    "",
    "Each code can be used exactly once. Store somewhere safe.",
  ].join("\n");
  const txtDataUrl =
    "data:text/plain;charset=utf-8," + encodeURIComponent(txt);

  return (
    <div className="wrap">
      <h1>Save your backup codes</h1>
      <p>
        These 10 codes let you sign in if you lose access to your
        authenticator app. Each code works exactly once. Save them now —
        you will not see them again.
      </p>

      <section
        aria-labelledby="backup-codes-heading"
        style={{ marginTop: "var(--sp-24)" }}
      >
        <h2 id="backup-codes-heading">Your codes</h2>
        <ul
          style={{
            listStyle: "none",
            padding: "var(--sp-16)",
            background: "var(--ink-2)",
            color: "var(--brand-white)",
            borderRadius: "var(--r-md)",
            fontFamily: "DM Mono, monospace",
            fontSize: "1.1rem",
            lineHeight: 1.8,
            letterSpacing: "0.1em",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0,1fr))",
            gap: "var(--sp-8)",
          }}
        >
          {payload.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>

        <p style={{ marginTop: "var(--sp-16)" }}>
          <a href={txtDataUrl} download="autonomux-backup-codes.txt">
            Download as .txt
          </a>
        </p>
      </section>

      <section
        aria-labelledby="backup-confirm-heading"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="backup-confirm-heading">Confirm</h2>
        <form action={submitBackupCodesConfirm}>
          <input type="hidden" name="factor_id" value={payload.factorId} />
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--sp-8)",
            }}
          >
            <input
              type="checkbox"
              name="confirm"
              required
              aria-required="true"
            />
            <span>
              I have saved these codes somewhere safe. I understand I will
              not see them again.
            </span>
          </label>
          <button type="submit" style={{ marginTop: "var(--sp-16)" }}>
            Continue
          </button>
        </form>
      </section>
    </div>
  );
}
