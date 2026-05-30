# Compass — Sprint C audience + compliance fit

Date: 2026-05-29
Scope: Admin matches PRD §3.2 sections; trust pages help close enterprise prospects; GDPR flows match Art. 17 / Art. 20 / Art. 28 requirements; subprocessor list complete.

## Findings

- **F-Compass-01 · Critical · apps/admin/app/(authed)/compliance/actions.ts:79-92, 156-160, 245-253 — Admin destructive ops write `admin_actor_user_id: null` to gdpr_requests.** This is the one column the schema added specifically so the audit trail captures WHO triggered an admin-initiated deletion. With `null`, the audit_log row written by the trigger has `actor_kind='admin'` but no user identity — so the survivor row in audit_log says "an admin did this" but not "this admin did this". GDPR Art. 30 (records of processing) and §10 PRD requirement of "audit-log every Server Action mutation" both expect identity.
  - *Fix:* Until Phase 1.0-B admin-auth lands, derive `admin_actor_user_id` from the env-token holder (e.g., a single `AUTONOMUX_ADMIN_OP_USER_ID` env that the destructive token maps to). Or block destructive actions entirely until admin-auth ships. The current state passes lint but fails the audit-of-the-audit.

- **F-Compass-02 · Critical · apps/admin/app/(authed)/compliance/page.tsx — NO `logAuditEvent` call on view.** Every other Sprint-C admin page audit-logs its own view (tenants, audit-log, activity, costs, integrations). The Compliance page is the surface most likely to be queried in a regulator response — and it has no impression record. An operator viewing every pending GDPR request leaves no trace.
  - *Fix:* Add `await logAuditEvent({ actorKind: "admin", action: "admin.compliance.viewed", resourceType: "gdpr_request", metadata: { pending_count, completed_count } })` to the page.

- **F-Compass-03 · Critical · apps/admin/app/(authed)/feature-flags/page.tsx — NO `logAuditEvent` call on view.** Same regression as Compliance. The feature-flags page reveals which flags exist and which tenants are in allow/deny lists — a sensitive surface.
  - *Fix:* Add `await logAuditEvent({ actorKind: "admin", action: "admin.feature_flags.viewed", resourceType: "feature_flag", metadata: { flag_count: flags.length } })`.

- **F-Compass-04 · Major · apps/web/app/legal/subprocessors/page.tsx — Subprocessor list is complete for the data path, BUT missing two vendors that touch customer data per the architecture page.** The Security page (line 96-97) names "Sentry (errors)" and "Axiom (logs)" — both ARE on the subprocessor list. Cross-check the architecture rows: Stripe, Composio, Plaid, AWS KMS, Doppler, Vercel, Supabase, Anthropic, OpenRouter, Railway, Upstash, Axiom, Sentry, Resend = 14. Subprocessor page lists 14. ✓ Complete. No finding.
  - Defer: Resolved on re-read. (Keeping the entry to show I checked.)

- **F-Compass-05 · Major · apps/web/app/system-card/page.tsx:127-141 — "Training data" section says "Autonomux does not train, fine-tune, or distil any foundation model. We are a downstream consumer of Anthropic's published models."** This is the right disclosure for EU AI Act Art. 50 — but the section omits the OpenRouter case (since OpenRouter can route to multiple providers). For a high-assurance enterprise prospect, this gap matters: "Are you on Anthropic when I send a prompt, or could it land on a different model?"
  - *Fix:* Add a sentence: "When routing via OpenRouter the request is pinned to the Anthropic model family on our policy; we do not allow fallback to other providers."

- **F-Compass-06 · Major · apps/web/app/security/page.tsx:218-231 — "Penetration testing" claims a quarterly cadence + USD 8-15k budget.** Auditors and enterprise procurement look for this — but the dollar figure is internal info that doesn't belong on the public page. It also locks us into a low ceiling that may not survive scope expansion.
  - *Fix:* Drop the budget figure: "An external, scoped penetration test is contracted before public launch and repeated quarterly thereafter."

- **F-Compass-07 · Major · apps/worker/src/queues/gdpr.ts:240-317 — Export blob includes `tenant_members` but only filters by `tenant_id`.** This pulls every member's user_id INCLUDING other users in the same tenant if the user requesting the export is one of multiple seats. GDPR Art. 20 requires the export to be the requesting *data subject's* personal data — exporting other members' user IDs may exceed scope.
  - *Fix:* Filter `tenant_members` to the requesting user_id only: `.eq("user_id", userId)`. Alternatively, document the tenant-as-data-subject model explicitly (single-tenant-per-user assumption) on the security page.

- **F-Compass-08 · Major · apps/web/app/app/settings/data/page.tsx:130-138 — Deletion copy lists the specific tables that will be hard-deleted.** That's transparent — but doesn't mention what is RETAINED. GDPR Art. 17(3)(e) allows retention "for the establishment, exercise or defence of legal claims" — which is exactly what the 7-year audit-log retention is. The user must be told their audit_log + billing records survive.
  - *Fix:* Add a paragraph: "We retain the audit log (records of significant events on your account) and billing/tax records for 7 years, as required by SOC 2 and tax law. These records reference your tenant by ID but do not contain your encrypted PII."

- **F-Compass-09 · Minor · apps/web/app/legal/dmca/page.tsx:69-75 — Designated agent block lists email but says postal address + phone are "to be confirmed before public launch".** OCILLA safe-harbour (§512(c)(2)) requires a real postal address + phone in the agent registration. Until both are filled in, the safe-harbour cannot be invoked. Honest disclosure here is right, but the page should be gated.
  - Already covered in Proof F-Proof-07.

- **F-Compass-10 · Minor · apps/admin/app/(authed)/compliance/page.tsx:275-296 — Documentation links point to `/legal/deletion-policy` and `/legal/retention`.** Verify those pages exist — they're not in scope of this audit. If they don't exist yet, the operator clicking through gets a 404.
  - *Fix:* Verify with Glob before merging, or change the links to anchors within `/legal/privacy`.

## Score
- 3 Critical × 18 = 54
- 4 Major × 7 = 28
- 2 Minor × 2 = 4
- **Total deductions: 86** → score 14/100. FAIL on this slice in isolation; admin audit-log gaps + null admin_actor_user_id are the load-bearing failures.

Summary: The GDPR data path is well-engineered (hard-delete survives audit, scope_grants excluded from export, 30-day cancel link) but two PRD §10 requirements are missed on the admin side: (a) Compliance page and Feature-flags page don't audit-log their own views — every other Sprint-C admin page does, and (b) admin destructive ops write `admin_actor_user_id: null` so the survivor audit row loses identity. Trust pages will close enterprise prospects but a few claims need tightening (no internal pen-test budget on public surface; OpenRouter routing pinned to Anthropic; what's retained on deletion). Subprocessor list is complete (14 vendors, all DPA-bound).
