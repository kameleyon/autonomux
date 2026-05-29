/**
 * apps/web/app/settings/consent/page.tsx
 *
 * Settings page for changing cookie preferences after the initial
 * decision. Same cookie, same shape, three toggles — but as a full page
 * instead of a dialog.
 *
 * GDPR Art. 7(3): "It shall be as easy to withdraw as to give consent."
 * This page is that withdrawal surface, linked from the footer + the
 * cookie policy.
 *
 * Owner: [Comply + Halo] · Phase 1.0-B9
 */
import type { Metadata } from "next";
import { ConsentSettingsPanel } from "./ConsentSettingsPanel";

export const metadata: Metadata = {
  title: "Cookie settings",
  description:
    "Change which cookies autonomux may set. Necessary cookies are always on. Everything else is your call.",
};

export default function ConsentSettingsPage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <h1
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Cookie settings
      </h1>
      <p
        style={{
          color: "var(--ink-soft)",
          fontSize: "var(--fs-body-lg)",
          maxWidth: "60ch",
          marginBottom: "var(--sp-32)",
        }}
      >
        Necessary cookies are always on so you can stay signed in.
        Analytics and marketing are off until you say yes — and you can
        change your mind here whenever.
      </p>
      <ConsentSettingsPanel />
    </main>
  );
}
