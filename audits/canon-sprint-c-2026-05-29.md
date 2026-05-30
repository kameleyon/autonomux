# Canon — Sprint C brand + tokens + voice

Date: 2026-05-29
Scope: Warm-only palette across new pages (no greens/blues even on health pills); `--r-xl` everywhere; AlterEgo voice consistent on security + system-card + subprocessors; no hex literals.

## Findings

- **F-Canon-01 · Critical · apps/admin/app/(authed)/compliance/page.tsx:243 — `style={{ backgroundColor: "var(--brand-red, #b51919)" }}` contains a hex literal fallback (`#b51919`).** Tokens.css defines `--brand-red: #e63312` — the fallback hex is a different shade (`#b51919` is darker burgundy). Two PRD §13 violations: hex literal + token-shadowing inconsistency. Other Sprint-C surfaces use plain `var(--brand-red)` without fallback.
  - *Fix:* Drop the fallback — `style={{ backgroundColor: "var(--brand-red)" }}`. The token is defined globally; the fallback is dead code.

- **F-Canon-02 · Major · apps/admin/components/AdminHealthPill.tsx:38-53 — Health-pill levels map to `--pause-c/-bg/-border` (healthy), `--pitch-c/-bg/-border` (degraded), `--save-c/-bg/-border` (critical).** Looking at tokens.css definitions:
  - `--pause-c: #8a6010` (deep gold) → healthy ✓ warm
  - `--pitch-c: #c0530d` (mid-orange) → degraded ✓ warm
  - `--save-c: #7a2010` (burgundy/wine) → critical ✓ warm
  All three palette positions are warm-spectrum. ✓ No green, no red-stoplight. ✓ Brand-correct.
  - No finding. Keeping for the audit trail.

- **F-Canon-03 · Major · apps/web/app/security/page.tsx:392-400 + apps/web/app/legal/subprocessors/page.tsx:364-381 + apps/web/app/legal/dmca/page.tsx:228-245 — Trust pages use `borderRadius: "var(--r-xl)"` on the `dlStyle` and `CalloutBox`.** ✓ Token-driven. ✓ Warm tokens (`--surface-warm`, `--brand-amber`).
  - apps/web/app/accessibility/page.tsx — has NO rounded surface anywhere (`<Section>` wrappers don't carry a background); the page is text-only. ✓ Consistent with the "no decorative surfaces here" pattern. Verified.

- **F-Canon-04 · Major · apps/web/app/system-card/page.tsx — NO rounded `dl`-style architecture row block (unlike security/page.tsx).** The system-card page has only `<Section>` wrappers and `<ul>` content. No `--r-xl` surface needed if no surfaces exist. ✓ Consistent.
  - No finding.

- **F-Canon-05 · Major · apps/admin/app/(authed)/feature-flags/ViewHistoryButton.tsx:113-128 — Inline `<pre>` block uses `borderRadius: "6px"`.** Hardcoded value — not `--r-xl` (which is the spec-mandated radius for surfaces). Even small surfaces should use the token.
  - *Fix:* Replace with `borderRadius: "var(--r-xl)"` or define `--r-md` if the spec wants a smaller variant.

- **F-Canon-06 · Major · apps/web/app/app/settings/data/page.tsx — NO `--r-xl` anywhere.** The page renders form fields and a bare history table — no card surfaces. Other settings sub-pages render in `.wrap` and might inherit container styling. Inconsistent with `/security`, `/legal/subprocessors`, `/legal/dmca` which all use `--r-xl` on the callout boxes / address blocks.
  - *Fix:* Wrap each major section (Export, Delete, History) in a token-styled surface card (`background: var(--surface)`, `borderRadius: var(--r-xl)`, `border: 1px solid var(--border)`) — matches the trust-pages style.

- **F-Canon-07 · Minor · apps/admin/app/(authed)/tenants/page.tsx:239-249, apps/admin/app/(authed)/audit-log/page.tsx:273-283, apps/admin/app/(authed)/activity/page.tsx:286-294, apps/admin/app/(authed)/costs/page.tsx:172-180, apps/admin/app/(authed)/integrations/page.tsx:162-170 — Page kicker style is duplicated inline 5 times.** Identical 7-property style object. Should be a shared component or CSS class.
  - *Fix:* Extract `<AdminPageKicker>` component or `.adm-page-kicker` class in globals.css. DRY refactor — no behaviour change.

- **F-Canon-08 · Minor · apps/web/app/system-card/page.tsx + apps/web/app/security/page.tsx — Both pages use `color: "var(--brand-orange)"` on the ArchRow `<dt>` (only security has ArchRows). Voice-correct.** ✓ Warm. ✓ Token. No finding.

- **F-Canon-09 · Polish · apps/admin/app/(authed)/feature-flags/FlagRow.tsx:222-227, 257-262 — Error text uses `color: "var(--ink-warning, var(--brand-wine))"` — a fallback to `--brand-wine`.** Token-driven with fallback. ✓ Warm. But `--ink-warning` is NOT defined in tokens.css that I can find. The fallback always fires.
  - *Fix:* Either define `--ink-warning` in tokens.css or use `var(--brand-wine)` directly.

- **F-Canon-10 · Polish · Voice on trust pages.** Security, System Card, Subprocessors, DMCA, Accessibility all read in the "documented, dated, direct" AlterEgo voice. No marketing fluff. ✓ Brand-consistent. Specific examples:
  - "We do not claim to have removed those biases." (system-card)
  - "We treat accessibility as a release blocker, not a follow-up." (accessibility)
  - "Postal address — to be confirmed before public launch." (dmca — honest)
  ✓ Excellent voice work.

## Score
- 1 Critical × 18 = 18
- 3 Major × 7 = 21
- 2 Minor × 2 = 4
- 2 Polish × 0.5 = 1
- **Total deductions: 44** → score 56/100. PASS-WITH-FIXES on this slice.

Summary: Health-pill palette is warm-only ✓, trust-page voice is brand-perfect ✓, token usage is consistent across admin surfaces. The breaks: a single hex-literal fallback `#b51919` on the admin Compliance destructive button, `borderRadius: "6px"` literal in ViewHistoryButton, missing `--r-xl` surfaces on the user `settings/data` page (inconsistent with the trust pages it sits beside in the site footer hierarchy), and `--ink-warning` token referenced but apparently not defined. The repeated page-kicker inline style across 5 admin pages should be DRY'd into a component before more pages copy it.
