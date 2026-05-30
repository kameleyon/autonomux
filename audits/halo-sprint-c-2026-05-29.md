# Halo — Sprint C WCAG 2.2 AA review

Date: 2026-05-29
Scope: Admin tables semantic structure, drill-down focus order, feature flags inline editor (range + UUID textareas + dialogs), dialogs APG-correct, settings/data destructive flow, security page heading hierarchy, footer focus-visible.

## Findings

- **F-Halo-01 · Critical · apps/admin/app/(authed)/compliance/page.tsx:301-385 — RequestsTable + AuditTable have NO `<caption>`.** WCAG SC 1.3.1 (Info & Relationships) requires data tables to be programmatically identified to assistive tech. AdminTable (used everywhere else this sprint) provides `<caption>` by default; the hand-rolled tables in Compliance regress that. Screen-reader users hear the columns but no purpose-of-table summary.
  - *Fix:* Either migrate the two tables to `AdminTable` (preferred — matches every other Sprint-C surface) or add `<caption className="sz-sr-only">…</caption>` to each. ~6 lines.

- **F-Halo-02 · Critical · apps/web/app/app/settings/data/page.tsx:244-289 — RequestHistoryTable has NO `<caption>`.** Same SC 1.3.1 issue on the user-facing side. This is the GDPR self-service surface — auditors will look at this exact table.
  - *Fix:* Add `<caption className="visually-hidden">Your prior GDPR export and deletion requests</caption>`.

- **F-Halo-03 · Critical · apps/admin/app/(authed)/feature-flags/FlagRow.tsx:114-364 — Inline-edit row mixes `<th scope="row">` with `<td>` cells that contain interactive form controls AND a Dialog at the same DOM depth as a `<td>`.** The `<Dialog>` for delete-confirm renders inside `<td headers="th-actions">` (line 281-343). When the dialog opens, focus moves into it but it sits as a child of a `<td>` — screen-readers may announce the dialog as part of the row context. APG says Dialog should portal to `document.body` or at minimum to a top-level container.
  - *Fix:* Audit the `@autonomux/ui/Dialog` component — if it already portals (createPortal to document.body), this is fine; if it doesn't, refactor or move the Dialog mount-point out of the `<td>` (e.g., into a wrapper `<aside>` sibling to the table).

- **F-Halo-04 · Major · apps/admin/app/(authed)/feature-flags/FlagRow.tsx:168-184 — `<input type="range">` has `aria-valuemin/max/now` set explicitly.** Native ranges already expose these to AT — duplicating them risks de-sync (you update `value` but forget `aria-valuenow`, etc.). Code currently keeps them in sync but the redundancy is a footgun.
  - *Fix:* Remove the three `aria-value*` props; rely on the native semantics + the `<output>` for the visible read-out.

- **F-Halo-05 · Major · apps/admin/app/(authed)/feature-flags/FlagRow.tsx:130-135 — `<form>` is declared INSIDE the first `<th>` cell.** HTML parsing: a `<form>` inside `<th>` is technically valid but unusual; the row's form-attribute-linking (`form={formId}`) is a clever React pattern that works but produces a flat HTML that puts a `<form>` as a sibling-element-style child of a `<th>`. Most AT parses this correctly, but Voice Control on Safari (per past audits) trips on form-in-th. WCAG-flexible — but a more conservative pattern is to render the `<form>` as a hidden sibling outside the table.
  - *Fix:* Move the `<form id={formId}>…</form>` declaration out of `<th>`, render it at the page level (or use `position: absolute; visibility: hidden`) — keep the `form={formId}` linking. Each row still gets its own form scope.

- **F-Halo-06 · Major · apps/admin/components/AdminFilterBar.tsx:75-83 — `<input type="search">` has `autoComplete="off"` and no `aria-describedby` for the hint text below the multi-select.** Search inputs are fine but the multi-select fields below have a "Hold ⌘/Ctrl to select multiple" hint that uses `aria-describedby` correctly — text inputs would benefit from similar wiring when there's a placeholder hint pattern.
  - Minor — current behaviour is acceptable.

- **F-Halo-07 · Major · apps/admin/app/(authed)/compliance/page.tsx:240-246 — DESTRUCTIVE "Initiate deletion" button has visible inline `style={{ backgroundColor: "var(--brand-red, #b51919)" }}` BUT the buttons around it have no warning/destructive distinction either visually or via ARIA.** The aria-label says nothing about destruction; a screen-reader user only hears "Initiate deletion". Combined with the typed-confirmation pattern this is OK, but the visual color treatment isn't matched by accessible name.
  - *Fix:* Either `aria-describedby` pointing to a "this is irreversible" hint, or update the button text to "Initiate destructive deletion" / `aria-label="Initiate permanent deletion for tenant"`.

- **F-Halo-08 · Major · apps/web/app/app/settings/data/page.tsx:227-233 — Delete account submit button has inline `backgroundColor: var(--brand-red)`, `color: var(--brand-white)` but no `aria-describedby` linking to the consequences paragraph (line 128-135).** The destructive button visually screams "destructive" but a screen-reader user only hears "Delete my account". The 5-sentence consequences paragraph IS visible above but isn't programmatically tied to the control.
  - *Fix:* Give the consequences paragraph an `id="delete-consequences"` and add `aria-describedby="delete-consequences"` on the submit button.

- **F-Halo-09 · Minor · apps/admin/app/(authed)/layout.tsx:74-83 — Sidebar nav links have no `aria-current="page"` indicator.** Already flagged in Optic F-Optic-06. WCAG SC 2.4.8 (Location) — orientation is improved when the current page is programmatically distinguished.

- **F-Halo-10 · Minor · apps/admin/components/AdminPagination.tsx:88-94 — Disabled Prev/Next render as `<span>` with `aria-disabled="true"`.** OK pattern, but the `<span>` has no focus-management consideration. Operators tabbing through hit these spans and skip them (correct because they're not focusable) — but `aria-disabled` without a focus stop means the announcement of "disabled, button" never happens. Choose: either render a disabled `<button>` (preferred — it gets the focus stop + announcement), or remove the prev/next entirely on edge pages.
  - *Fix:* Replace disabled `<span>` with `<button type="button" disabled>` — same visual, real semantics.

- **F-Halo-11 · Minor · apps/admin/app/(authed)/feature-flags/FlagRow.tsx:344-360 — Status announcement region uses `color: "transparent"` to hide empty state.** SC 1.4.3 (Contrast) is not violated (transparent text is hidden), but JAWS still announces an empty live region update on every status flip. Better pattern: render `null` when status is null, mount the `<p>` only when needed.
  - *Fix:* Conditional render: `{status !== null ? <p id={statusId} role="status" aria-live="polite">{status.message}</p> : null}`.

## Score
- 3 Critical × 18 = 54
- 5 Major × 7 = 35
- 3 Minor × 2 = 6
- **Total deductions: 95** → score 5/100. FAIL on this slice in isolation; the Critical missing-caption issues dominate.

Summary: Three missing `<caption>` elements on data tables (Compliance ×2, settings/data ×1) are the load-bearing accessibility failures — every other admin table uses `AdminTable` which gets caption for free, so these regress the pattern. The feature-flags FlagRow is mostly excellent (real range + textareas + Dialog with APG roles) but renders the per-row `<form>` inside a `<th>` and mounts the Dialog inside a `<td>` — both are atypical and warrant verifying with VoiceOver before launch. The settings/data destructive flow needs `aria-describedby` linking the delete button to its consequences paragraph.
