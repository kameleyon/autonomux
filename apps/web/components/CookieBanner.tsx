"use client";

/**
 * apps/web/components/CookieBanner.tsx
 *
 * The persistent consent banner. Renders ONLY when the user has not yet
 * made a decision (no cookie set, or cookie state is `pending`).
 *
 * Why this is a `region`, not a `dialog`:
 * - GDPR + WAI-ARIA APG both push toward the same answer: a persistent
 *   surface that does NOT trap focus, so the user can keep reading the
 *   page while they decide. Forcing a focus-trapping modal at first paint
 *   harms users who came to read the cookie / privacy policy itself.
 * - role="region" + aria-label gives SR users a labelled landmark they
 *   can jump to / from.
 *
 * Three options (no dark patterns):
 *   1. "Reject non-essential" — same prominence as Accept.
 *   2. "Manage preferences"   — opens the dialog.
 *   3. "Accept all"           — turns on analytics + marketing.
 *
 * "Reject" and "Accept" are visually equal — Required by EDPB 03/2022
 * guidelines on dark patterns.
 *
 * Owner: [Comply + Halo] · Phase 1.0-B9
 */

import { useEffect, useState } from "react";
import { Button } from "@autonomux/ui";
import {
  buildAcceptAllState,
  buildCustomState,
  buildRejectedState,
  pendingConsent,
  readConsentCookie,
  writeConsentCookie,
  type ConsentState,
} from "@/lib/consent-cookie";
import { CookiePreferencesDialog } from "./CookiePreferencesDialog";

export function CookieBanner(): React.ReactElement | null {
  // We start with `null` so SSR + first client render agree (no flicker,
  // no hydration mismatch). After mount we read the cookie and decide.
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [prefsOpen, setPrefsOpen] = useState<boolean>(false);

  useEffect(() => {
    setConsent(readConsentCookie());
  }, []);

  function apply(next: ConsentState): void {
    writeConsentCookie(next);
    setConsent(next);
  }

  function handleReject(): void {
    apply(buildRejectedState());
  }

  function handleAcceptAll(): void {
    apply(buildAcceptAllState());
  }

  function handleSaveCustom(prefs: {
    analytics: boolean;
    marketing: boolean;
  }): void {
    apply(buildCustomState(prefs));
  }

  // Don't render on the server, don't render until we know the state,
  // don't render once a decision has been made.
  if (consent === null) return null;
  if (consent.state !== "pending") return null;

  return (
    <>
      <section
        role="region"
        aria-label="Cookie consent"
        style={{
          position: "fixed",
          left: "50%",
          bottom: "var(--sp-24)",
          transform: "translateX(-50%)",
          width: "calc(100% - var(--sp-32))",
          maxWidth: 720,
          background: "var(--brand-white)",
          color: "var(--ink)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--r-xl)",
          padding: "var(--sp-20) var(--sp-24)",
          boxShadow: "0 12px 32px rgba(26, 20, 16, 0.18)",
          zIndex: 90,
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-16)",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 600,
              fontSize: "var(--fs-h-step)",
              margin: 0,
              marginBottom: "var(--sp-8)",
              letterSpacing: 0,
            }}
          >
            Cookies, plainly.
          </h2>
          <p
            style={{
              fontSize: "var(--fs-body)",
              lineHeight: "var(--lh-body)",
              color: "var(--ink-soft)",
              margin: 0,
            }}
          >
            We need a few cookies to keep you signed in. Everything else —
            analytics, marketing — is off until you say yes. Read the{" "}
            <a href="/legal/cookies">cookie policy</a> for the full list.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "var(--sp-12)",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Button variant="ghost" onClick={handleReject}>
            Reject non-essential
          </Button>
          <Button variant="secondary" onClick={() => setPrefsOpen(true)}>
            Manage preferences
          </Button>
          <Button variant="primary" onClick={handleAcceptAll}>
            Accept all
          </Button>
        </div>
      </section>

      <CookiePreferencesDialog
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        initial={consent ?? pendingConsent()}
        onSave={handleSaveCustom}
      />
    </>
  );
}
