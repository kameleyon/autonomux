# autonomux — Web + Native iOS · Production Roadmap

> Studio-Zero multi-agent panel (BigBrain + 9 layer-lead pairs, incl. Mobile/iOS), audited by Jury.
> 16 agents · ~1.36M tokens · ~40 min. Supersedes the earlier web-only roadmap.

## Jury Verdict: **FAIL**

**Scorecard:** Optic UX 2/5, Compass Audience 3/5, Proof Compliance 2/5, Shield Security 2/5. Composite FAIL: 9 verified Blockers (iframe home, cross-tenant SSE leak, no security headers, unhardened Supabase auth, no CI, missing persona, inverted legal gate, deferred EU/CA AI disclosure, unspecced advice banner); AI-feature eval and advice-disclosure gates unmet.

### Rationale

This roadmap does not ship in its current state, on either client. I verified the reviewers' most severe claims directly against the code and every one held up: the signed-in /app home still renders a full-viewport iframe over the old prototype (app/app/page.tsx line 28) with the built AppShell stripped from the layout (app/app/layout.tsx returns raw children); the orchestrator's progressBuffer is module-scoped (runtime.ts line 808) and drained per-request via .shift() (391-392), a live cross-tenant financial-data leak once two tenants run Treasurer concurrently; /api/chat/stream caps userMessage at 200,000 chars (route.ts line 66) with no maxDuration and no per-user rate limit; next.config.ts has no security headers (no CSP/HSTS/frame-ancestors); supabase/config.toml is unhardened (confirmations off, 6-char passwords, TOTP off, db open to 0.0.0.0/0); and there is no .github/workflows directory, so the CI gates the roadmap relies on to enforce these fixes do not exist. It is a regulated money product for a named-but-undefined audience: no persona artifact exists anywhere (Compass Rule 1 halts the audit), and Plaid Production submission is listed as a Phase 0 exit criterion while legal advice sign-off is deferred as an open question, inverted sequencing that risks Plaid and App Store rejection (Guideline 3.2.1, EU AI Act). As an AI feature it cannot PASS without an eval posture plus advice-disclosure sign-off: the Treasurer golden set is an empty scaffold, no AI-generated disclosure renders at point of interaction (Art. 50(1) and CA SB 942 apply at Phase 1, not Phase 2), and agent_facts injection has no sanitization despite the roadmap claiming one. The roadmap is strategically sound and honest about most of these gaps in its own risk table, but a plan that documents nine Blockers as work-to-be-done is a FAIL with a credible remediation path: this is Phase 0 scope, not a shippable artifact. Fix the punch list, run CI green, and bring it back for re-audit. Full Major/Minor/Polish detail lives in the four reviewer reports; the punch list below carries every Blocker and Critical individually plus consolidated lower-severity groups.

### Top 3 findings (verified against code)

1. Sign-in lands on a full-screen iframe of the old HTML prototype (verified app/app/page.tsx line 28); the real React shell that was built is disconnected from the layout, with no tenant-aware navigation and no escape hatch. Nothing external can ship on top of it.

2. Two customers can see each other's bank data: the orchestrator holds its progress buffer as one shared server-wide variable, not per-request (verified runtime.ts line 808, drained 391-392). The instant two people use the finance assistant at the same time, one person's account balances and transaction summaries can stream onto the other's screen. This is the single most serious defect in the set.

3. The product is built for a customer nobody has met, and legal clearance to give money advice is scheduled AFTER submitting to regulators. No persona document exists, and Plaid Production submission is a Phase 0 exit criterion while 'is this regulated advice?' stays an open question. That ordering gets the app rejected by Plaid, Apple, or both. Legal sign-off must gate submission, not trail it.

## Punch List (34 items)

### Blocker (9)

- **[Blocker] Shield and Backend lead** — Move progressBuffer into the per-request run() closure (runtime.ts line 808, drained 391-392); add a two-tenant concurrency test as a CI gate before any Plaid or Treasurer code. Cross-tenant financial-data leak, GDPR Art. 5(1)(f). _(due: Phase 0 Wk1 Day1-2)_
- **[Blocker] Frontend lead** — Kill the iframe home (app/app/page.tsx line 28); wire the built AppShell into app/app/layout.tsx with userEmail from session so every signed-in route sits in the RLS-aware shell. _(due: Phase 0 Wk2)_
- **[Blocker] DevOps lead** — Add .github/workflows/ci.yml: typecheck, lint, gitleaks, npm audit high, rls-proof and progressBuffer tests as required checks, branch protection on main, Semgrep. Without this no other Blocker fix is enforceable. _(due: Phase 0 Wk1)_
- **[Blocker] Shield and Frontend lead** — Add security headers to next.config.ts (CSP frame-ancestors none and frame-src cdn.plaid.com, HSTS preload, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP); gate CI on securityheaders grade A. _(due: Phase 0 Wk4)_
- **[Blocker] Shield** — Harden Supabase auth on remote via Management API (12-char plus complexity passwords, email confirmations on, TOTP on, Turnstile, restrict cidrs from 0.0.0.0/0) plus a config-drift CI check, before Plaid Production. _(due: Phase 0 Wk3)_
- **[Blocker] Flow and Scout** — Produce personas/autonomux-freelancer.md from 5-plus Scout interviews (JTBD, current solution, verbatim frustrations, trigger, device-of-first-use, literacy band, anti-persona). Blocks Phase 0 exit. _(due: Phase 0 Wk2)_
- **[Blocker] Comply** — Invert legal sequencing: a written US-state and EU advice opinion (Treasurer output informational, not regulated) must gate Plaid Production and the App Store checklist (Guidelines 3.2.1 and 5.2.1). _(due: Phase 0 Wk1)_
- **[Blocker] Herald, Comply and Frontend** — Render an AI-interaction disclosure at every AlterEgo/Treasurer session start on both clients and label every Treasurer dollar figure as AI-generated (EU AI Act Art. 50(1) applies at Phase 1, not Phase 2). Add to Phase 1 exit criteria. _(due: Phase 1 launch)_
- **[Blocker] Herald and Comply** — Spec the non-dismissable advice banner (C9): exact string at reading grade 8 or below, placed above the first Treasurer message on web and iOS as a distinct labelled UI block, not appended text. _(due: Before Phase 1 build)_

### Critical (15)

- **[Critical] Oracle and AI lead** — Complete the Treasurer eval golden set (~20 cases: grounding, no-data abstention, temperature-0 consistency, adversarial injection) as a CI gate; 90-plus percent pass, 0 percent no-grounding hallucination. AI cannot PASS without Oracle's eval verdict. _(due: Phase 1, before Treasurer serves real data)_
- **[Critical] Shield and AI lead** — Sanitize agent_facts (readFactsSafely only decrypts and truncates): schema-validate or strip injection patterns, XML-delimit facts, cap value length; adversarial red-team eval 0 percent bypass in CI before Treasurer. OWASP LLM01. _(due: Phase 0)_
- **[Critical] Backend lead** — Add a chat rate limit and per-tenant LLM budget cap on /api/chat/stream plus maxDuration 300 (20/min, 200/hr, usage_meters preflight returning 402, Retry-After on 429); confirm Vercel Pro. _(due: Phase 0 Wk3)_
- **[Critical] Backend lead** — Lower the userMessage cap from 200,000 to about 16,000 in parseBody (route.ts line 66). One-line change. _(due: Phase 0 Wk1)_
- **[Critical] Frontend lead** — Pass onStop to Composer (ChatStream.tsx line 586) so the cancel button renders during streaming. Violates cancel-on-every-streaming-surface. One-line fix. _(due: Phase 0 Wk2)_
- **[Critical] Frontend lead** — Implement sub_agent_progress (ChatStream.tsx line 651 returns msg, a no-op): append event.message to the pending sub-agent card to meet the sub-500ms visible-feedback contract. _(due: Phase 0 Wk2)_
- **[Critical] Frontend lead** — Add chat mobile collapse (media query at 560px to hide ThreadList plus a back affordance); it currently breaks on every iOS Safari and mobile-web viewport. _(due: Phase 0 Wk2)_
- **[Critical] iOS lead and Shield** — Spec and enforce an iOS TOTP challenge (mfa.challengeAndVerify for enrolled users) as a hard CI gate before TestFlight; otherwise it is an auth bypass on financial data. _(due: Before wk8 TestFlight)_
- **[Critical] Backend lead and Shield** — Build the /api/plaid/webhook skeleton: read raw body first, cache JWKS 5 min, verify signature before JSON.parse, 400 on failure; unit test asserting invalid-header returns 400 and never calls JSON.parse as a CI gate. _(due: Phase 0)_
- **[Critical] Canvas and Flow** — Design the Plaid-connect behavioral trust flow (read-only statement before OAuth, branded post-connect confirmation, modest first response); test with 5 freelancers and add a distrust probe to the eval set. _(due: Before Phase 1 UI lock)_
- **[Critical] Comply and Proof** — Fix the nutrition label: Financial Info is processed server-side, not on-device; declare transmission to third-party AI providers under a DPA; confirm the Anthropic DPA. False disclosure risks App Store removal. _(due: Before App Store Connect submission)_
- **[Critical] Comply and Frontend** — Pull CA SB 942 and EU AI Act disclosure to Phase 1; one in-session disclosure can satisfy both; add to Phase 1 exit criteria, Comply-reviewed. _(due: Phase 1 launch)_
- **[Critical] Shield and Data lead** — Write plaid_items service-role-only RLS before any exchange code (encrypted JSONB, FORCE RLS, an anon-returns-zero proof test) plus a Semgrep rule failing CI on user-scoped queries against plaid_items. _(due: Before migration 0016)_
- **[Critical] Frontend lead** — Add an AlterEgo AI-generated model-attribution trust signal to the assistant meta row on every chat turn. _(due: Phase 1)_
- **[Critical] Penny and Strategy** — Run willingness-to-pay research with 20-plus freelancers before locking 29/79 billing; specify a trial or freemium and a slow-month usage pause. PRD-is-canonical is not audience-fit evidence. _(due: Before Phase 1 billing)_

### Major (7)

- **[Major] Comply** — Confirm the GDPR legal basis (contract plus legitimate interest versus consent) in Phase 0 Wk1; consent, privacy, and deletion copy all depend on it. _(due: Phase 0 Wk1)_
- **[Major] iOS lead and Shield** — Ship iOS Keychain session storage (AfterFirstUnlockThisDeviceOnly), TLS pinning, NSFileProtectionComplete, and PrivacyInfo.xcprivacy at iOS project creation; add a security checklist to Phase 0 sign-off before wk8 TestFlight. _(due: At iOS project creation)_
- **[Major] Backend lead and Shield** — Single-source the SSE event vocabulary in packages/api-types and delete the dual-spelling shim (ChatStream.tsx 611-620) before iOS Codable transcription. Extend the GDPR deletion cascade to call plaid.itemRemove per item before finance deletes; document a deletion-spec plus test; review before migration 0016. _(due: Before Phase 1 iOS SSEClient and migration 0016)_
- **[Major] Frontend and Canvas** — Remove the slash-for-commands Composer hint (line 406); hide or disable the Mailroom Approve/Dismiss noop buttons (SubAgentCard.tsx 16-20); add Treasurer empty states (finance Plaid-connect CTA, zero-accounts card, EMPTY_CHIPS chip at line 1092). _(due: Phase 1)_
- **[Major] Comply and Strategy** — Give tax set-aside (25-30 percent, IRS Pub 505) its own legal opinion, disclaimer, and mandatory consult-a-tax-professional CTA before Phase 2. Define launch geography before App Store submission (US-only geo-restrict in ASC, or add UK, CA, AU to legal scope). _(due: Before Phase 2 and App Store submission)_
- **[Major] Herald, Comply and Data lead** — Spec account-deletion copy (what is deleted, what is retained for 7 years and why, Plaid disconnect, irreversibility; grade 8; web and iOS consistent). Declare episodic-memory AI inferences as a named data category in the nutrition label and privacy policy with a clear-memory control. _(due: Phase 1 and before nutrition-label filing)_
- **[Major] Flow, Strategy and Canvas** — Reframe the North Star KPI around episodic value (grounded answer plus month-2 retention plus trigger proximity) via a 4-week diary study. Pull a minimal irregular-income runway estimate into Phase 1 or have Treasurer acknowledge income irregularity, adding cover-rent-next-month to the eval set. Produce mobile-web specs for the five finance surfaces at 375 and 390px. _(due: Before Phase 1 build and KPI lock)_

### Minor (2)

- **[Minor] Frontend, Herald, Canvas and Flow** — Surface the real model from final_usage.model instead of hardcoded Sonnet 4.6 (threadId page line 230); remove the /app/chat most-recent auto-redirect (194-196) and render ThreadList plus an invitation card; validate brand voice and palette tone with freelancers on stress-case Treasurer lines; spec or hide the greyed-out locked sub-agent treatment. _(due: Before Phase 1 launch)_
- **[Minor] Comply and Shield** — Correct the App Store citation from 3.1.1 to 3.2.1 plus 5.2.1 (section 5.3 and C9); produce an ASVS Level 2 mapping for CASA Tier 2 and remove or IP-restrict the x-mw-degraded header that leaks crash reasons; feature-flag passkey enrollment off until autonomux.io is the canonical Vercel domain; assert Vercel-injected X-Forwarded-For in extractClientIp. _(due: Before Phase 1 exit)_

### Polish (1)

- **[Polish] Frontend, Herald, Comply and Backend** — Enlarge ImportanceDots to 10px with a numeric 4-of-5 label (WCAG 1.4.1) and an iOS SF Symbol; write deletion and offboarding copy (cryptographic erasure plus 7-year hold, export-first, grade 10); lock down /api/telemetry (requireAuth, api bucket, strict schema, reject extra fields); state AlterEgo is an AI assistant, not a human financial advisor, on the first screen and in the App Store description (Guideline 2.3.7). _(due: Phase 1 and before App Store submission)_

---

## Executive Summary

autonomux is materially ahead of a typical solo-founder build: the shared Supabase + orchestrator backend is production-grade (multi-tenant RLS with JWT tenant_id injection, libsodium/KMS envelope encryption, Merkle-chained audit log, a pluggable SubAgentRegistry, a streaming AlterEgoRuntime with idempotency/cancellation, pgvector episodic memory), and BOTH clients already exist as real code sharing one backend — a working web SSE chat surface (Next.js 15) and a clean SwiftUI iOS foundation (supabase-swift auth, brand-exact Theme.swift, XcodeGen). All seven layer leads converge on the same verdict: the architecture is right; the MVP hero (Plaid finance + Treasurer) is 0% built on every layer; and a small set of Blockers must be closed before any parallel feature race begins. I verified the load-bearing claims against the repo: there is NO .github/ (zero CI), the /app home is still a full-viewport iframe (page.tsx:28), progressBuffer is module-level (runtime.ts:808 — a cross-tenant SSE leak under concurrency), Config.swift ships a REPLACE_WITH_ANON_KEY placeholder and a hardcoded prod Supabase URL, only mailroom+scheduler sub-agents exist (no treasurer), and migrations stop at 0015 (no finance schema). The plan is five phases. Phase 0 (Foundation, ~4 wks, both clients BLOCKED on it) closes the nine Jury Blockers — fix progressBuffer, ship web+macOS CI with branch protection, kill the iframe with a native React AppShell, harden Supabase auth config, add security headers, bundle iOS fonts + xcconfig secret injection + Keychain session storage + TOTP parity, write migration 0016 finance schema, lock the FINANCIAL_ADVICE contract, and submit the Plaid Production application (gated on autonomux.io resolving to Vercel). Phase 1 (MVP read/advise/notify, ~wks 5-16, web+iOS in parallel) delivers Plaid Link on both clients over ONE server-side link-token/exchange/webhook surface, a read-only Treasurer sub-agent, Treasurer/Finance UI on both platforms with per-figure provenance stamps and non-dismissable advice disclosure, APNs + web-push bill notifications, Stripe $29/$79 billing with usage-meter quotas, and a promptfoo Treasurer eval gate; iOS goes internal TestFlight ~wk 8, external ~wk 12, App Store submission ~wk 14, approval ~wks 16-18 (allow extended review for a financial-data app). Phase 2 (Intelligence, ~wks 17-28) adds cash-flow forecasting for irregular income (the killer feature), auto-categorization, budgets/envelopes, goal tracking, tax set-aside, net-worth, what-if, proactive briefings. Phase 3 (gated money-movement) is regulatory-gated and cannot start without a written legal opinion (MTL/BaaS) plus App Store re-review. Phase 4 is breadth (more sub-agents, multi-tenant, widgets, voice). Hardest external constraints: iOS compiles only on a Mac (macOS CI is the critical enabler), Plaid Production review (~1-4 wks), Apple Developer enrollment + financial-app review scrutiny, and margin discipline at the $29 tier (bound LLM spend via usage_meters + Haiku tiering + prompt caching). Realistic parallel target: web public beta on Vercel ~wk 12, simultaneous web+iOS public launch ~wk 18. RECOMMEND to Jo: settle the seven cross-cutting open questions before Phase 0 dispatch (Apple Developer enrollment status, Plaid env/scope incl. business-account decision, Vercel Pro, Mac availability, macOS CI choice, embedding provider, financial-advice legal sign-off), because each gates a Phase 0 or Phase 1 dependency. Per the charter audit gate, no phase closes without a Jury re-audit of that phase's Blockers/Criticals returning PASS.

---

# autonomux — Master Production Roadmap (Web + Native iOS, Shared Backend) — REV 2 (Jury punch-list resolved)

**Director:** BigBrain (Studio Zero) · **Owner:** Jo (solo founder) · **Brand:** AlterEgo ("second self")
**Date:** 2026-07-02 · **Revision:** 2 — resolves all 9 Blockers + 15 Criticals from the FAIL verdict; folds in every Major and the cheap Minor/Polish items.

> **Progress update (2026-07-05 · Jury re-audit: PASS).** All Phase-0 blockers that can be closed without external inputs are <span style="color:teal">**green**</span>: B1 (SSE leak), B3 (CI + Semgrep + **branch protection** on `main`), B4 (security headers), B5 (**Supabase remote auth hardened, applied live**), B8-web (AI disclosure + financial guardrail), plus criticals CR2/CR4/CR5/CR6. B2 superseded by the prototype-design decision. B6 (persona) and B7 (legal opinion) now have **drafts on file** — B6 needs 5+ real freelancer interviews to finalize; B7 needs a **licensed attorney's signature** before it gates Plaid Production / App Store. B9 + the iOS/Treasurer half of B8 wait until those surfaces are built.

> **Directive.** Build BOTH clients IN PARALLEL on ONE shared backend: a responsive Next.js 15 web app (Vercel) and a native Swift/SwiftUI iOS app (TestFlight → App Store), over the same Supabase project, RLS, and orchestrator. MVP hero on both = **personal finance via Plaid (READ-ONLY) + knowledgeable chat**. Money movement is a later, regulated, gated phase.
>
> **This revision** was written against the live tree. Every cited defect was confirmed at its file:line before a fix was scheduled.

---

## 0-A. Blocker / Critical Resolution Ledger (the FAIL punch list, closing)

Every Blocker and Critical is mapped to an owner, the exact code location, the CI gate that makes the fix *enforceable*, and a deadline. A Jury re-audit checks this ledger row by row. Nothing in a later phase starts until its upstream ledger rows are green.

**Status legend:** <span style="color:teal">**✅ DONE**</span> (Jury-approved) · ⏳ IN PROGRESS · ⛔ BLOCKED (needs user/lawyer) · ⏸️ DEFERRED (Phase 1 / not-yet-built).

**Blocker snapshot (2026-07-05, final Jury: PASS WITH FIXES → fix applied):** B1 <span style="color:teal">✅</span> · B2 <span style="color:teal">✅ superseded</span> · B3 <span style="color:teal">✅</span> · B4 <span style="color:teal">✅</span> · B5 <span style="color:teal">✅ done</span> (hardened + drift-check) · B6 <span style="color:teal">✅ draft v1</span> (needs interviews) · B7 <span style="color:teal">✅ draft</span> (needs counsel signature) · B8 <span style="color:teal">✅ (web)</span> · B9 ⏸️ (Treasurer unbuilt). **Every code/config-fixable blocker is closed;** the only OPEN work is inherently external (freelancer interviews, attorney signature) or awaits unbuilt surfaces (Treasurer/iOS).

### Blockers (all in Phase 0 unless a disclosure that legally attaches at Phase 1)

| # | Status | Item (file:line) | Fix | Enforcing CI gate | Owner | Deadline |
|---|---|---|---|---|---|---|
| B1 | <span style="color:teal">✅ DONE</span> | Cross-tenant SSE leak — module-scoped `progressBuffer` | **[x] Fixed.** Buffer moved into the per-tool-use loop (`runtime.ts:328`), captured by the onProgress closure, drained loop-local. | `runtime.test.ts` concurrency test asserts tenant B never sees tenant A's progress — **passing**. | Shield + Backend lead | ~~Wk1~~ **done** |
| B2 | <span style="color:teal">✅ SUPERSEDED</span> | iframe home + raw `layout.tsx` | **Superseded by product decision:** `/app` serves the Claude Design prototype via a **same-origin, auth-gated** iframe (`requireAuth`); framing scoped to `frame-ancestors 'self'`. Native AppShell NOT pursued (design mandate). | Auth enforced server-side before the prototype is served. | Frontend lead | **N/A (decision)** |
| B3 | <span style="color:teal">✅ DONE</span> | CI / Semgrep | **[x] Done.** `ci.yml`: typecheck, lint, test, gitleaks, npm-audit, **Semgrep SAST** (`static-analysis` job, gating). **[x] Branch protection** on `main` enabled (require PR + the 3 CI checks strict; force-push/deletion blocked; admin safety-valve on). | Semgrep gates on findings; branch protection requires green CI to merge. | DevOps lead | ~~Wk1~~ **done** |
| B4 | <span style="color:teal">✅ DONE</span> | Security headers | **[x] Done.** `next.config.ts` headers(): HSTS preload, nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy, Permissions-Policy, COOP, CSP (`frame-ancestors 'self'`, `frame-src 'self' cdn.plaid.com`, `object-src 'none'`, `base-uri 'self'`). Full `script-src`/`connect-src` deferred to report-only→enforce (Phase 1). | Grade-A gate deferred to Phase 1 CSP tightening. | Shield + Frontend lead | ~~Wk4~~ **done** |
| B5 | <span style="color:teal">✅ DONE</span> | Supabase auth not hardened on REMOTE | **[x] Applied live via Management API (2026-07-05):** 12-char passwords + complexity (lower/upper/digit), `mailer_autoconfirm=false` (email confirmation required), TOTP enroll+verify on, HIBP leaked-password protection on. **CIDR lockdown intentionally skipped** (Vercel serverless has no fixed egress IPs — would break the app). **[x] Config-drift CI check** added (`scripts/check-supabase-auth-drift.mjs` + `auth-config-drift` job) — GETs the live auth config and fails on any drift from the baseline. | **Config-drift CI job live** (enforces once `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` repo secrets are set; skips gracefully until then). | Shield | ~~Wk3~~ **done** |
| B6 | <span style="color:teal">✅ DRAFT v1</span> | No freelancer persona | **[x] `personas/autonomux-freelancer.md` written (provisional v1, synthesized).** Covers JTBD, current solution, trigger, device-of-first-use, financial-literacy band, anti-persona, design implications. **Must be validated + revised against 5+ real Scout interviews before Phase 1 UI lock.** | Phase 0 exit: file exists + Flow sign-off (pending interview validation). | Flow + Scout | **draft done — interviews pending** |
| B7 | <span style="color:teal">✅ DRAFT</span> | Legal sequencing inverted | **[x] `docs/legal/treasurer-advice-opinion-DRAFT.md` written** — full question, US federal/state + EU framework, product facts, and the load-bearing conditions, structured for counsel. **NOT a signed opinion:** a licensed attorney must review, correct, and sign it before it gates Plaid Production + App Store 3.2.1/5.2.1. | Phase 0 exit + Plaid checklist require the SIGNED opinion. | Comply | **draft done — counsel signature pending** |
| B8 | <span style="color:teal">✅ DONE (web)</span> | AI-interaction disclosure at session start; Treasurer dollar labels | **[x] Web done (Jury-approved).** Disclosure at chat session start (`components.jsx` empty state) + **financial-advice guardrail** in the system prompt. ⏸️ iOS disclosure + Treasurer figure labels deferred until iOS/Treasurer are built. | Phase 1 exit: golden set asserts every Treasurer figure carries the AI-generated tag (when built). | Herald + Comply + Frontend | **Phase 1 (iOS/Treasurer part)** |
| B9 | ⏸️ DEFERRED | C9 advice banner under-specified | Spec the **non-dismissable advice banner** above the first Treasurer message. **Treasurer not built yet** — implement when it is. | Design sign-off + Phase 1 exit check. | Herald + Comply | **Before Phase 1 build** |

### Criticals

| # | Item (file:line) | Fix | Enforcing CI gate | Owner | Deadline |
|---|---|---|---|---|---|
| CR1 | Treasurer eval golden set | Complete **~20 cases**: grounding (tool-call before any figure), no-data abstention, temperature-0 consistency, adversarial injection. **AI cannot PASS without Oracle's eval verdict.** | promptfoo CI gate: **≥90% pass, 0% no-grounding hallucination**, before Treasurer serves real data. | Oracle + AI lead | Phase 1, before real data |
| CR2 | <span style="color:teal">✅ DONE</span> `agent_facts` injection (`readFactsSafely` only decrypts + truncates) | **[x] Done.** Facts now XML-fenced (`<user_facts>`), per-line cap (240), injection-pattern stripping, and a prompt instruction that fenced content is DATA never instructions (`system-prompt.ts`). Full 0%-bypass eval still owed pre-Treasurer. | Adversarial red-team eval: **0% bypass** in CI, before Treasurer. | Shield + AI lead | Phase 0 (**hardening done; eval pending**) |
| CR3 | No chat rate-limit / budget cap | On `/api/chat/stream`: **20/min, 200/hr** per user; **per-tenant monthly LLM budget cap** via `usage_meters` preflight returning **402**; **429 + Retry-After**; `export const maxDuration = 300`. Confirm **Vercel Pro**. | Unit + integration test: preflight over-budget → 402; over-rate → 429 with `Retry-After`. | Backend lead | Wk3 |
| CR4 | <span style="color:teal">✅ DONE</span> userMessage cap too high (`route.ts:66`) | **[x] Done.** `parseBody` rejects `userMessage.length > 16_000` (`route.ts:68`). | Test asserts a >16k body is rejected. | Backend lead | ~~Wk1~~ **done** |
| CR5 | <span style="color:teal">✅ DONE</span> Cancel button not wired | **[x] Done.** Abort wired end-to-end (composer stop → `AbortController` → `runStream` signal → run marked `cancelled`); prototype stop button aborts the SSE fetch. | UI test: stop button visible + abort fires during streaming. | Frontend lead | ~~Wk2~~ **done** |
| CR6 | <span style="color:teal">✅ DONE</span> `sub_agent_progress` no-op | **[x] Done.** Progress events drive the live "Consulting Oracle / Searching / Writing" working bar in the prototype UI (tenant-isolated via the loop-local buffer). | UI test: a progress event mutates the pending card within budget. | Frontend lead | ~~Wk2~~ **done** |
| CR7 | Chat breaks on mobile | Add media query at **560px** hiding `ThreadList` + a **back affordance**. Currently breaks every iOS Safari / mobile-web viewport. | Responsive snapshot test at 375/390/560px. | Frontend lead | Wk2 |
| CR8 | iOS TOTP challenge missing | Spec + enforce `mfa.challengeAndVerify` for enrolled users. Without it, an iOS session is an **auth bypass on financial data**. | **Hard CI gate before TestFlight**: XCTest asserts enrolled user is challenged. | iOS lead + Shield | Before Wk8 TestFlight |
| CR9 | Plaid webhook skeleton | `/api/plaid/webhook`: read **raw body FIRST**, cache JWKS 5 min, **verify signature BEFORE `JSON.parse`**, 400 on failure, idempotency on `plaid_event_id`. | Unit test: invalid header → 400 and **`JSON.parse` is never called**. Required check. | Backend lead + Shield | Phase 0 |
| CR10 | Plaid-connect trust flow | Read-only statement **before** OAuth, branded post-connect confirmation, modest first response. Test with **5 freelancers**; add a **distrust probe** to the eval set. | Eval set includes the distrust probe; UX sign-off before Phase 1 UI lock. | Canvas + Flow | Before Phase 1 UI lock |
| CR11 | Nutrition-label falsehood | Correct it: **Financial Info is processed server-side, NOT on-device**; declare **transmission to a third-party AI provider (Anthropic) under a DPA**; **confirm the Anthropic DPA** is executed. False disclosure risks App Store removal. | Comply + Proof sign-off before App Store Connect submission; DPA on file. | Comply + Proof | Before ASC submission |
| CR12 | CA SB 942 + EU AI Act disclosure timing | Pull **both** to Phase 1; **one in-session disclosure satisfies both**. Add to Phase 1 exit, Comply-reviewed. | Phase 1 exit check. | Comply + Frontend | Phase 1 launch |
| CR13 | `plaid_items` RLS | Write **service-role-only RLS** (encrypted JSONB, `FORCE RLS`, anon-returns-zero proof test) **before any exchange code**; **Semgrep rule** fails CI on any user-scoped query against `plaid_items`. | anon-returns-zero test + Semgrep rule, required checks. | Shield + Data lead | Before migration 0016 |
| CR14 | AlterEgo model-attribution | Add an **AI-generated model-attribution trust signal** to the assistant meta row on **every** chat turn. | UI test asserts the meta row renders the attribution. | Frontend lead | Phase 1 |
| CR15 | Willingness-to-pay unproven | Run WTP research with **20+ freelancers** before locking 29/79; specify a **trial or freemium** and a **slow-month usage pause**. PRD-is-canonical is not audience-fit evidence. | Billing lock is gated on the WTP write-up + Penny/Strategy sign-off. | Penny + Strategy | Before Phase 1 billing |

---

## 0-B. Conflict Resolution Ledger (charter Decision Rubric: Jo's goals → audience → protocols)

Every material disagreement across the seven assessments, resolved once. No re-litigation mid-project (Hard Rule 5).

| # | Conflict | Resolution | Rationale (rubric order) |
|---|----------|-----------|--------------------------|
| C1 | Pricing: old draft $12/$29 vs PRD $29/$79 | **$29/$79 is the working hypothesis, NOT locked. Validate via CR15 (20+ freelancer WTP) before billing ships; specify trial/freemium + slow-month pause.** | Jo's intent seeds it; audience-fit evidence gates the lock (Jury CR15). |
| C2 | iframe home "bridge" vs Blocker | **Blocker (B1/B2). Kill in Phase 0.** | Audience (broken UX, no a11y tree) + protocols (no RLS-aware shell). |
| C3 | `progressBuffer` severity | **Blocker (B1).** Move into `run()` closure + concurrency test, before ANY Plaid work. | Cross-tenant financial leak = GDPR Art. 5(1)(f). |
| C4 | iOS CI: Xcode Cloud vs GitHub macOS runner | **Decide at Phase 0 kickoff.** Default: **Xcode Cloud** (solo-founder friction, no cert-in-GitHub-secrets). `macos-15` is the fallback. | Sustainability + effort/value. |
| C5 | iOS Plaid Link: native SDK vs WKWebView | **Native `plaid-link-ios` (LinkKit) SPM.** No WKWebView. | Audience (UX) + protocols (security). |
| C6 | iOS session storage | **Explicit Keychain (`SecItem`), `AfterFirstUnlockThisDeviceOnly`.** | Protocols (financial-data at-rest). |
| C7 | Treasurer model tiering | **Haiku for extraction/categorization, Sonnet for synthesis/advice**, per-tool `preferredModel`. | Margin at $29 + quality-equivalent-cheaper. |
| C8 | Dark mode timing | **Phase 2**, first-class warm dark tokens. MVP light-only, locked. | Effort/value. |
| C9 | Advice disclosure | **BOTH — and MORE (see B8/B9/CR12).** Non-dismissable **distinct UI block** above the first Treasurer message (grade ≤8) on web+iOS, **AI-interaction disclosure at every session start**, per-figure AI-generated labels, injected prompt disclaimer. **EU AI Act Art. 50 + CA SB 942 attach at Phase 1.** | Protocols (App Store 3.2.1/5.2.1 + EU AI Act + CA SB 942 + advice-opinion). |
| C10 | `--brand-aqua` status token | **Remove. Warm palette only.** Semantic `--status-success`/`--status-warning` warm tokens; stylelint CI blocks aqua. | Brand constraint + iOS parity. |
| C11 | Unused `NSMicrophoneUsageDescription` | **Remove until voice ships** (Apple flags unused strings, 5.1.1). | Protocols (App Store). |
| C12 | Freelancer *business* Plaid accounts | **Open Q → Jo decides BEFORE the Plaid Production application** (locks products requested + onboarding copy). | Audience (ICP), but gates Plaid scope. |
| C13 (new) | GDPR legal basis | **Comply confirms contract + legitimate-interest vs consent in Wk1** (Major). Consent/privacy/deletion copy all depend on it. | Protocols; unblocks copy. |

---

## 1. Shared Architecture & Client-Agnostic API Contract

**One backend, two thin clients.** The iOS app is a native-first client over the *same* Next.js route handlers the web consumes. There are **no iOS-specific backend routes** (already true today — same Supabase project, anon key, RLS, `custom_access_token_hook`).

### 1.1 Layered view

```
        WEB (Next.js 15, Vercel)              iOS (SwiftUI, iOS 16+)
        - React AppShell + AlterEgo home      - TabView: Home / Chat / Finance / Settings
          (userEmail from session,              (RLS-aware, TOTP-challenged)
           RLS-aware, wraps EVERY /app route)
        - ChatStream (SSE via fetch/RSC)      - SSEClient (URLSession.bytes AsyncStream)
        - plaid-react Link                    - plaid-link-ios (LinkKit, native)
        - Web Push (VAPID + SW)               - APNs (UNUserNotificationCenter)
                 \                                   /
                  \------ ONE HTTPS API SURFACE ----/
                          Authorization: Bearer <supabase access_token>
        ┌──────────────────────────────────────────────────────────┐
        │ Next.js Route Handlers (Node runtime) — client-agnostic   │
        │  /api/chat/stream (SSE, rate-limited + budget-capped,     │
        │   maxDuration=300)  /api/plaid/{link-token,exchange,      │
        │  webhook,sync}  /api/push/register  /api/treasurer/*       │
        │  /api/billing/* (Stripe)  /api/auth/totp/*                 │
        └──────────────────────────────────────────────────────────┘
                 │                    │                    │
     @autonomux/orchestrator   Supabase Postgres     Railway workers
     (AlterEgoRuntime — per-    (RLS, tenant_id in    (BullMQ + Upstash Redis:
      request progressBuffer     JWT, audit chain,      plaid-sync, briefings,
      inside run(); episodic     finance schema,        APNs/web-push dispatch)
      memory)                    plaid_items svc-only)  │
                 │                                            │
        @autonomux/llm      @autonomux/cipher        Plaid API (read-only)
        (Haiku/Sonnet,      (KMS envelope)           Resend · Stripe · APNs HTTP/2
         AI-labeled output)                          Anthropic (DPA executed)
```

### 1.2 The contract both clients hold to

- **Auth:** every request sends `Authorization: Bearer <supabase session token>`. Server calls `requireTenantId()` reading the `tenant_id` JWT claim (`0008_access_token_hook`) with a `tenant_members` fallback. iOS decodes the JWT to assert the claim post-signin; if absent, `refreshSession()` once. **iOS additionally enforces the TOTP challenge (`mfa.challengeAndVerify`) for enrolled users (CR8) — non-negotiable, an iOS session has identical RLS reach to a web session.**
- **Streaming:** `/api/chat/stream` emits a **single-sourced SSE event vocabulary** defined in `packages/api-types` — `text_delta`, `sub_agent_start`, `sub_agent_progress`, `sub_agent_result`, `final_usage`, `error`. **The dual-spelling shim (`ChatStream.tsx:611-620`, `delta`/`text`, `sub_agent`/`sub_agent_name`, `invocation_id`/`tool_use_id`) is DELETED once the vocabulary is single-sourced** (Major) — this must happen **before** iOS Codable transcription so iOS decodes one canonical shape. `sub_agent_progress` carries `message` and the client renders it (CR6). Server sends `:keepalive` every 15s; `x-accel-buffering: no` already set.
- **Never on the client:** service-role keys, Plaid access tokens, KMS material. Privileged writes go through the API with the user's bearer token.
- **AI-interaction transparency (B8/CR12):** the disclosure is part of the contract — the chat/Treasurer session open returns/renders a disclosure block; `final_usage.model` drives the **real** model-attribution meta row (CR14) — never a hardcoded string.
- **Typed contracts:** `TreasurerResultPayload` (+ `Forecast`/`NetWorth`) in `packages/api-types/src/treasurer.ts`; web imports it, iOS hand-transcribes Swift `Codable`. `content_type` discriminator on `sub_agent_result` routes cards. OpenAPI codegen = Phase 2.
- **Idempotency:** `agent_runs.request_id` UNIQUE replays rather than re-invoking the LLM (maps to iOS retry-on-reconnect).
- **Pre-sync (latency):** a 15-min `pg_cron` Plaid sync keeps `plaid_transactions` warm so Treasurer reads from Postgres (p95 <200ms), never inline.

---

## 2. Web ↔ iOS Parity Strategy

- **Parity target:** iOS reaches web feature-completeness **within one sprint** of each web milestone.
- **Token parity:** CSS custom properties ↔ `Brand`/`BrandFont` enums share exact hex (`orange #f26b1a`, `red #b81f00`, `wine #7a2010`, `cream #fff8f3`, `ink #1a1410`) and fonts (Cormorant Garamond / Inter / DM Mono). Token-drift audit each sprint + CI stylelint rule (blocks `--brand-aqua`). iOS `Theme.swift` never gets an aqua token.
- **Data-shape parity:** every Treasurer visualization consumes the same API response (web Recharts/sparkline, iOS Swift Charts). One data model.
- **Icon parity:** Lucide ↔ SF Symbols mapped 1:1. Replace iOS single-letter marks.
- **Auth-posture parity:** iOS **must** enforce TOTP for enrolled users (CR8). Shipping without it is an auth bypass.
- **False-affordance gating:** render only wired sub-agents (chat + Treasurer); grey out / "Coming soon" the rest on both clients via the `status` field. **The greyed-out locked sub-agent treatment is explicitly specified (or hidden)** (Minor).
- **Chat mobile-collapse (CR7):** web split-pane collapses `ThreadList` **below 560px** (media query) with a back affordance — required for iPhone Safari and all mobile-web. Mobile-web specs for the **five finance surfaces at 375 and 390px** are produced before Phase 1 build (Major).
- **Disclosure parity:** the non-dismissable advice banner (B9), AI-interaction session-start disclosure (B8), per-figure AI-generated labels, and model-attribution meta row (CR14) render identically on web + iOS.

---

## 3. Security & Encryption Model

**Backend crypto posture is already strong** (XChaCha20-Poly1305 + AWS KMS envelope, per-tenant+purpose DEK, dual-layer AAD, FORCE RLS, hash-chained audit log, encrypted TOTP/OAuth secrets, GDPR cryptographic-erasure). The gaps are the `progressBuffer` leak (B1), iOS-native hardening, the not-yet-built Plaid contract, web response headers (B4), remote auth hardening (B5), and prompt-injection surfaces (CR2).

### 3.1 Financial-data security contract (design + enforce BEFORE any Plaid code)

- **`plaid_items` RLS (CR13):** service-role-only RLS, `FORCE RLS`, encrypted JSONB access token (`purpose='plaid.access_token'`), **anon-returns-zero proof test**, and a **Semgrep rule failing CI on any user-scoped query against `plaid_items`** — all before migration 0016 and before any exchange code. Token encrypted **immediately** on exchange; never logged, returned, or placed in Redis.
- **Plaid webhook (CR9):** `runtime='nodejs'`; read `request.text()` (**raw body**) FIRST; **verify the rotating JWK (JWKS cached ≤5 min) BEFORE `JSON.parse`**; 400 on failure; idempotency on `plaid_event_id` UNIQUE; ack <100ms; enqueue BullMQ. **Unit test: invalid header → 400, `JSON.parse` never called** (required check). Unverified webhooks are a prompt-injection vector.
- **`agent_facts` sanitization (CR2):** `readFactsSafely()` currently only decrypts + truncates. Add schema-validation or injection-pattern stripping, **XML-delimit** facts, cap value length, before facts reach the system prompt. **Red-team eval: 0% bypass in CI, before Treasurer.** OWASP LLM01.
- **PII redaction:** add `institution_name`, `account_mask`, `account_id`, `item_id`, `transaction_name` to `PII_FIELD_NAMES` in `packages/cipher/src/redact.ts`; confirm wired to the Plaid worker's pino logger.
- **Read-only scope lock:** Plaid products = Transactions + Balance + (Liabilities if debt tracking). **Never** `auth`/`transfer`/`payment_initiation` at link time.

### 3.2 iOS native hardening (all at iOS project creation — Major, on Phase 0 sign-off)

- **Keychain session storage** (`AuthLocalStorage`, `kSecClassGenericPassword`, `AfterFirstUnlockThisDeviceOnly`) — replace default UserDefaults.
- **Data-at-rest:** `NSFileProtectionComplete`; Plaid data in `@MainActor` memory only; `applicationDidEnterBackground` clears the cache.
- **TLS pinning:** SHA-256 public-key pinning (Supabase host + autonomux.io) + backup pin.
- **`PrivacyInfo.xcprivacy`** shipped at project creation.
- **Config secrets:** `.xcconfig` (Debug=staging, Release=prod); build-phase fails if a prod URL appears in committed source.
- **TOTP challenge (CR8):** `mfa.challengeAndVerify` for enrolled users — **hard CI gate before TestFlight.**
- A **security checklist is part of Phase 0 sign-off** before Wk8 TestFlight.
- Passkeys via `ASAuthorizationPlatformPublicKeyCredentialProvider` in Phase 2 once `rp_id=autonomux.io` is live. **Passkey enrollment is feature-flagged OFF until autonomux.io is the canonical Vercel domain** (Minor).

### 3.3 Web + Supabase hardening

- **Response headers (B4)** in `next.config.ts` `async headers()`: CSP (`frame-ancestors 'none'`, `frame-src cdn.plaid.com`, `connect-src` incl. `*.supabase.co`+Upstash+`cdn.plaid.com`), HSTS preload, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, **COOP**. **CI gate on securityheaders.com grade A.**
- **Supabase remote hardening (B5)** via Management API: TOTP on, `enable_confirmations=true`, `minimum_password_length=12`+complexity, `secure_password_change=true`, sessions 8h/2h, Turnstile, `allowed_cidrs` off `0.0.0.0/0` → Railway+Vercel egress only, SSL enforce, passkey `rp_id`. **Config-drift CI check** before Plaid Production.
- **Rate limiting + budget cap (CR3)** on `/api/chat/stream`: Upstash sliding window **20/min·200/hr per user** + **per-tenant monthly LLM cap vs `usage_meters` preflight returning 402**; **429 + Retry-After**; `maxDuration=300` (Vercel **Pro**). Lower `userMessage` cap **200_000 → 16_000** (`route.ts:66`, CR4). iOS backs off on 429.
- **`x-mw-degraded` header** removed or IP-restricted (leaks crash reasons); **assert Vercel-injected `X-Forwarded-For` in `extractClientIp`** (Minor).
- **`/api/telemetry` locked down** (`requireAuth`, `api` rate bucket, strict schema, reject extra fields) (Polish).

### 3.4 App Store privacy + compliance surfaces

- **`PrivacyInfo.xcprivacy`** manifest (auto-reject without it): `NSPrivacyAccessedAPITypes` for supabase-swift + Plaid SDK; audit every SPM dep's manifest.
- **Privacy Nutrition Label — CORRECTED (CR11):** **Financial Info** (bank accounts, transactions) is collected and **processed server-side, transmitted to a third-party AI provider (Anthropic) under an executed DPA** — **NOT** on-device, **NOT** "not shared." Declare episodic-memory **AI inferences as a named data category** with a clear-memory control (Major). Confirm the **Anthropic DPA** before ASC submission.
- **Account & data deletion** in iOS Settings (App Store 5.1.1) → same GDPR endpoint; deletion URL in ASC metadata. Deletion copy specified (below).
- **App Store citation corrected: 3.2.1 + 5.2.1** (not 3.1.1), with §5.3 + C9 (Minor). **ASVS Level 2 mapping produced for CASA Tier 2** (Minor). **State on the first screen and in the App Store description that AlterEgo is an AI assistant, not a human financial advisor** (Guideline 2.3.7) (Polish).

---

## 4. Data Model (finance schema — the missing MVP backbone)

Migrations stop at `0015` (confirmed). The **entire finance model is unbuilt.** **CR13 (`plaid_items` service-role RLS + Semgrep guard + anon-returns-zero test) lands before `0016` is applied.**

**`0016_finance_schema.sql`** (all tables: UUID PK, `tenant_id` FK, timestamps, RLS enabled + FORCED, standard 5-policy macro):

- **`plaid_items`** — `item_id`, `encrypted_access_token` JSONB (`purpose='plaid.access_token'`), `institution_id`, `institution_name`, `status`, `cursor`, `last_synced_at`. **Service-role-only RLS (CR13).** 1:N tenant→items (C12 Open Q — decide first).
- **`plaid_accounts`** — `plaid_account_id`, `plaid_item_id` FK, `name`, `type` CHECK, `subtype`, `current_balance_cents`, `available_balance_cents`, `currency`, `mask`, `last_synced_at`.
- **`plaid_transactions`** — `plaid_transaction_id` UNIQUE (idempotency), `plaid_account_id` FK, `amount_cents` (sign-normalized, documented, generated `is_debit`), `currency`, `date`, `authorized_date`, `name`, `merchant_name`, `category_id` FK, `pending`, `plaid_category` JSONB, `category_confidence`. **Range-partition by `date`**; indexes `(tenant_id,date DESC)`, `(plaid_account_id,date DESC)`, `(category_id)`, `(merchant_name) WHERE merchant_name IS NOT NULL`. Upsert `ON CONFLICT (plaid_transaction_id) DO UPDATE`.
- **`transaction_categories`**, **`budgets`**, **`financial_goals`**, **`net_worth_snapshots`**, **`cash_flow_snapshots`** — as specified; Treasurer reads pre-computed snapshots (<500ms).

**`0017`** — `device_push_tokens` (RLS); `plaid_webhook_events` (idempotency). **`0018`** — `treasurer_bills` v2 (`recurrence` weekly/biweekly/monthly/annual/irregular, `next_due_date`, last-day sentinel).

**Migration path fix:** point Supabase at the real dir (`schema_paths` in `config.toml`) or sync into `supabase/migrations/`; add `supabase db diff` drift check to CI.

**Retention/legal-hold:** financial records = 7-year tier (SOX/IRS); Art. 17 deletion has a legal-hold exception inside the window; cryptographic erasure (destroy DEK) is primary. Confirm **Supabase Pro + PITR** (RPO <5min); monthly restore drill.

**GDPR deletion cascade (Major):** single-source the SSE vocabulary + **extend the deletion cascade to call `plaid.itemRemove` per active item BEFORE finance deletes**, then hard-delete finance tables in dependency order, then destroy the Cipher DEK. **Document a deletion-spec + test; review before migration 0016.** Triggerable from iOS Settings.

---

## 5. Cross-Cutting Envelopes

### 5.1 Latency budget

| Path | Target |
|------|--------|
| First `text_delta` visible | <800ms p50 |
| Streaming reveal begins | <1.5s |
| `sub_agent_progress` card after `sub_agent_start` | **<500ms — CR6 makes this real (was a no-op); never a blank 90s wait** |
| Cancel → abort | <200ms (CR5 wires the button) |
| Treasurer read (warm Postgres) | p95 <200ms |
| Treasurer full turn (Plaid cold path) | p95 <8s, backstop 90s (progress-streamed) |
| Plaid `/transactions/sync` first page | ~600ms–2s (always async via BullMQ) |
| APNs delivery after bill trigger | <30s |

`maxDuration=300` on the SSE route (Vercel **Pro**). iOS URLSession: `timeoutIntervalForRequest=30`, resource=360.

### 5.2 Observability

OpenTelemetry wired. Add: client perf mark on first `text_delta` → locked-down `/api/telemetry`; Bull-Board behind admin auth; iOS `os_signpost` on Plaid-connect / SSE TTFB / auth. **SLOs:** chat TTFB p95 <800ms, Plaid sync p95 <30s, auth p99 <2s, iOS SSE establish p95 <500ms.

### 5.3 Compliance

- **Legal sequencing INVERTED (B7):** a **written US-state + EU advice opinion** (Treasurer output informational, not regulated) **gates Plaid Production and the App Store 3.2.1/5.2.1 checklist.** Comply kicks off Wk1; opinion on file before Phase 0 exit.
- **AI transparency at Phase 1, not Phase 2 (B8/CR12):** **EU AI Act Art. 50(1)** and **CA SB 942** both attach when Treasurer/AlterEgo serve real inference at Phase 1. **One in-session AI-interaction disclosure at every session start satisfies both**; every Treasurer dollar figure is labeled AI-generated; the assistant meta row carries model attribution (CR14). All in **Phase 1 exit criteria**, Comply-reviewed.
- **GDPR:** legal basis (contract + legitimate interest vs consent) confirmed Wk1 (Major, C13); finance-inclusive deletion + `plaid.itemRemove`; export covers finance tables.
- **SOC2/CASA:** password ≥12+complexity, KMS policy + CloudTrail + Decrypt-anomaly alarm, network restrictions; **CASA Tier 2** (ASVS L2 mapping) at end of Phase 1.
- **App Store:** 3.2.1/5.2.1 (financial integration), 5.1.1 (deletion), privacy manifest + corrected nutrition label; financial apps get extended review (4–6 wks buffer). **Define launch geography before submission** (US-only geo-restrict in ASC, or add UK/CA/AU to legal scope) (Major).
- **Advice disclosure:** locked `FINANCIAL_ADVICE_REFUSAL`/disclaimer in `system-prompt.ts` + **non-dismissable distinct-UI-block banner grade ≤8 above the first Treasurer message (B9)** on both clients + per-output metadata disclaimer.
- **Tax set-aside (Major):** its own legal opinion, disclaimer, and mandatory **consult-a-tax-professional CTA** before Phase 2 (25–30%, IRS Pub 505).

### 5.4 Testing & evals

- **Web/backend CI (`.github/workflows/ci.yml`, B3):** `tsc --noEmit`, `turbo lint` (stylelint aqua rule), **`gitleaks`**, `npm audit --audit-level=high`, **Semgrep** (incl. the `plaid_items` user-scope rule, CR13), `turbo test` incl. `rls-proof.test.ts`, **`progressBuffer` two-tenant concurrency test (B1)**, **webhook invalid-header→400/no-parse test (CR9)**, **>16k body rejection (CR4)**, **rate-limit/budget 402·429 test (CR3)**, **agent_facts 0%-bypass red-team (CR2)**. Branch protection on `main`: required checks + 1 approval, no direct push.
- **iOS CI:** `xcodegen` + `xcodebuild build`/`test` on `macos-15`; XCTest UI tests for sign-in, **TOTP challenge (CR8, hard gate before TestFlight)**, Plaid connect, chat-send; responsive checks at 375/390/560px feed the web mobile-collapse test (CR7).
- **Treasurer evals (promptfoo, CI gate; CR1):** grounding, no-data abstention, temperature-0 consistency, adversarial injection, **Plaid-connect distrust probe (CR10)**, **cover-rent-next-month / irregular-income (Major)**. Phase 1 exit **≥90% pass, 0% no-grounding hallucination.** **AI cannot PASS without Oracle's verdict.**

### 5.5 Cost envelope (solo founder)

- **Fixed/mo (~100 users):** Supabase Pro $25, Vercel Pro $20, Railway $20–50, Upstash $10–20, Anthropic $50–100, Plaid Prod ~$40, Resend $0–20, CI (macOS) ~$10 → **~$175–265/mo.**
- **Per-user variable:** Plaid ~$0.40/item, LLM ~$2.50 (bounded by CR3 budget cap), infra ~$3–5 → ceiling $8.70 to hold 70% margin at $29 — **pending CR15 WTP validation of the $29/$79 line.**
- **Per-Treasurer-interaction target:** ~$0.010. **Hard monthly quota** enforced via `usage_meters` preflight (CR3).
- **Margin levers:** Haiku tiering (C7), Anthropic **prompt caching** on the stable prefix (~60% input savings), pre-computed snapshots, two Upstash DBs (BullMQ vs rate-limit), Turbo remote cache (60–80% CI cut).

### 5.6 Success metrics / KPIs

- **North Star (reframed — Major):** episodic value = **a grounded answer + month-2 retention + trigger proximity**, validated via a **4-week diary study** before KPI lock. Working proxy: paying users with ≥1 Plaid account and **≥3 Treasurer-touching conversations/week in their first 30 days**.
- Activation: % completing Plaid connect; time-to-first-grounded-answer.
- Engagement: Treasurer convos/week; briefing open rate; goal-progress interactions.
- Reliability: chat TTFB p95; Plaid sync success; APNs delivery.
- Quality: eval pass ≥90%; no-grounding hallucination = 0%; forecast accuracy vs 30d actuals ≥70% (Phase 2 exit).
- Business: $29/$79 conversion (post-WTP-lock); gross margin ≥70%; App Store rating.

### 5.7 Top risks + mitigations

| Risk | Sev | Mitigation |
|------|-----|-----------|
| Cross-tenant SSE leak (`progressBuffer` module-scope) | Blocker | **B1:** move into `run()` closure; two-tenant concurrency test as required check; block all Plaid/iOS-Treasurer work until green. |
| Zero CI → unreviewed prod pushes | Blocker | **B3:** ship `ci.yml` + macOS CI + branch protection Wk1. |
| iframe home traps navigation, no RLS shell | Blocker | **B2:** delete iframe; AppShell wired into `layout.tsx` with `userEmail`; CI grep + a11y gate. |
| No security headers (clickjacking, no CSP) | Blocker | **B4:** headers in `next.config.ts`; grade-A CI gate. |
| Remote auth weak (weak pw, open cidrs) | Blocker | **B5:** Management-API hardening + config-drift check before Plaid Prod. |
| Advice = regulated (state/EU) | Blocker/Med | **B7/B8/CR12:** written advice opinion gates Plaid Prod; Art.50/SB942 disclosure at Phase 1. |
| Prompt injection via facts/webhook/merchant | Critical | **CR2/CR9:** sanitize+XML-delimit facts (0% bypass), verify webhook before parse. |
| iOS auth bypass (no TOTP challenge) | Critical | **CR8:** hard CI gate before TestFlight. |
| False nutrition label → App Store removal | Critical | **CR11:** declare server-side + Anthropic DPA; correct before ASC. |
| $29 margin / audience-fit unproven | Critical/Med | **CR15/CR3:** WTP research + trial/pause; usage-meter quota + Haiku tiering + caching. |
| Plaid Production review latency | High | Submit at Phase 0 exit (autonomux.io→Vercel, corrected privacy section, advice opinion). |
| App Store financial-app extended review | High | Manifest + corrected label + disclosures + deletion flow before first external TestFlight; 4–6 wk buffer. |
| Stale Plaid tokens silently break Treasurer | Med | Webhook → `oauth_status='expired'`, re-link CTA both clients, typed error. |
| Transactions table growth | Med | Range-partition by date from day one; index discipline. |

---

## PHASE 0 — Foundation Hardening (≈Weeks 1–4) — BOTH CLIENTS BLOCKED ON THIS

**Goal:** close **all 9 Blockers + all Phase-0 Criticals** in the Resolution Ledger. Nothing else ships until CI is green and a Jury re-audit returns PASS.

**HARD SEQUENCING (Wk1 Day 1–2 first, everything gates on it):**
1. **Day 1–2:** B1 `progressBuffer` → `run()` closure + two-tenant concurrency test; B3 `ci.yml` (typecheck/lint/gitleaks/audit/semgrep/rls-proof/progressBuffer) + branch protection. **CI must exist before any other Blocker fix is enforceable.** CR4 (16k cap) + CR7 (mobile collapse spec) land here too — one-liners/cheap.
2. Then B2 (iframe kill + AppShell in `layout.tsx`), iOS shell, and `0016`+CR13 run in parallel.

| Workstream | Deliverables |
|-----------|--------------|
| **WEB frontend** | **B2:** delete iframe (`app/app/page.tsx`), build React **AppShell**, wire into `app/app/layout.tsx` with `userEmail` from session (every route RLS-aware); AlterEgo home (skill-card grid, composer, Cmd+K); **CR5** pass `onStop` to `<Composer>` (L586); **CR6** implement `sub_agent_progress` (append `message`); **CR7** mobile chat collapse at 560px + back affordance; **CR14** model-attribution meta row from `final_usage.model` (kill hardcoded "Sonnet 4.6", threadId page L231); remove `/app/chat` auto-redirect (render ThreadList + invitation card, Minor); `/app/finance` stub w/ Plaid-connect CTA; remove `--brand-aqua` + warm status tokens; hide/disable Mailroom noop Approve/Dismiss (SubAgentCard L16-20) + remove slash-command hint (Major); spec/hide locked sub-agent treatment. |
| **iOS (on Mac)** | **TabView** shell (SF Symbols, DM Mono, orange tint); bundle fonts + `UIAppFonts`; `.xcconfig` secret injection; **Keychain** session storage; `NSFileProtectionComplete`; **TLS pin**; remove `NSMicrophoneUsageDescription`; **`PrivacyInfo.xcprivacy`** at creation; **CR8 TOTP challenge view**; iOS security checklist on Phase 0 sign-off (Major); branded splash; SkillCard SF Symbols + a11y. |
| **SHARED backend / API** | **B1** progressBuffer closure fix + test; **CR3** rate limiter + budget cap + `maxDuration=300` (confirm Vercel Pro); **CR4** 16k cap; **CR9** webhook skeleton (raw-body→verify→parse, 400, test); wire `composeSystemPrompt()`; **CR13** `plaid_items` service-role RLS + Semgrep + anon-zero test; **`0016`/`0017`/`0018`**; migration-path fix + drift check; generate Supabase types; Plaid **Sandbox**; **single-source SSE vocabulary + delete dual-spelling shim** (Major); deletion-cascade spec + `plaid.itemRemove` test (Major). |
| **Plaid + Treasurer** | Security contract doc (§3.1); Plaid privacy section (corrected, CR11 direction); pre-Link **read-only-statement-before-OAuth trust flow spec (CR10)**; Treasurer `SubAgentEntry` skeleton (empty-graceful). |
| **Data model** | `0016`/`0017`/`0018` applied to remote **after CR13**; Supabase **Pro + PITR**; retention/legal-hold documented; deletion-spec reviewed before 0016. |
| **Security + encryption** | **B4** response headers (report-only→enforce, grade-A gate); **B5** Supabase remote hardening + config-drift check; **CR2** `agent_facts` sanitization + XML-delimit + 0%-bypass eval; PII field additions; remove/IP-restrict `x-mw-degraded`; assert `X-Forwarded-For`; lock `/api/telemetry`. |
| **DevOps** | **B3** `ci.yml` + branch protection; **iOS CI** (Xcode Cloud or `macos-15`); **Apple Developer Program** enrolled; staging Supabase + Railway; two Upstash DBs; Turbo remote cache. |
| **AI / evals** | `FINANCIAL_ADVICE` contract locked; `treasurer.eval.ts` scaffold (CI-runnable); embedding provider decision. |
| **Research / Legal / Product** | **B6** `personas/autonomux-freelancer.md` from 5+ Scout interviews; **B7** written US-state+EU advice opinion kicked off Wk1; **C13** GDPR legal basis confirmed Wk1; **CR15** WTP research with 20+ freelancers begun (gates Phase-1 billing). |
| **UX / parity** | Canonical warm token set; AlterEgo home pixel spec; **B9** advice-banner spec (grade ≤8, distinct block); finance-surface IA + mobile-web specs at 375/390px (Major) locked before Plaid API work. |

**Dependencies:** Apple Developer enrollment blocks iOS CI/TestFlight; autonomux.io→Vercel blocks Plaid Production submission; the **written advice opinion (B7)** blocks Plaid Production submission; **CR13** blocks `0016`.
**Exit criteria:** CI green on `main`; **Jury re-audit of all 9 Blockers + all Phase-0 Criticals (CR2, CR3, CR4, CR5, CR6, CR7, CR9, CR13) = PASS**; web `/app` is real React inside the RLS-aware AppShell (no iframe); iOS builds/runs from CI, signs in **with TOTP challenge** if enrolled; `personas/autonomux-freelancer.md` exists (Flow sign-off); written advice opinion on file; corrected privacy/nutrition direction agreed; `0016` applied after `plaid_items` RLS; **Plaid Production application submitted.**

---

## PHASE 1 — MVP: Read / Advise / Notify Finance + Chat (≈Weeks 5–16, web + iOS PARALLEL)

**Goal (North Star proxy):** paying users with Plaid connected + ≥3 Treasurer conversations/week within 30 days, on BOTH platforms — with episodic-value KPI validated via the 4-week diary study before lock.

| Workstream | Deliverables |
|-----------|--------------|
| **WEB (wks 5–10)** | Plaid Link (`plaid-react`) — behind the **CR10 read-only-statement-before-OAuth trust flow**, branded post-connect confirmation; `/app/finance` dashboard (account cards + `last_synced_at` freshness, virtualized transactions w/ filters, bills timeline, cash-flow summary); streaming chat states (thinking→streaming→**progress card (CR6)**→**cancel (CR5)**); `SubAgentCard` `treasurer` → `FinanceCard`; **non-dismissable advice banner (B9)** + **AI-interaction session-start disclosure (B8/CR12)** + **per-figure AI-generated labels** + **model-attribution meta row (CR14)**; **Treasurer empty states** (Plaid-connect CTA, zero-accounts card, EMPTY_CHIPS, Major); Web Push (VAPID + SW); **Stripe billing page — gated on CR15 WTP lock**, with trial/freemium + slow-month usage pause. |
| **iOS (wks 5–10, TestFlight internal wk 8)** | `SSEClient` (single canonical SSE shape post-shim-deletion) + `ChatViewModel` + chat UI (FinanceCard render); **`PlaidLinkView`** (LinkKit) → POST public_token to shared exchange, behind the CR10 trust flow; `TreasurerView`; **APNs** (after first meaningful action); Settings (notification prefs, Plaid disconnect, **account deletion + copy**, sign-out, GDPR export); **disclosure parity** (B8/B9/CR12/CR14 render identically); **TOTP challenge enforced (CR8).** |
| **SHARED backend / API** | `/api/plaid/{link-token,exchange,webhook,sync}` (webhook per CR9); **PlaidAdapter** (circuit breaker, encrypted token store); BullMQ **plaid-sync** (cursor upsert, ITEM_LOGIN_REQUIRED→`expired`+re-link); bill-detection; `device_push_tokens` + `/api/push/register`; Scheduler APNs + Web Push; **`usage_meters` quota enforcement (CR3) w/ 402 preflight + 429 Retry-After**; **GDPR deletion extended to finance + `plaid.itemRemove` (Major)**; snapshot refresh (`pg_cron`). |
| **Plaid + Treasurer agent** | `treasurer.tool.ts`: `get_accounts`, `get_recent_transactions`, `get_spending_summary` (pre-aggregated), `get_bills`, `get_cash_flow_estimate` (reads snapshots; **acknowledges income irregularity / minimal runway estimate**, Major), `get_financial_goals`; Haiku extraction / Sonnet synthesis; **disclaimer + AI-generated label on every dollar figure (B8)**; provenance timestamp; episodic memory write after each invocation. |
| **Data model** | `0018` bills v2 live; partial index `WHERE pending=false`; Plaid→10 top-level category map; **episodic-memory AI inferences declared as a named data category** w/ clear-memory control (Major). |
| **Security + encryption** | Plaid contract enforced end-to-end; **CASA Tier 2 (ASVS L2 mapping)** at phase end; **corrected** privacy manifest + **corrected nutrition label (Financial Info processed server-side, Anthropic DPA) (CR11)**; deletion URL in ASC; **account-deletion copy** (what is deleted, what is retained 7 years + why, Plaid disconnect, irreversibility; grade 8; web+iOS consistent) (Major). |
| **DevOps** | TestFlight workflow (archive+upload via ASC API key/Fastlane) on tag; internal→external beta; Vercel invite-only beta; SSE keepalive; Bull-Board. |
| **AI / evals** | **Treasurer golden set complete (~20 cases) as CI gate (CR1)** incl. no-data abstention, adversarial injection, **distrust probe (CR10)**, **cover-rent/irregular-income (Major)**; irregular-income communication spec; prompt caching + tiering wired. **AI cannot PASS without Oracle's verdict.** |
| **UX / parity** | TreasurerCard ↔ TreasurerView spec-matched; disclosures designed as first-class; **brand voice + palette validated with freelancers on stress-case Treasurer lines** (Minor); mobile-web finance specs at 375/390px shipped; iOS reaches web parity within one sprint. |

**Sequencing / dependencies:** API contract defined first (both clients block). **Single-sourced SSE vocabulary (shim deleted) before iOS SSEClient.** Webhook + sync worker before Treasurer answers real data. `TreasurerResultPayload` defined before the backend tool ships. **CR15 WTP lock before billing.** **CR1 eval verdict before Treasurer serves real data.** Plaid Production key + written advice opinion (B7) before real bank connects.
**Milestones:** iOS TestFlight internal wk8 → external wk12 → App Store submission wk14 → approval wks16–18. Web public beta ~wk12.
**Exit criteria:** a user connects a bank via Plaid on **web AND iOS** (through the CR10 trust flow), sees accounts/transactions/bills w/ freshness stamps, asks Treasurer and gets a **streamed, data-grounded answer citing real transactions with an AI-generated label and model attribution**, receives a bill push (APNs+web+email), AlterEgo remembers a goal across sessions. **Advice banner (B9) + AI-interaction disclosure (B8) + Art.50/SB942 disclosure (CR12) visible on every Treasurer surface.** Corrected nutrition label filed. Eval **≥90% pass, 0% no-grounding hallucination (CR1)**; TOTP enforced on iOS (CR8). **Jury re-audit of all Phase-1 Criticals + Blockers B8/B9 = PASS.** North Star reframed + diary study baseline established.

---

## PHASE 2 — Finance Intelligence (≈Weeks 17–28, web + iOS at parity)

**Goal:** intelligence measurably drives engagement; iOS ships each feature within one sprint of web.

- **Shared/AI:** **cash-flow forecasting for irregular income** (income-deposit detection + rolling avg/stddev + committed bills + runway — the killer feature); auto-categorization (Haiku + Plaid, user-editable, `category_confidence`); insights + duplicate/price-hike detection; budget envelopes; goal tracking; **tax set-aside** (self-employment detection, 25–30%, IRS Pub 505) **with its own legal opinion, disclaimer, and mandatory consult-a-tax-professional CTA (Major)**; what-if scenarios; net-worth tracking; **proactive daily briefings**. Episode recall k=10.
- **WEB:** `/app/finance/budgets`, charts, forecast surface.
- **iOS:** Swift Charts, **WidgetKit** balance/next-bill widget, budgets/goals views; **passkeys** once `rp_id` live (flag stays off until autonomux.io canonical); **dark mode** (warm dark tokens).
- **Compliance:** **system-card version bump is a Phase-2 *update*, but the underlying Art.50/SB942 disclosure already shipped in Phase 1 (CR12) — Phase 2 only revises it as data categories expand**; update `PrivacyInfo.xcprivacy` + nutrition label if categories change; structured-facts injection hardening complete; **AI-generated-estimate labeling on every forecast** (extends B8).
- **Data:** free-tier **12-month** history; gate 24-month + advanced scenarios to $79 Pro.

**Exit criteria:** forecast accuracy vs 30-day actuals ≥70%; p95 Treasurer turn <8s; eval pass ≥92%; iOS/web parity; engagement metrics trending up.

---

## PHASE 3 — Gated Money Movement (≈Week 40+, REGULATORY GATE)

**Precondition (hard):** written legal opinion — state-by-state money-transmitter analysis OR a licensed BaaS program agreement (Unit/Column/Treasury Prime). Plaid Transfer is not an MTL substitute. **6–12 months regulatory prep before code.** Feature-flagged OFF (`treasurer_transfers_enabled`) in all builds. No Phase-1 read-only surface is redesigned for it.

- **Scope:** bill pay, goal-directed saving, recurring transfers.
- **Security:** step-up re-auth (WebAuthn / Face ID); dual-control confirmation; AutoRoom approval gate (`confirm_each`); separate transfer BullMQ queue + dead-letter + human review; tamper-evident audit per transfer; PCI-DSS scoping; routing/account numbers encrypted immediately, never logged.
- **Data:** `payment_intents`, `transfer_authorizations`, `payment_audit_log` — never shared with read-only tables.
- **App Store:** separate re-review (3.1.1/3.1.3).
- **Compliance:** SOC 2 Type II window (≥6 months); Comply sign-off before any code lands.

---

## PHASE 4 — Breadth (Quarter 3+)

Additional sub-agents (Mailroom write, Scribe, Oracle, Studio); multi-institution Plaid; multi-tenant shared AlterEgos; investments/liabilities; debt-payoff optimizer; multi-currency; voice (re-add mic permission w/ precise copy); Siri Shortcuts; Apple Watch; iPad `NavigationSplitView`; web PWA. Design system → versioned library. Each new data category ⇒ `PrivacyInfo.xcprivacy` update + possible re-review. SOC 2 Type II audit.

---

## 6. Realistic Parallel Timeline

```
Wk  1───4 │ PHASE 0  all hands — both clients BLOCKED
          │  wk1 D1-2: progressBuffer→run() closure + concurrency test + ci.yml + branch protection
          │            + 16k cap (CR4) + advice opinion kickoff (B7) + GDPR basis (C13) + WTP start (CR15)
          │  wk2: iframe kill → AppShell w/ userEmail │ iOS TabView + TOTP view │ 0016 (after plaid_items RLS)
          │        + onStop wire (CR5) + sub_agent_progress (CR6) + mobile collapse (CR7) + persona (B6)
          │  wk3: Supabase remote hardening + drift check (B5) │ rate-limit+budget (CR3) │ webhook skeleton (CR9)
          │        + agent_facts sanitize (CR2) │ Keychain/xcconfig/fonts/TLS/PrivacyInfo
          │  wk4: security headers grade-A (B4) │ eval scaffold │ SSE shim deleted
          │        EXIT: Jury PASS (9 Blockers + Phase-0 Criticals) + Plaid Prod submitted
Wk  5──10 │ PHASE 1 build — WEB features ║ iOS foundation (parallel); disclosures B8/B9/CR12/CR14 wired
Wk     8  │   ● iOS TestFlight INTERNAL (TOTP gate CR8 green)
Wk 10──14 │   ● Web MVP public beta (invite-only); billing only after CR15 lock
Wk    12  │   ● iOS TestFlight EXTERNAL (first ~10 ICP users)
Wk    14  │   ● App Store SUBMISSION (corrected nutrition label CR11, advice opinion B7 on file)
Wk 16──18 │   ● App Store APPROVAL (financial-data extended review)
Wk    18  │   ★ SIMULTANEOUS web + iOS PUBLIC LAUNCH ← Phase 1 exit + Jury PASS (CR1 verdict green)
Wk 17──28 │ PHASE 2  Intelligence (web + iOS parity)
Wk   40+  │ PHASE 3  Gated money-movement (after legal sign-off; 6–12mo prep)
Q3+       │ PHASE 4  Breadth
```

---

## 7. Open Questions for Jo (settle BEFORE Phase 0 dispatch — each gates a dependency)

1. **Apple Developer Program** enrolled + `io.autonomux.app` registered? (Blocks iOS CI/TestFlight.)
2. **Plaid:** developer account live? Production started? **Support freelancer *business* accounts (C12)?** (Locks products + onboarding copy.)
3. **Vercel Pro** approved? (`maxDuration=300` (CR3) + Web Push require it.)
4. **Mac availability** for the SwiftUI loop, or CI-only?
5. **iOS CI:** Xcode Cloud vs `macos-15`? (C4 default: Xcode Cloud.)
6. **Embedding provider/model** (1536-dim): OpenAI `text-embedding-3-small` vs Voyage?
7. **Advice legal sign-off (B7):** is "informational, not regulated" (disclosure UI + prompt + written opinion) sufficient, or full ToS + counsel review before Treasurer? (Gates Plaid Production.)
8. **Launch geography (Major):** US-only geo-restrict in ASC, or add UK/CA/AU to legal scope? (Gates App Store submission + advice-opinion jurisdictions.)
9. **Pricing (CR15):** run WTP with 20+ freelancers to confirm/adjust $29/$79 and choose trial vs freemium + slow-month pause? (Gates Phase-1 billing.)

*Charter note: per Hard Rule 2, no phase ships without a Jury verdict; the audit moves with any date change, never cut. Per Hard Rule 3, every resolution above is logged with rationale. Section 0-A is the standing checklist the re-audit walks.*
