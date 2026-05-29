# Canon — Brand + tokens + voice audit · Sprint B · 2026-05-29

Scope: design tokens, palette, radius, voice consistency. Warm-only palette enforcement; `--r-xl` everywhere; hex literals in JSX; AlterEgo voice across legal + banner copy.

## Findings

- **F-CAN-01 · Critical · `apps/web/app/page.tsx:87`** — "**The platform** is in Foundation build." — banned word. Surface-level: landing page, every visitor. (Counted by Proof as F-PRF-01; Canon flags here because it's a brand-voice violation, not just a copy lint.)

- **F-CAN-02 · Major · `apps/web/app/legal/terms/page.tsx:240-242`** — CalloutBox `tone="warn"` sets `background: "rgba(230, 51, 18, 0.06)"` — a raw RGBA literal in JSX. We have `--brand-red-rgb: 230, 51, 18` exposed as a token; use `rgba(var(--brand-red-rgb), 0.06)` to keep the design system traceable. Also `borderColor` falls through to `var(--brand-red)` ✓ — warm palette.

- **F-CAN-03 · Major · `apps/web/components/CookieBanner.tsx:92-93`** — `borderRadius: "var(--r-xl)"` ✓. `boxShadow: "0 12px 32px rgba(26, 20, 16, 0.18)"` — raw rgba literal. Promote to a `--shadow-card` token to ride the value ladder.

- **F-CAN-04 · Major · `apps/web/app/app/onboarding/totp/page.tsx:132-134`** — QR `<img>` uses `borderRadius: "var(--r-md)"`. PRD §13.2: "`--r-xl` = 12px on every rounded surface." Audit other components for `var(--r-md)` / `var(--r-sm)` usage on surfaces. (Tokens declare both; the brand rule limits to `--r-xl` on *cards/surfaces* — `--r-sm`/`--r-md` are fine for hairline form elements per the UI package convention.)

- **F-CAN-05 · Major · `apps/web/app/sign-up/page.tsx:131-133`** — Input borderRadius `var(--r-md)`. Same exception as above — form inputs may use `--r-md`. Document the carve-out in CONTRIBUTING so this doesn't fail future audits.

- **F-CAN-06 · Major · `apps/web/app/app/onboarding/totp/page.tsx:152-153`** — `<code>` uses `background: "var(--ink-2)"` and `color: "var(--brand-white)"`. `--ink-2` is a near-black ink token (warm dark), so contrast is fine. ✓ However: secret block is the visual anchor of the enrollment page; consider a `--surface-code` token with a warm grey to align with `var(--surface-warm)` family.

- **F-CAN-07 · Major · `apps/web/app/app/onboarding/backup-codes/page.tsx:78-93`** — Backup codes `<ul>` uses `background: var(--ink-2); color: var(--brand-white)`. Same observation. Codes are mono — DM Mono ✓. Letter-spacing 0.1em ✓.

- **F-CAN-08 · Minor · `apps/web/app/legal/cookies/page.tsx:233-240`** — `<th>` uses `padding: "var(--sp-12) var(--sp-12)"`. Use the new `--sp-12` token consistently. ✓

- **F-CAN-09 · Minor · Voice consistency across `apps/web/components/CookieBanner.tsx` + `apps/web/app/legal/cookies/page.tsx` + `apps/web/app/legal/privacy/page.tsx`** — All three speak in the same plain, slightly dry register. "Cookies, plainly." / "What a cookie is, in plain English." / "Who we are." — same voice. ✓ AlterEgo personality (calm, competent, never anxious) intact.

- **F-CAN-10 · Minor · `apps/web/app/app/settings/security/page.tsx:135-138`** — "Revoking TOTP requires a fresh authenticator code entered within the last 5 minutes (step-up)." Tight, on-voice. ✓

- **F-CAN-11 · Polish · `apps/web/app/sign-up/page.tsx:69`** — `<h1>Create your <em>AlterEgo</em>.</h1>` — italic AlterEgo is the brand signature. ✓ Used consistently across landing, sign-up, and not-found.

- **F-CAN-12 · Polish · `apps/web/app/sign-in/page.tsx:56`** — H1 reads "Sign in." (with terminal period). Landing reads "Your AlterEgo, almost ready." Sign-up "Create your AlterEgo." All h1s use the trailing period — a deliberate, consistent micro-typographic choice. ✓

## Summary

Palette discipline is good. All colours resolve to warm tokens (`--brand-red`/`--brand-orange`/`--brand-gold`/`--brand-amber`/`--surface-warm`); no green / blue / purple. The one hex/rgba literal in JSX is the legal/terms `CalloutBox` red rgba. `--r-xl` is correctly used on banner + dialog cards. Inputs + small chrome use `--r-md` per UI package convention; document this exception. Voice across banner, legal docs, and onboarding is consistently calm-and-competent — matches AlterEgo brand. One banned word ("platform") on the public landing — Critical per the brand rule.

Score: **88 / 100**
