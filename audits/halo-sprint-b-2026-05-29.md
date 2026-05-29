# Halo — WCAG 2.2 AA audit · Sprint B · 2026-05-29

Scope: every new UI surface — sign-up, sign-in, sign-in/totp, onboarding (totp, backup-codes), settings (security, consent), legal pages, cookie banner, preferences dialog.

## Findings

- **F-HALO-01 · Critical · `apps/web/app/app/onboarding/totp/page.tsx:104`** — Page renders `<div className="wrap">` instead of `<main id="main" tabIndex={-1}>`. Skip-link target broken (SC 2.4.1 Bypass Blocks). Same defect on `apps/web/app/app/onboarding/backup-codes/page.tsx:62`, `apps/web/app/app/settings/security/page.tsx:54`, `apps/web/app/sign-in/totp/page.tsx:49`. Wrap each in `<main id="main" tabIndex={-1}>`.

- **F-HALO-02 · Critical · `apps/web/app/sign-in/page.tsx:22-26`** — Suspense fallback `<main id="main" tabIndex={-1} />` is empty; first paint has no h1 → SC 1.3.1 + SC 2.4.6. Render a labelled "Signing you in…" placeholder so the landmark always has content.

- **F-HALO-03 · Major · `apps/web/app/sign-up/page.tsx:215-227`** — Submit button: when `!canSubmit`, background flips to `var(--muted)` (light grey) and `color: var(--ink-on-brand)` (likely white). Probable contrast ratio < 3:1 for disabled state. Use `aria-disabled` + visible affordance ladder.

- **F-HALO-04 · Major · `apps/web/components/CookiePreferencesDialog.tsx:188-201`** — Toggle button height is `28px`; while `minWidth: 44` is set, the **height is below 44px** so tap-target SC 2.5.8 (24×24 AA / 44×44 AAA target) is satisfied at AA but the row's full tap area is unclear. Add visible focus ring and ensure the entire row is click-tolerant.

- **F-HALO-05 · Major · `apps/web/app/sign-in/totp/page.tsx:56-77`** — `<form>` has a single `<label>` and `<input>` but no error region / aria-live for the `?err=` / `?msg=` query params surfaced by `submitSignInTotp`. The page renders the error nowhere — the user re-submits identical input. Add an `aria-live="polite"` region that reads `searchParams.msg`.

- **F-HALO-06 · Major · `apps/web/app/app/onboarding/backup-codes/page.tsx:90-94`** — Codes list uses `display: grid; gridTemplateColumns: repeat(2, ...)`. At 320px viewport (PRD §9 reflow target) two-column layout breaks. Add `repeat(auto-fit, minmax(0, 1fr))` or `gridTemplateColumns: "1fr 1fr"` with a media-query collapse.

- **F-HALO-07 · Major · `apps/web/app/app/onboarding/totp/page.tsx:124-135`** — `<img src={qrDataUrl} alt="Two-factor QR code">`. Alt text describes presence, not purpose. SC 1.1.1 expects "Two-factor authentication QR code — scan with your authenticator app." Also add a visually-hidden text alternative containing the secret (which is the QR's actual content) so screen reader users don't need the manual section to enroll.

- **F-HALO-08 · Major · `apps/web/components/CookieBanner.tsx:78-99`** — Banner uses `role="region"` ✓ (correct per spec — NOT a dialog). However, the banner does not have a labelled `id` on the heading tied via `aria-labelledby`; only `aria-label="Cookie consent"`. Use `aria-labelledby={headingId}` for the h2 so the landmark surfaces the heading content.

- **F-HALO-09 · Major · `apps/web/app/sign-up/page.tsx:81-101`** — Honeypot input has `aria-hidden="true"` on the wrapper but the `<label>` and `<input>` inside are still in the accessibility tree (you only `aria-hidden` the wrapping `<div>`, which is OK for AT-tree). However the input lacks `tabIndex={-1}` ✓ — it IS set. Validate that AT does not surface "Leave this empty" as a real field when its container is `aria-hidden`.

- **F-HALO-10 · Major · `apps/web/app/app/settings/security/WebAuthnEnroll.client.tsx:67-74`** — `<input>` for nickname has `htmlFor` and `id` mismatched: label says `htmlFor="passkey-nickname"` and input `id="passkey-nickname"` ✓ but the input has no `aria-describedby` for the placeholder pattern. Add inline help.

- **F-HALO-11 · Minor · `apps/web/app/app/onboarding/totp/page.tsx:185-186`** — TOTP code input has both `required` and `aria-required="true"` — duplicate (the latter is implicit when `required` is present per ARIA 1.2). Remove `aria-required="true"` to avoid double-announcement. Same on `backup-codes/page.tsx:120-121`, `sign-in/totp/page.tsx:65-66`.

- **F-HALO-12 · Minor · `apps/web/app/legal/privacy/page.tsx:26`** — `<main id="main" tabIndex={-1}>` ✓ on all four legal pages and on `/settings/consent`. Good.

- **F-HALO-13 · Minor · `apps/web/app/app/onboarding/totp/page.tsx:147-161`** — Secret rendered in `<code>` with `aria-label="Two-factor secret"` ✓. Add `aria-live="polite"` so SR users hear the secret when the page mounts (or just rely on first-focus). Edge case — defer.

## Summary

Sprint B clears the AA bar at the structural level — skip-link present, focus management on Dialog is APG-correct, banner uses `role="region"` not dialog, forms have labels. But 4 surfaces inside `/app/onboarding` and `/app/settings/security` and `/sign-in/totp` drop the `<main id="main">` wrapper, breaking skip-to-content. The sign-in Suspense fallback emits an empty landmark. Several `aria-required` duplications. QR alt text is not informative. These are mechanical fixes; none are structural redesigns. The cookie banner is the standout — `role="region"` + APG-correct dialog companion is rare and right.

Score: **78 / 100**
