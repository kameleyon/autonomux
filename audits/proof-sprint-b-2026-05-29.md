# Proof — Copy + claims audit · Sprint B · 2026-05-29

Scope: every user-facing string in the Sprint B surfaces, plus the four legal pages. Banned-words check (PRD §13.3), smart-quote enforcement, HIPAA refusal contract presence, accuracy of claims.

## Findings

- **F-PRF-01 · Critical · `apps/web/app/page.tsx:87`** — `"The platform is in Foundation build."` Uses banned word **"platform"** (PRD §13.3). Re-word to e.g. "Autonomux is in Foundation build." This is the landing copy in front of every visitor.

- **F-PRF-02 · Major · `apps/web/app/sign-up/page.tsx:185`** — `&quot;Good&quot;` renders straight quotes around "Good". Use `&ldquo;Good&rdquo;` for the typographic curly variant (Cormorant + Inter both pair better with smart quotes).

- **F-PRF-03 · Major · `apps/web/app/legal/terms/page.tsx:50-51`** — `&quot;we,&quot; &quot;us&quot;` → straight quotes for legal definition. Same pattern at `privacy/page.tsx:50`. Use smart quotes throughout legal docs for visual consistency.

- **F-PRF-04 · Major · `apps/web/app/legal/terms/page.tsx:84-104`** — HIPAA refusal contract is **present and load-bearing** (per PRD §10.3 requirement). Copy is sharp: "Do not paste patient information into AlterEgo." "We are not a business associate." "The founder is a registered nurse — this rule is non-negotiable." ✓ Honored.

- **F-PRF-05 · Minor · `apps/web/app/legal/privacy/page.tsx:118-121`** — "Inputs are not used to train models (zero-data-retention enterprise terms)." This is a substantive claim that needs the `marketing/claims-substantiation/*.md` file per PRD §13.4. Add a substantiation pin or soften to "Anthropic's API does not retain or train on production traffic under our agreement (see /legal/subprocessors)."

- **F-PRF-06 · Minor · `apps/web/app/app/onboarding/totp/page.tsx:113-115`** — "Two-factor authentication is required. Open your authenticator app (Google Authenticator, 1Password, Authy, Aegis) and scan the code below — or paste the secret manually." Clear and honest. ✓

- **F-PRF-07 · Minor · `apps/web/components/CookieBanner.tsx:111`** — "Cookies, plainly." headline matches brand voice. ✓ "We need a few cookies to keep you signed in. Everything else — analytics, marketing — is off until you say yes." Voice is consistent.

- **F-PRF-08 · Minor · `apps/web/app/legal/privacy/page.tsx:46`** — `<code>LAST_UPDATED</code>` rendered to user-facing copy. The phrase "We will bump LAST_UPDATED" is leaky engineering jargon. Re-word: "we will update the date at the top of this page."

- **F-PRF-09 · Polish · `apps/web/app/sign-in/page.tsx:71-72`** — Status text uses straight em-dash via the `—` glyph, which is correct. Style guide should formalise this for all status banners.

## Summary

The banned word "platform" appears on the public landing page. Smart-quote violations are sprinkled through legal pages. The HIPAA refusal contract is present and properly framed. Cookie banner copy is on-voice. One unsubstantiated quantitative claim about Anthropic training. Otherwise the copy is direct, honest, doesn't oversell, and avoids the rest of the banned list. AlterEgo voice (calm, competent, never anxious) is preserved across legal docs and consent UI.

Score: **87 / 100**
