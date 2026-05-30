# Optic — Sprint C UX/UI review

Date: 2026-05-29
Scope: Admin pages (tenants, drill-down, audit-log, activity, costs, integrations, feature-flags, compliance), user `settings/data`, trust pages (security, system-card, subprocessors, dmca, accessibility), SiteFooter.

## Findings

- **F-Optic-01 · Major · apps/admin/app/(authed)/compliance/page.tsx:55-265 — Compliance page is the only Sprint-C admin surface that lacks a Phase-1.0-C kicker.** Every other new admin page (tenants, audit-log, activity, costs, integrations) opens with a uniform DM-Mono `Phase 1.0-Cn · …` kicker. Compliance jumps straight to `<h1>Compliance</h1>`. Visual rhythm of the cpanel is broken on this page only.
  - *Fix:* Add the same kicker block ("Phase 1.0-C7 · Compliance") and a one-line description matching the sibling page voice ("LLM cost per window…" / "Per-integration OAuth posture…"). 7 lines of JSX, no logic change.

- **F-Optic-02 · Major · apps/admin/app/(authed)/compliance/page.tsx:301-385 — RequestsTable + AuditTable hand-roll `<table>` with NO caption.** AdminTable (used by every other Sprint-C page) has caption baked in; Compliance forgoes it. Inconsistent affordance + WCAG miss (see Halo F-Halo-03).
  - *Fix:* Either migrate to `AdminTable` (preferred — same column-render contract) or add screen-reader `<caption className="sz-sr-only">` to both tables.

- **F-Optic-03 · Major · apps/admin/app/(authed)/feature-flags/page.tsx — No empty-state CTA path for the "no flags yet" row.** Empty cell tells the user to "Click + Create flag" but the CTA lives at the page-header level, not next to the message. On a wide screen the eye chain breaks.
  - *Fix:* In the empty `<td>`, embed a second `CreateFlagDialog` instance OR a `<button>` that fires the same dialog open state. Keep page-level CTA as well.

- **F-Optic-04 · Major · apps/web/app/app/settings/data/page.tsx:113-117 — Export submit button has no destructive/warning treatment and no disabled-on-pending state.** The export is non-destructive but produces a 30-day signed URL containing the user's full data. A clearer confirmation of "this will email you a download link in a few minutes" is missing.
  - *Fix:* Add a sub-line under the button summarising what happens next ("We'll email you when the archive is ready — usually under 2 minutes"). Optional `aria-describedby` to that line.

- **F-Optic-05 · Minor · apps/admin/app/(authed)/integrations/page.tsx:141-156 — "Tenants" column links to `/tenants?integration=…` but the tenants page does NOT honour the `integration` filter.** `apps/admin/app/(authed)/tenants/page.tsx` only parses `plan|status|id|page` query params. Following the link dumps the user on the unfiltered tenants list — confusing.
  - *Fix:* Either (a) add an `integration` filter to the tenants page (preferred — it's an obvious operator need) or (b) point the link at a placeholder/disable when integration filter is not yet wired and surface "filter not yet wired — see audit-log".

- **F-Optic-06 · Minor · apps/admin/app/(authed)/layout.tsx:74-82 — Nav items have no active-state styling and no `aria-current="page"`.** With 12 nav items, the operator can lose track of where they are.
  - *Fix:* Read `usePathname()` in a small client component or compare with `headers().get('next-url')` and set `aria-current="page"` on the matching `<Link>`; style via `[aria-current=page] { color: var(--brand-orange); }`.

- **F-Optic-07 · Polish · apps/web/app/app/settings/data/page.tsx:240-289 — RequestHistoryTable is unstyled and has no caption.** Bare `<table>` with no styling, no `--r-xl`, no warm palette. Looks like a stub against the rest of the page.
  - *Fix:* Wrap in an `adm-card`-style container, add a screen-reader caption, and apply token-driven cell padding to align with sibling pages.

- **F-Optic-08 · Polish · apps/web/components/SiteFooter.tsx — No mention of the AI system card / accessibility statement on every page footer; columns are well-grouped, but `/system-card` is under "Product" while `/accessibility` is under "Trust" — counterintuitive.** Auditors expect to find the system card next to the trust links.
  - *Fix:* Move `/system-card` to the "Trust" column.

## Score
- 1 Critical: 0
- 4 Major × 7 = 28
- 2 Minor × 2 = 4
- 2 Polish × 0.5 = 1
- **Total deductions: 33** → score 67/100 PASS-WITH-FIXES on this slice.

Summary: Sprint C admin surface is largely consistent (counter cards + AdminTable + AdminFilterBar everywhere) and the trust pages are well-written, dated, and honest. The breaks-from-pattern are concentrated on the Compliance page (bare tables, missing kicker) and the user-side `settings/data` (unstyled history table). Feature-flags inline editor is excellent. Operator deep-links from Integrations → Tenants are a dead-end until the tenants page parses the `integration` query param.
