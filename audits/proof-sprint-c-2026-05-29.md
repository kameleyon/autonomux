# Proof — Sprint C copy + claims review

Date: 2026-05-29
Scope: Every user-facing + admin-facing string in Sprint C; trust-page claims grounded against engineering reality; GDPR deletion confirmation copy explicit.

## Findings

- **F-Proof-01 · Critical · apps/web/app/app/settings/data/page.tsx:84-85 — Status copy after request is misleading: "It may take a few minutes to complete; refresh this page to see status updates."** This is GDPR Article 20 / 17 — the strict legal language matters. "A few minutes" is non-committal where the user needs a specific signal. Also no acknowledgement that we'll email when ready.
  - *Fix:* "Your request was received. You'll receive an email when the archive is ready — typically within 5 minutes. The link in that email is valid for 30 days."

- **F-Proof-02 · Major · apps/web/app/app/settings/data/page.tsx:128-138 — Delete-account copy enumerates 13 tables by name.** Power-users may appreciate this; the median user does not understand `alterego_settings, agent_facts, agent_memory_episodes, …`. Honest but a wall.
  - *Fix:* Lead with the plain-English summary ("everything we hold about your tenant — preferences, agent memory, connected accounts, bills, notes, voice samples, billing records") and either drop the SQL-style enumeration or hide it behind a `<details>` collapsed by default.

- **F-Proof-03 · Major · apps/web/app/security/page.tsx:182-184 — Security page promises mandatory TOTP + IP allowlist for the admin surface.** TOTP is in the schema (0005_2fa.sql) but the admin app does NOT enforce admin-auth yet (see `apps/admin/app/(authed)/compliance/actions.ts:18-20` — "admin sign-in is still a placeholder; this page renders behind the (authed) layout but the layout itself does not yet verify a session"). The trust page claim is currently aspirational, not live.
  - *Fix:* Either ship admin-auth before publishing this page, OR rewrite line as "Mandatory TOTP plus IP allowlist (Phase 1.0-B — admin sign-in lands before public launch)."

- **F-Proof-04 · Major · apps/web/app/security/page.tsx:201-205 — "A daily checkpoint signs the chain head. Posting that checkpoint to a verifiable timestamp service via OpenTimestamps is on the roadmap for Phase 1.7."** Honest about OpenTimestamps timing — good. But "A daily checkpoint signs the chain head" claims a control that is NOT yet shipped in 0003_audit_chain.sql (the chain hash is computed per-row, but I see no daily checkpoint job in the worker or cron table).
  - *Fix:* Either ship the daily checkpoint job before this page goes live OR change to "We will sign a daily chain-head checkpoint — Phase 1.0-D (Vanta audit prep)."

- **F-Proof-05 · Major · apps/admin/app/(authed)/compliance/page.tsx:124-129 — Admin destructive-action copy is too casual.** "Both actions require the AUTONOMUX_ADMIN_OP_TOKEN environment value as a step-up gate." Operators reading this in 6 months won't remember that this is a placeholder for proper TOTP step-up.
  - *Fix:* Add bold "Placeholder until Phase 1.0-B admin TOTP ships — see actions.ts." Make the temporary nature explicit, not buried in a code comment.

- **F-Proof-06 · Minor · apps/web/app/system-card/page.tsx:57-77 — "Routing is configurable. The default is via OpenRouter, which acts as a transit proxy and billing aggregator; setting LLM_PROVIDER=anthropic switches to the direct Anthropic API."** Code-name leak — `LLM_PROVIDER=anthropic` is an internal env-var. Users don't set it; we do. Trust pages should describe outcomes, not env-vars.
  - *Fix:* "We can route either through OpenRouter (the default — a billing aggregator) or directly to Anthropic; both paths carry the same Zero-Data-Retention contract."

- **F-Proof-07 · Minor · apps/web/app/legal/dmca/page.tsx:69-75 — Designated agent block says "Postal address — to be confirmed before public launch" and "Phone — to be confirmed before public launch."** Honest, but a §512(c)(2) takedown notice MUST list a real postal address + phone or the safe-harbour is voided.
  - *Fix:* Either block this page from production until address + phone are resolved, OR add a `<noindex>` meta + a top-of-page banner "Not yet effective — DMCA agent registration pending. Send notices via email until this page is dated."

- **F-Proof-08 · Polish · apps/web/app/security/page.tsx:246-249 — security@autonomux.app — "The address is provisioned; DNS and the PGP key are being finalised before public launch."** Same as F-Proof-07 pattern — honest but reads "not actually live". Fine to keep for now, but consider gating the entire security page behind a launch-readiness boolean.

- **F-Proof-09 · Polish · apps/web/app/accessibility/page.tsx:88-91 — "Every PR runs axe-core in CI; quarterly we engage a third-party manual audit against WCAG 2.2 AA."** Axe-core in CI is verifiable — but no CI workflow file is in scope to confirm. If the workflow doesn't yet exist, this is over-promising.
  - *Fix:* (Optional verification path.) If verified shipping, OK as-is. If not, change to "We are wiring axe-core into CI before public launch."

## Score
- 0 Blocker
- 1 Critical × 18 = 18
- 4 Major × 7 = 28
- 2 Minor × 2 = 4
- 2 Polish × 0.5 = 1
- **Total deductions: 51** → score 49/100 — bordering Critical because three trust-page claims describe controls not yet shipped.

Summary: The trust pages are honest in voice but several claims describe controls that have not yet shipped (admin TOTP step-up, daily checkpoint signing, axe-core in CI, DMCA agent registration). Each is individually a "before public launch" promise — but the page is published NOW, so the claim is technically inaccurate today. Tighten with "before public launch" qualifier on each unshipped claim, or hold the page behind a launch-gate boolean. The user-facing `settings/data` page needs warmer/clearer copy on what happens after submit. Admin Compliance page should make the AUTONOMUX_ADMIN_OP_TOKEN placeholder explicit on the surface.
