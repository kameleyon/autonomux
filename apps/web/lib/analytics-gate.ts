/**
 * apps/web/lib/analytics-gate.ts
 *
 * The single runtime gate every analytics + marketing loader MUST consult
 * before firing. If this returns `false`, no script tag is injected and
 * no event is sent.
 *
 * GDPR Recital 32: consent must precede processing. The cookie is the
 * record of consent. This gate is the enforcement.
 *
 * Usage:
 *   import { analytics, marketing } from "@/lib/analytics-gate";
 *
 *   if (analytics()) loadPostHog();
 *   if (marketing()) loadGoogleAds();
 *
 * On the server, prefer `getConsent({ source })` and pass the cookies()
 * jar — that way SSR can render the right script tags without flicker.
 *
 * Owner: [Comply + Halo] · Phase 1.0-B9
 */

import {
  readConsentCookie,
  type ConsentReadSource,
} from "./consent-cookie";

/** The shape every caller needs — necessary is always true. */
export interface ConsentSnapshot {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
}

/**
 * Read consent in any context.
 *
 * - Server: pass `{ source: await cookies() }` from `next/headers`.
 * - Client: call with no args; we read `document.cookie`.
 * - Edge / middleware: pass `{ source: request.headers.get("cookie") }`.
 */
export function getConsent(opts?: { source?: ConsentReadSource }): ConsentSnapshot {
  const state = readConsentCookie(opts?.source);
  return {
    necessary: true,
    analytics: state.analytics,
    marketing: state.marketing,
  };
}

/** True iff analytics scripts may fire. */
export function analytics(opts?: { source?: ConsentReadSource }): boolean {
  return getConsent(opts).analytics;
}

/** True iff marketing scripts may fire. */
export function marketing(opts?: { source?: ConsentReadSource }): boolean {
  return getConsent(opts).marketing;
}

/**
 * True iff the user has decided anything — used to suppress the banner
 * after a decision and to avoid asking the question twice.
 */
export function hasDecision(opts?: { source?: ConsentReadSource }): boolean {
  const state = readConsentCookie(opts?.source);
  return state.state !== "pending";
}
