# Optic — UX / UI audit · Sprint B · 2026-05-29

Scope: every new user surface — sign-up, sign-in, sign-in/totp, onboarding (totp, backup-codes), settings (security, consent), legal (privacy, terms, dpa, cookies), cookie banner, preferences dialog.

## Findings

- **F-OPT-01 · Major · `apps/web/app/sign-in/page.tsx:144-188`** — TOTP code field shown unconditionally on sign-in, labelled "(optional)" with helper "Required once you've enrolled an authenticator app." Per the auth flow, post-email-verify users land on `/app/onboarding/totp` for mandatory enrollment, then are routed through `/sign-in/totp` for subsequent challenges; the inline TOTP field on `/sign-in` will never be the correct path and confuses both first-timers and enrolled users. Cut the field, route TOTP-bearing users to `/sign-in/totp`.

- **F-OPT-02 · Major · `apps/web/app/sign-in/totp/page.tsx:46-47`** — Conditional `if (factor === null || factor === undefined)` redirects to `/app/onboarding/totp` for users without TOTP, but if Supabase RLS denies the `user_2fa_factors` select for this user (no policy yet on this read path in the tenant-scoped client — service role is needed), the code silently routes to enrollment even when a factor exists. Use service-role for the existence check or add a clear error state.

- **F-OPT-03 · Major · `apps/web/app/sign-up/page.tsx:69`** — H1 "Create your *AlterEgo*." with italic markup is appropriate but the page has no sign-up secondary nav nor a back-to-home affordance; only the inline "Sign in" link at the bottom. Add a brand logo / "home" anchor at the top of all auth surfaces for orientation (matches Hick's law on first-visit decisions).

- **F-OPT-04 · Major · `apps/web/app/sign-in/page.tsx:23`** — `<Suspense fallback={<main id="main" tabIndex={-1} />}>` renders a near-empty `<main>` on first paint (search-params suspension). No h1, no skeleton. Screen readers will hear "main, blank" then a full repaint. Provide a labelled skeleton.

- **F-OPT-05 · Minor · `apps/web/app/app/onboarding/totp/page.tsx:104`** — Page uses `<div className="wrap">` rather than `<main id="main" tabIndex={-1}>`. The root layout's skip-link targets `#main`, so this page breaks the skip-to-content flow. Same on `backup-codes/page.tsx:62`, `settings/security/page.tsx:54`, `sign-in/totp/page.tsx:49`.

- **F-OPT-06 · Minor · `apps/web/app/app/settings/security/page.tsx:67-69`** — TOTP "Not enrolled" state mixes an `<a>` inside a sentence. Honest but flat. An EmptyState component (already in `@autonomux/ui`) with a primary CTA would carry more visual hierarchy and matches every other "empty" surface in the system.

- **F-OPT-07 · Minor · `apps/web/app/sign-up/page.tsx:185`** — "Strength must reach 'Good'." uses straight quotes around Good; React strips inner whitespace fine but consider smart quotes per Proof's style guide.

## Summary

The Sprint B UX is functional and honest. Forms are minimalist, copy is direct, error states are signalled with `role="alert"`. Biggest concerns are (1) the sign-in TOTP field that doesn't match the documented flow, (2) the missing `<main id="main">` wrappers on 4 surfaces that break the skip-link, and (3) the Suspense fallback emptying the landmark. The cookie banner / dialog flow is APG-correct and well-paced — a strong implementation. Legal pages are clean, scannable, single-h1 each.

Score: **84 / 100**
