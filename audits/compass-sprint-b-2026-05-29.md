# Compass — Audience + compliance fit audit · Sprint B · 2026-05-29

Scope: legal/privacy, legal/terms, legal/cookies, legal/dpa, cookie banner + preferences, settings/consent — for GDPR, CCPA, HIPAA refusal, audience appropriateness.

## Findings

- **F-CMP-01 · Critical · `apps/web/app/legal/privacy/page.tsx:55-58`** — DPO contact: "Postal address and Data Protection Officer details will be added before launch." GDPR Art. 13(1)(a)(b) **requires** controller name + DPO contact at publication. This is a draft-only state; LAST_UPDATED is locked at `2026-05-29` which makes the page look published. Either back-date `LAST_UPDATED` to "Draft" or add the postal address + DPO before any production push.

- **F-CMP-02 · Critical · `apps/web/app/legal/privacy/page.tsx:138-140`** — "The full, dated list lives at `/legal/subprocessors`." Link will 404 — no such page in this sprint. GDPR Art. 28(2) requires the subprocessor list to be available. Either ship the placeholder page or remove the link until B12.

- **F-CMP-03 · Major · `apps/web/app/legal/dpa/page.tsx:89-102`** — DPA page promises a downloadable PDF and tells the user to email `legal@autonomux.app` until then. Per GDPR Art. 28(3), processing agreements must be "in writing, including in electronic form." A page describing the DPA doesn't satisfy 28 by itself; the "email us" fallback is OK for now but make the section header explicitly "DPA — request a copy" until the PDF lands.

- **F-CMP-04 · Major · `apps/web/lib/consent-cookie.ts:62-71` + `apps/web/components/CookieBanner.tsx:74`** — `pendingConsent()` returns `{ analytics: false, marketing: false }` ✓ (Recital 32: pre-checked boxes = not consent). Banner renders only when `consent.state === "pending"` ✓. Necessary cookies fire either way ✓. **Pass on Recital 32.**

- **F-CMP-05 · Major · `apps/web/app/legal/privacy/page.tsx:199-206`** — CCPA section: "We do not sell or share personal information for cross-context behavioural advertising." Honors the "do not sell" expectation ✓. Add the explicit California Notice at Collection at the top (CCPA §1798.100(b)) — a sentence: "Categories collected: identifiers, internet/network activity, geolocation (IP-derived), commercial info (billing)."

- **F-CMP-06 · Major · `apps/web/app/legal/terms/page.tsx:84-104`** — HIPAA refusal contract: locked, explicit, and properly worded ✓. Calls out: no BAA, not a covered entity, founder is RN, do not paste PHI, repeat violations → suspension. Matches PRD §10.3 verbatim direction. **Pass.**

- **F-CMP-07 · Major · `apps/web/app/legal/cookies/page.tsx:33-68`** — Cookie table lists 4 cookies. Missing rows for the Phase 1.0-B Cipher/2FA cookies: `autonomux_totp_enroll`, `autonomux_webauthn_reg`, `autonomux_webauthn_auth`, `autonomux_backup_display`, `autonomux_step_up`. These are necessary, but undisclosed cookies = GDPR transparency failure (Art. 13). Add them.

- **F-CMP-08 · Major · `apps/web/app/legal/privacy/page.tsx:151-155`** — Retention: "Account data — for the life of your account, plus 30 days after deletion." Engineering reality not yet verified. Tie this to an Atlas-owned retention spec before launch (matches PRD warning in the page itself).

- **F-CMP-09 · Minor · `apps/web/app/legal/privacy/page.tsx:189-192`** — "Lodge a complaint — with your local supervisory authority (EU)…". Should explicitly call out the right under GDPR Art. 77 and provide an EDPB locator link.

## Summary

The compliance scaffolding is in place — GDPR Art. 6, 7(1), 7(3), 13, 28, 33 all surfaced; CCPA do-not-sell honored; HIPAA refusal contract locked. The cookie-consent flow is properly opt-in with the correct legal default. Three real blockers before the page can claim "published": DPO contact missing, subprocessors page link 404, and 5 undisclosed necessary cookies. The DPA page is candid that the PDF isn't shipped yet, which is fine for Foundation. Counsel review banners are present.

Score: **80 / 100**
