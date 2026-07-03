# autonomux — Web Finance MVP · Production Roadmap

> Produced by the Studio-Zero multi-agent workflow (BigBrain + 8 layer-lead pairs), audited by Jury.
> 15 agents · ~1.44M tokens · 27 min.

## Jury Verdict: **PASS_WITH_FIXES**

**Scorecard:** Optic 2/5 · Compass 3/5 · Proof 2/5 · ShieldAudit 2/5 — 9 Blockers / 12 Critical → PASS_WITH_FIXES, gated on Phase 0 closure of all Blockers plus eval + advice-disclosure sign-off before any finance data ships.

### Rationale

Not ready to ship, but close as a plan — the roadmap is coherent and correctly sequences most hardening as Phase 0 gates, yet it cannot govern a launch until a defined set of Blockers is closed and two contradictions are resolved. Three independent reviewers converged on the same critical mass with file:line evidence, so this is neither a clean PASS nor a FAIL. It is a FAIL for anything that ships today (an active cross-tenant data leak and wide-open auth config exist in current code) but a PASS_WITH_FIXES for the plan itself: the structure is right, the gaps are named, and they are fixable inside Phase 0 without re-architecting. Two things force fixes before this can advance. First, the AI-feature gate in my charter is not met: neither the FINANCIAL_ADVICE_REFUSAL prompt section nor the treasurer.eval.ts eval suite exists in code, so there is no eval posture and no advice-disclosure sign-off — an AI finance feature cannot PASS without both. Second, the roadmap mis-severities live defects (it calls the module-level progressBuffer cross-tenant leak "Critical" when it is an active unauthorized disclosure of one user's financial-interaction data to another — a Blocker), and it leaves a hard pricing contradiction unresolved ($12/$29 draft vs $29/$79 PRD, a >2x delta that breaks Penny's margin model). Note one reviewer conflict resolved by audience, not seniority: Optic frames the warm dark sidebar as canonical brand expression while Compass flags it as a possible trust-discount for a finance audience calibrated to banking-app visual language — I keep the dark sidebar (D-1 stands, it is a brand decision within Jo's intent) but downgrade the question to a Phase-1 beta validation prompt rather than a design change, because the audience signal is a hypothesis, not measured harm. The path to PASS is mechanical: convert each Blocker below into a hard merge gate (CI branch-protection lint that fails on an iframe in /app, on any --brand-aqua reference, on a missing FINANCIAL_ADVICE_REFUSAL section, and on missing security headers), land the one-line fixes (progressBuffer scope, bumpUsageMeter atomic UPSERT, maxDuration=300, onStop wiring), and get Comply plus the eval suite to sign off before any finance data touches production. Re-audit by the originating reviewer closes each finding — self-attested fixes do not.

### Top 3 findings

1. A user could get a wrong money number with nothing telling them it's not advice — and another user's 'Reading your transactions...' status can bleed into their screen. There is no financial-advice disclaimer anywhere in the running code, no automated check that the AI only states figures it actually looked up, and a shared progress buffer (runtime.ts:808) leaks one person's financial-activity status into someone else's live stream under normal concurrent load. For a money app aimed at privacy-wary founders, either of these breaks trust at first contact and neither is recoverable.

2. The front door is unlocked and there's no guard at the gate. Sign-up needs no email confirmation and accepts 6-character passwords, two-factor is switched off in config, the database accepts connections from any IP (0.0.0.0/0), the site ships zero security headers (fully clickjackable, no script-injection defense), and there is no CI at all — every change can go straight to production with no test, lint, secret-scan, or approval. None of this can be true when real bank data arrives.

3. The home screen is a locked box and the price tag is wrong. The authenticated home is a full-screen iframe (app/page.tsx:28-41) that traps every real nav path, so no Phase 1 bank-connect flow is reachable through the intended navigation until it's replaced. Separately, two governing documents disagree on price by more than 2x ($12/$29 vs $29/$79) — one of them is wrong, and no pricing page, Stripe product, or margin model can be built until Jo picks one.

## Punch List (42 items)

### Blocker (9)

- **[Blocker] Forge (Backend) — re-audit by ShieldAudit + Proof** — Cross-tenant data leak: module-level progressBuffer (packages/orchestrator/src/runtime.ts:808) drains one tenant's SSE progress events into another under concurrency. Elevated from the roadmap's 'Critical' — this is an active unauthorized disclosure in shipped code (GDPR Art. 5(1)(f); Plaid Production-disqualifying). Move inside the run() generator scope; add a concurrent-invocation test asserting run A events never appear in run B. _(due: Phase 0, week 1 (before any concurrent finance traffic))_
- **[Blocker] Cortex (AI) + Comply — re-audit by Proof** — No financial-advice disclosure exists in code. Write and lock FINANCIAL_ADVICE_REFUSAL in packages/orchestrator/src/system-prompt.ts (Comply-reviewed); add a pre-Link disclosure banner at the integrations page; add an inline DM-Mono caveat on every forward-looking output. Define the caveat trigger taxonomy (data outputs = no per-item caveat; projections/recommendations = inline caveat). AI-feature gate: no Treasurer feature PASSes without this. _(due: Phase 0 (before any Treasurer output reaches a user))_
- **[Blocker] Cortex/Oracle (AI-Evals) — re-audit by ShieldAudit** — No eval posture. treasurer.eval.ts (promptfoo) does not exist. Author grounding, no-data abstention, temperature-0 consistency, adversarial-injection, and tool-selection cases; wire as a required CI gate on any change to system-prompt.ts / treasurer.tool.ts. AI-feature gate: no PASS without Oracle/eval sign-off. _(due: Phase 1 (before Treasurer ships to beta); scaffolding in Phase 0)_
- **[Blocker] Pipeline (DevOps) — re-audit by ShieldAudit** — No CI / branch protection. Create .github/workflows/ci.yml (tsc --noEmit, turbo lint, turbo test with RLS proof suite, npm audit --high, gitleaks, supabase db diff). Enforce main branch protection (required checks + 1 approval, no direct push) and gate Vercel promotion on green CI. Add lint rules that fail the build on an <iframe> in app/app/page.tsx and on any --brand-aqua reference. _(due: Phase 0, week 1 (before any feature merge))_
- **[Blocker] Shield/Cipher (Security) — re-audit by ShieldAudit** — Supabase config.toml is wide open for a finance app: TOTP+WebAuthn disabled, enable_confirmations=false, minimum_password_length=6, secure_password_change=false, sessions block commented out, captcha off, allowed_cidrs=['0.0.0.0/0']. Set TOTP enroll/verify=true, enable passkeys (rp_id='autonomux.io'), confirmations=true, password length>=12 with symbol policy, secure_password_change=true, sessions timebox=8h/inactivity=2h, Turnstile on, email max_frequency=5m, restrict CIDRs to Railway+Vercel, enforce SSL. Apply to remote and add a config-drift CI check. _(due: Phase 0 (before any real user data))_
- **[Blocker] Shield (Security) — re-audit by ShieldAudit** — Zero HTTP security headers (apps/web/next.config.ts has no headers()). Add CSP (frame-ancestors 'none', script-src 'self'+nonce, Plaid domains in frame-src/script-src, connect-src supabase/upstash), HSTS preload, X-Frame-Options: DENY, X-Content-Type-Options: nosniff (including on the SSE header object), Referrer-Policy, Permissions-Policy locking camera/mic/geo, COOP. Validate to A grade on securityheaders.com before beta. _(due: Phase 0 (before any beta user))_
- **[Blocker] Axiom/Penny (Compliance) + Pipeline (domain) — re-audit by Proof** — Privacy policy (apps/web/app/legal/privacy/page.tsx) has no mention of Plaid, financial data, or Plaid's End User Privacy Policy link — a hard external prerequisite for the Plaid Production application. Add a 'Financial data (Treasurer)' section (data categories, legal basis, 7-year retention basis, deletion behavior) and the Plaid EUPP link. Also confirm autonomux.io resolves to the Vercel deployment and /privacy returns 200 unauthenticated (MEMORY: .io is Resend-only today) before submitting the Plaid app. _(due: Phase 0, week 1 (blocks Plaid Production submission))_
- **[Blocker] Axiom/Penny (Compliance/Pricing) + Jo — re-audit by Compass** — Pricing contradiction: draft roadmap (Free/$12/$29) vs PRD locked pricing (Free/$29/$79) — a >2x delta that collapses Penny's >=70% margin model at the low numbers. Hold a pricing decision with Jo, lock one source of truth, mark the other superseded, and cross-check margin against the $90-130/mo fixed + Plaid + LLM envelope before any pricing page, Stripe product, or funnel is built. _(due: Before Phase 0 exit)_
- **[Blocker] Arch/Vega (Frontend) — re-audit by Optic** — Iframe home (apps/web/app/app/page.tsx:28-41) traps all native nav, Cmd+K, sub-agent cards, and the Plaid connect entry point — no Phase 1 user flow can complete through intended navigation. Make iframe removal a hard merge gate: no Phase 1 feature branch merges to main until AppShell renders /app as a real page with Sidebar + real content. Enforce via the CI lint rule above. _(due: Phase 0 exit (native shell in prod before Phase 1 feature work))_

### Critical (11)

- **[Critical] Forge (Backend) + Cipher — re-audit by ShieldAudit** — GDPR deletion pipeline omits all finance tables and never calls Plaid /item/remove, so a 'deleted' user's bank connection stays live at Plaid. Extend the worker to call plaid.itemRemove for every active item before purging, hard-delete plaid_transactions/accounts/items/webhook_events/bill_transaction_matches/treasurer_bills/treasurer_budgets/finance_goals/net_worth_snapshots in dependency order, and destroy the Cipher envelope. Add an integration test asserting itemRemove was called and rows are gone. _(due: Phase 1 (before any real Plaid connection))_
- **[Critical] Forge (Backend) + Atlas (Data) — re-audit by ShieldAudit** — Non-atomic bumpUsageMeter (runtime.ts:457) loses updates under concurrency, under-counting tokens and breaking the quota enforcement that rate-limiting depends on. Replace with a single atomic Postgres UPSERT RPC (bump_usage_meter). Must land before quota enforcement is trusted. _(due: Phase 0)_
- **[Critical] Shield (Security) + Forge (Backend) — re-audit by ShieldAudit** — No rate limiting on /api/chat/stream — an authenticated user can burn Anthropic tokens with no ceiling (LLM04 DoS). Add checkRateLimit('chat_stream', ...) + per-tenant daily token-quota check before instantiating the runtime; return 429 with Retry-After; lower the userMessage cap from 200,000 to 12,000 chars. _(due: Phase 0)_
- **[Critical] Forge/Bridge (Backend) — re-audit by ShieldAudit** — Plaid webhook handler (/api/webhooks/plaid) does not exist. Build it Node-runtime with raw-body JWK verification against Plaid's rotating JWKS (cache <=5 min), JSON-parse only after signature passes, idempotency on Plaid delivery ID, 200 ack within 100ms, 401 on failure. Without JWK verification, attacker-injected webhooks poison plaid_transactions (indirect prompt-injection into advice). Do not ship Plaid without it. _(due: Phase 1 (before Plaid integration goes live))_
- **[Critical] Cortex (AI) + Forge (Backend) — re-audit by ShieldAudit** — Prompt-injection via tool output is unmitigated: the SSE route falls through to DEFAULT_SYSTEM_FALLBACK (composeSystemPrompt not wired), and merchant/memo fields flow to the LLM unsanitized. Wire composeSystemPrompt() into the route, strip/truncate/allowlist merchant+memo fields at the Treasurer tool layer, and include the adversarial-injection case in the eval gate. _(due: Phase 1 (before Treasurer tool output reaches the LLM))_
- **[Critical] Compass + Herald + Comply — re-audit by Compass** — Irregular-income communication and forecast-uncertainty have no behavioral spec. Produce a one-page communication spec for the irregular-income persona (never 'you will have', always 'based on your history, a range of'; plain-English confidence-band label at the ICP's reading level; what it says when data is sparse; what it must never say). Comply + Herald review before it enters the system prompt. _(due: Before Phase 2 forecasting ships)_
- **[Critical] Proof + Cortex — re-audit by Proof** — System card (system-card/page.tsx) describes Treasurer as read/categorize-only and assigns finance-advice refusal to Companion, but Phase 2 Treasurer will produce forecasts/tax set-aside/what-if — a material capability expansion (CA SB 942, EU AI Act Art. 50) that requires a disclosure update before it ships. Add a mandatory system-card version-bump gate to the PR template for any Treasurer feature producing normative outputs. _(due: Phase 1/2 (gate active before first advisory Treasurer output))_
- **[Critical] Axiom/Penny (Product) + Compass — re-audit by Compass** — 90-day Free-tier history cap sabotages the killer feature: irregular-income cash-flow forecasting needs >=12 months to detect seasonality, so Free-tier forecasts run on structurally incomplete data — a first-contact trust break. Set minimum ingested history to 12 months for any connected account regardless of tier (gate 24-month depth to paid); differentiate Free by bank-count/Autoroom, not data depth. _(due: Before Phase 1 pricing/onboarding ship)_
- **[Critical] Compass + Comply + Herald — re-audit by Proof + Compass** — Plaid connect-time consent copy does not exist. Write pre-Link consent covering what is stored, retention (incl. the 7-year tax basis stated in plain language, not buried), who accesses it, deletion behavior (token revoked + rows deleted), and legal-hold exceptions. Test with >=3 real-ICP users before finalizing; Comply approves, does not author. _(due: Before Phase 1 Plaid Link ships)_
- **[Critical] Optic + Cortex — re-audit by Optic** — AI trust signal / provenance absent: FINANCE_CONTEXT injects live balances before the first user turn with no source or freshness disclosure. Every dollar figure in TreasurerCard must carry a visible 'Balances as of [last_synced_at]'; narrative referencing specific figures ends with a provenance line. Add a treasurer.eval.ts assertion that the rendered output contains the timestamp. _(due: Phase 1 (TreasurerCard acceptance criterion))_
- **[Critical] Arch/Vega (Frontend) — re-audit by Optic** — Approve/Dismiss buttons on MailroomRow (SubAgentCard.tsx:257-283) submit to noopMailroomAction and silently do nothing in a finance-adjacent context — no loading, disabled, error, or success state. Hide interactive buttons whose backend does not exist (preferred), or add an explicit 'Queued — coming soon' pending state. _(due: Phase 1 (before these surfaces ship broadly))_

### Major (14)

- **[Major] Pipeline (DevOps) + Arch (Frontend) — re-audit by Optic** — Doherty/latency SLO understated: the roadmap targets 800ms 'first SSE frame' (twice the Doherty first-text bound) and the SSE route has no maxDuration, so Vercel Hobby kills the stream at 10s. Add export const maxDuration=300 (moving with the Pro upgrade), redefine TTFB as 'first text token in DOM <400ms p50' measured from POST dispatch to first non-empty text_delta, and instrument it as a KPI. _(due: Phase 0 (maxDuration) / Phase 1 (TTFB instrumentation))_
- **[Major] Arch/Vega (Frontend) — re-audit by Optic** — Stop button unreachable: Composer renders it only when onStop is a function, but ChatStream (line 586) never passes onStop; the AbortController (abortRef, line 381) is unreachable from the UI during 4-8s Treasurer turns. Wire handleStop and pass onStop={inFlight ? handleStop : undefined}; add a Playwright test asserting the stop button appears within 200ms of POST. _(due: Phase 1)_
- **[Major] Arch/Vega (Frontend) + Forge (Backend) — re-audit by Optic** — sub_agent_progress events are discarded (ChatStream.tsx:650-652 returns msg unchanged); ThinkingTurn shows only generic dots, so users cannot tell a hung connection from an active Plaid read. Store progressText on the UiMessage and render it in ThinkingTurn; emit 'Reading your transactions...' as a sub_agent_progress event. _(due: Phase 1)_
- **[Major] Arch/Vega (Frontend) + Canvas — re-audit by Optic** — Empty-state prompt chips (ChatStream.tsx:214-239) are hardcoded to Mailroom/Scheduler; the Treasurer hero launches behind Mailroom prompts. Make EMPTY_CHIPS conditional on integration state (Plaid item -> Treasurer chips), pass connectedSubAgents from the server page, and include a concrete migration plan in the Phase 1 spec. _(due: Phase 1)_
- **[Major] Arch (Frontend) + Shield (Security) — re-audit by Optic + ShieldAudit** — Plaid disconnect (integrations/page.tsx:226-229) is a bare form with no confirmation, loading state, error recovery, or step-up gate — and disconnect triggers an irreversible itemRemove + envelope wipe + GDPR purge. Before Plaid ships, add a confirmation dialog, TOTP/WebAuthn step-up, loading state, and explicit success/error feedback. Enforce step-up in the Plaid route template so it cannot be dropped under time pressure; require >=1 MFA factor before any Plaid connect. _(due: Phase 1 (before Plaid disconnect is wired))_
- **[Major] Arch/Vega (Frontend) — re-audit by Optic** — --brand-aqua (integrations/page.tsx:285, fallback #14C8CC cold teal) clashes with the warm palette and ships on every integrations render now. Swap to var(--status-active, var(--brand-gold)) immediately and add a stylelint rule failing the build on any --brand-aqua reference (also enforced as a CI gate above). Do not defer to Phase 1. _(due: Phase 0)_
- **[Major] Atlas/Keeper (Data) + ShieldAudit — re-audit by ShieldAudit** — RLS proof suite is non-functional for finance tables (rls-proof.test.ts has TODO(Phase 1.0-B6); only mailroom_rules/audit_log covered; setupCi.ts tenant provisioning missing). Implement setupCi.ts (two users/tenants/JWTs via admin API) and extend the 5-operation isolation pattern to every finance table as a required CI check before migration 0016 touches real data. _(due: Phase 0 (before 0016 on any real-data env))_
- **[Major] Herald + Compass — re-audit by Compass** — Finance vocabulary vs financial literacy: 'runway', 'invoice lanes', 'net-worth snapshot' are startup-CFO terms that may not map to a freelance RN's mental model. Audit every finance label against the ICP's self-description; test alternatives (runway->'months of safety net', invoice lanes->'client income', net-worth->'what you own vs owe'). Herald owns copy; Compass signs off. _(due: Before Phase 1 skill grid / slash-command palette)_
- **[Major] Herald + Proof + Comply — re-audit by Proof** — 'ADVISE' MVP framing has no disclosure counterpart: ToS disclaims being an 'adviser' (status) while the product promises to 'advise' (action) — coherent only with an unambiguous point-of-use disclosure. Remove 'advise/advice' from user-facing copy unless paired with a disclosure; use 'suggestions/analysis/insights'. Also add a one-time first-login AI-interaction banner (Art. 50(2)) and correct the system-card comment to cite Art. 50(2), not Art. 50 generically. _(due: Phase 1)_
- **[Major] Proof + Comply + Cortex — re-audit by Proof** — Tax set-aside (Phase 2) presents a specific 25-30% figure = normative tax advice needing distinct treatment. Split Treasurer outputs into Data (no per-turn caveat) vs Normative (per-output caveat + uncertainty). Remove the hardcoded 25-30% from the spec; present a range with explicit dependencies and link IRS Pub 505. Also remove the 'Plaid Transfer handles licensing' claim from the Phase 3 plan — it does not confer MTL; requires state-by-state analysis or a licensed BaaS program agreement and a written legal opinion. _(due: Before Phase 2 (tax) / before Phase 3 scope (MTL))_
- **[Major] Cipher (Security) + Jo — re-audit by ShieldAudit** — Single shared CMK gives no cryptographic-erasure path for GDPR (wrapped DEKs in backups theoretically remain decryptable). Decide per-tenant CMK/alias model before public launch (KMS alias per tenant with EncryptionContext condition; scheduled key deletion on hard-delete). If deferred to Phase 2, document the limitation explicitly in the GDPR consent copy. _(due: Before public launch (decision in Phase 0))_
- **[Major] Lens + Compass — re-audit by Compass** — No churn-signal feedback loop between Phase 1 NSM (>=3 convos/wk) and Phase 2. Instrument one qualitative mechanism in Phase 1 (thumbs-down -> 'what went wrong?' free-text, or weekly micro-survey) so Phase 2 intelligence is designed against observed friction, not an imagined NSM number. Do not scope Phase 2 on the NSM count alone. _(due: Phase 1 (before Phase 2 scope locks))_
- **[Major] Canvas + Axiom (Product) — re-audit by Compass** — 18-month gap to Phase 3 money movement with no retention mechanic for the audience's primary pain (paying bills from irregular income). Add read-only 'action-adjacent' features in Phase 1 Bill Watcher: deep-link 'Pay this bill' into the user's bank app with payee/amount prefilled, exportable payment schedule to calendar, copy-to-clipboard payment details — no money movement, no license needed. _(due: Phase 1)_
- **[Major] Axiom/Penny (Product) + Jo — re-audit by Compass** — Resolve Open Question 2 (personal vs light-business) before Phase 0 exits — it determines Plaid product scope. Many freelancers bank via business checking, which Plaid Consumer scope excludes; connecting and then finding the primary account missing is a first-connection trust break. If yes, apply for Assets/Liabilities and confirm institution Consumer-scope support; if no, make personal-only explicit in onboarding copy. _(due: Before Phase 0 exit)_

### Minor (5)

- **[Minor] Arch/Vega (Frontend) — re-audit by Optic** — Composer hint '/ for commands' (Composer.tsx:405) advertises a slash palette that does nothing in Phase 0. Hide the hint until the palette ships (preferred) or add a '/'-keydown tooltip 'Slash commands coming in the next update'. _(due: Phase 1)_
- **[Minor] Axiom (Product) + Lens — re-audit by Compass** — Bill Watcher upgrade fence is placed at the notification, not the outcome. Reframe the pitch around 'never scramble to cover a bill again' and instrument in Phase 1 beta whether notified users take action vs dismiss, to validate the fence is at the right feature. _(due: Phase 1 beta)_
- **[Minor] Herald + Proof — re-audit by Proof** — 'READ ONLY / Advisory' notification label reads as a permissions status to a non-technical user and breaks brand voice. Replace with 'For your information — not financial advice' (or 'Informational only'); run past Herald. _(due: Phase 1)_
- **[Minor] Proof — re-audit by Proof** — System-card parenthetical '(Founder is a registered nurse; this rule is non-negotiable.)' (system-card/page.tsx:212) conflates a personal credential with a compliance control on a published trust page. Replace with a verifiable statement that the refusal is enforced at the system-prompt layer and cannot be overridden. _(due: Phase 1)_
- **[Minor] Shield/Cipher (Security) — re-audit by ShieldAudit** — config.toml db.network_restrictions allowed_cidrs=0.0.0.0/0 and ssl_enforcement commented out; pinoRedactPaths (cipher/redact.ts) covers only ~3 nesting levels while Plaid error payloads embed account-holder names deeper. Tighten CIDRs to Railway/Vercel + enable SSL enforcement; extend redaction to 4 levels or a recursive serializer, add a Semgrep rule flagging direct serialization of Plaid responses, and log only {endpoint,status,item_id,error_code}. _(due: Phase 0 (CIDR/SSL) / Phase 1 (redaction))_

### Polish (3)

- **[Polish] Canvas (Design) — re-audit by Optic** — TreasurerCard '2x2 lanes' spec has no empty-lane or 1/3-account states; blank grid cells look broken. Define states before UI build: 'No bills detected yet — check back after your first sync', forecast-unavailable (<30 days data), net-worth with no investment accounts. Add to the component spec before the ticket is picked up. _(due: Before Phase 1 TreasurerCard build)_
- **[Polish] Atlas (Data) — re-audit by ShieldAudit** — user_2fa_verify_attempts accumulates with no purge (0005_2fa.sql notes a deferred cron); unbounded growth degrades the brute-force rate-limit query on the 2FA hot path. Add a daily job DELETE ... WHERE created_at < now() - interval '24h' and confirm the recent-attempts index covers the predicate before beta. _(due: Before beta launch)_
- **[Polish] Compass + Lens — re-audit by Compass** — Validate the warm dark sidebar on finance surfaces (D-1 stands as a brand decision) with one Phase-1 beta prompt: 'How does it feel looking at your bank balance here vs your bank's app?' Do not change the design on speculation — measure first. (Reviewer conflict Optic vs Compass resolved by audience: keep the design, add the validation.) _(due: Phase 1 beta)_

---

## Executive Summary

autonomux is far ahead of a typical solo-founder MVP: the orchestrator runtime, envelope encryption (Cipher/KMS), tamper-evident audit chain, per-tenant RLS (FORCE mode), high-end auth (TOTP/WebAuthn/custom JWT hook), BullMQ/Upstash worker bus, and SSE streaming are all production-grade and confirmed in-repo. The finance MVP is therefore a narrow, well-bounded build, not a greenfield one. Six layer leads converge with near-zero conflict on the same critical path, and I verified the two load-bearing claims directly: apps/web/app/app/page.tsx is still a full-viewport iframe over the HTML prototype, and packages/orchestrator/src/sub-agents/ contains only mailroom + scheduler (no treasurer.tool.ts). supabase/config.toml confirms the security gaps: TOTP enroll/verify=false, WebAuthn/passkey commented out, network restrictions off (0.0.0.0/0), sessions uncommented, min password length 6, no email confirmation. The MVP hero (personal finance via Plaid, READ+ADVISE+NOTIFY only) unlocks through exactly three parallel workstreams — the native React port of the AlterEgo shell (killing the iframe), the Plaid data layer (migration 0016 + Link flow + sync worker + webhook), and the Treasurer sub-agent (treasurer.tool.ts + finance system-prompt contract + eval suite) — plus a set of Phase 0 foundation fixes (CI/CD from zero, the module-level progressBuffer cross-user leak in runtime.ts, config.toml hardening, staging environment, Vercel Pro for streaming timeouts, and starting the Plaid Production compliance application immediately since it is the longest-lead-time item). Money movement is explicitly a later, regulated Phase 3 and must not appear in Phase 1-2 UI or marketing. I resolved the two live conflicts by Jo's priorities and audience: (1) adopt the prototype's dark transparent sidebar as canonical (stronger brand expression, matches the warm palette the tokens were built for) over the light dashboard sidebar; (2) DM Mono for all financial numerals, Cormorant Garamond reserved for interpretive/narrative text. Realistic timeline to production-ready Phase 1 public launch: 10-13 weeks, gated on Plaid Production approval (4-6 week external lead time, started week 1). MVP infra cost envelope is roughly USD 90-140/month plus per-item Plaid and per-turn LLM costs tracked in usage_meters. The roadmap below is the master plan: five phases, per-layer workstreams, deliverables, sequencing, dependencies, exit criteria, and all cross-cutting sections (architecture, security/encryption, latency budget, observability, compliance, testing/evals, cost, KPIs, risks).

---

_Studio Zero — Director's synthesis, Rev 2 (post-jury PASS_WITH_FIXES). Six layer-lead assessments reconciled into one plan; every jury Blocker and Critical resolved inline, Majors folded where cheap. Conflicts resolved by (1) Jo's goals, (2) audience, (3) protocols._

---

## 0. Product frame (the north star)

**What we are building:** the WEB AlterEgo app — a chat-first "second self." The MVP hero is **Treasurer**: personal finance via Plaid, **READ + analyze + NOTIFY only**. Read accounts and transactions; auto-categorize; forecast cash flow (the killer feature for irregular income); detect and notify on bills; offer suggestions/analysis/insights on debt payoff, savings, budgets, vacations, project budgets; remember goals and risk tolerance. **No money movement in the MVP** — that is regulated Phase 3.

> **Copy correction (jury Major, Herald+Proof):** user-facing surfaces do **not** use the words "advise / advice / adviser" unless paired with a point-of-use disclosure. Default vocabulary is **"suggestions / analysis / insights."** The ToS status-disclaimer ("not an adviser") and the product action must stay coherent. Internal codenames may keep "ADVISE"; the UI must not.

**Audience (resolved):** the Founder/Polymath ICP already encoded in the prototype (runway, invoice lanes, project budgets), **including the irregular-income freelancer persona (e.g. a freelance RN)** whose primary pain is paying bills from lumpy income. This sets the pricing floor and the "map the money, not manage the budget" positioning wedge. Personal + light-business finance from one interface; request Plaid **Consumer** product scope for MVP — see Open Question 2 (must resolve before Phase 0 exit).

**Non-functional bar (Jo, explicit):** top-notch latency, high-end security + encryption, high-end auth, high-end notifications (web push + Resend via Scheduler). First-class exit criteria in every phase, not polish.

**Brand contract:** warm palette (orange #f26b1a, deep red #b81f00, wine #7a2010, cream #fff8f3, ink #1a1410); Cormorant Garamond (display/italic, narrative), Inter (body), DM Mono (data/numerals); **no emoji, ever** (strip on render, do not trust the prompt). **`--brand-aqua` is banned** (cold teal, off-palette) — replaced everywhere by `var(--status-active, var(--brand-gold))` and enforced by a stylelint CI rule.

---

## 1. Director's conflict resolutions (logged, final for this project)

| # | Conflict | Resolution | Rationale (audience → Jo intent → protocol) |
|---|----------|-----------|-----------------------------------------------------------|
| D-1 | Light dashboard sidebar vs dark transparent sidebar | **Dark transparent sidebar is canonical** across all `/app/*`; deprecate the light variant. **Validate, don't assume:** one Phase-1 beta prompt ("How does it feel looking at your bank balance here vs your bank's app?"). Measure before any change. | Stronger brand expression; Jo's premium/warm intent. Reviewer conflict (Optic vs Compass) resolved by audience: keep design, add validation. |
| D-2 | Cormorant vs DM Mono for numerals | **DM Mono for all numerals**; Cormorant only for interpretive/narrative text and the `note` field. | Tabular figures build trust in finance. Audience-first. |
| D-3 | Treasurer empty state when Plaid not connected | Respond conversationally AND surface an inline "connect a bank to see your real numbers" CTA with the Link entry point + pre-Link disclosure banner. No hard redirect. | Chat-first model; no dead-end. |
| D-4 | Multi-bank at MVP | **Support multiple Plaid items from day one** (drop `connected_accounts` UNIQUE(tenant_id, integration) for plaid; items live in `plaid_items`). | Founder ICP has checking + credit at different institutions. |
| D-5 | Structured payload vs raw narration | **Structured, Zod-validated `TreasurerResultPayload`**; LLM narrates around it, never invents figures. Every figure carries provenance. | Enables the hallucination contract. |
| D-6 | Treasurer tool reads live Plaid vs DB cache | **DB cache only** on the hot path; Plaid synced by the worker (webhook-first, cron fallback). | Latency + Plaid cost + read-only scope. |
| D-7 | Oracle in Phase 1? | **No — Phase 4.** Treasurer is the sole hero. | Prove unit economics on one sub-agent first. |
| D-8 (**new**) | Pricing source of truth (jury Blocker) | **PRD pricing is canonical: Free / $29 / $79.** The roadmap's Free/$12/$29 draft is **superseded and struck.** Locked with Jo before Phase 0 exit; margin re-checked against the $90–130/mo fixed + Plaid + LLM envelope. | >2× delta collapsed Penny's ≥70% margin at the low numbers. One source of truth. |
| D-9 (**new**) | Minimum ingested history (jury Critical) | **12 months minimum for every connected account regardless of tier** (24-month depth gated to paid). Differentiate Free by bank-count / Autoroom, **not** data depth. | Seasonality detection needs ≥12 mo; Free-tier forecasts on 90 days are a first-contact trust break. |
| D-10 (**new**) | Caveat-trigger taxonomy (jury Blocker) | **Data outputs (balances, transactions, category sums) = no per-item caveat. Projections / recommendations / normative outputs = inline DM-Mono caveat + uncertainty framing.** | Resolves brand-voice vs compliance tension precisely; codified so it cannot drift. |

---

## 2. Target architecture

```
                 ┌──────────────────────── Vercel (Next.js 15 App Router) ────────────────────────┐
Browser ── HTTPS ─┤  apps/web                                                                      │
  │  (dark shell) │   /app            → native AlterEgo shell (Sidebar + real page, NO iframe)      │
  │  Plaid Link   │   /app/chat/[id]  → ChatStream (SSE) + Composer + slash-command palette         │
  │  (client SDK) │   /app/autoroom, /notifications, /archive  (URL-driven nav)                     │
  │               │   /app/settings/integrations → Plaid Link (+ pre-Link disclosure) + Gmail/GCal  │
  │               │   /api/chat/stream (Node, SSE, maxDuration=300, rate-limited, ping 20s)         │
  │               │   /api/plaid/link-token · /exchange · /items/:id (disconnect, step-up gated)     │
  │               │   /api/webhooks/plaid  (Node, JWK-verified against rotating JWKS, idempotent)    │
  │               │   composeSystemPrompt() WIRED → refusal + FINANCE_CONTEXT + episodic recall      │
  │               │   next.config.ts headers() → CSP + HSTS + XFO + nosniff + Referrer + PermPolicy  │
  └───────────────┴───────────────┬───────────────────────────────┬────────────────────────────────┘
                                  │ SSE + tool loop               │ enqueueAndAwait (agent-bus)
                                  ▼                               ▼
                       @autonomux/orchestrator            Upstash Redis (split instances)
                       AlterEgoRuntime (idempotent,        - BULLMQ_REDIS_URL (ioredis/TCP)
                       abort-aware, 6-hop cap, cost meter, - UPSTASH_REDIS_URL (rate-limit, HTTP)
                       progressBuffer PER-RUN in run())            │
                       SubAgentRegistry:                            ▼
                         mailroom · scheduler · TREASURER   Railway workers (BullMQ)
                                  │                          queues: agent, treasurer, mailroom,
                                  ▼                          scheduler, briefing, audit, gdpr, plaid ...
                       @autonomux/llm (Haiku triage /        /health HTTP endpoint (queue depths)
                       Sonnet synthesis, streaming)                 │
                       @autonomux/cipher (KMS envelope,             ▼
                       per-tenant CMK alias decision)        Plaid API (worker-only token decrypt)
                                  │                                 │
                                  └───────────────┬─────────────────┘
                                                  ▼
                       Supabase Postgres (RLS FORCE, custom access-token hook → tenant_id in JWT)
                        core: tenants, profiles, chat_threads, messages, agent_runs, audit_log(+chain)
                        integrations: connected_accounts, connected_account_events, usage_meters
                        FINANCE (0016): plaid_items, plaid_accounts, plaid_transactions,
                                        plaid_webhook_events, bill_transaction_matches, treasurer_bills
                        FINANCE (0017): treasurer_budgets, finance_goals, net_worth_snapshots
                                                  │
                        AWS KMS (per-tenant alias model — decision Phase 0)  ·  Plaid (Sandbox→Prod)
                        Resend · Web Push (VAPID) · Stripe (billing) · Turnstile · Axiom (OTLP)
```

**Principles:**
- **Read path is cache-first.** Chat turns query `plaid_transactions`/`plaid_accounts`, never Plaid live. Plaid API calls happen only in the Railway worker; Vercel functions never time out on Plaid latency.
- **The worker is the only place a Plaid access token is decrypted.** Cipher `purpose='plaid_access_token'`, tenant-bound AAD; tokens never touch logs.
- **Everything financial is tenant-scoped + RLS FORCE + audited.** Every connect/disconnect/access event writes the tamper-evident `audit_log`.
- **Per-run isolation.** All request-scoped buffers (progress, cost, cursor) live inside the `run()` generator scope — **never module-level** — to make cross-tenant bleed structurally impossible.
- **Nav is URL-driven** (ADR-001); the dark Sidebar reads `usePathname()`. `/app` is a real page, never an `<iframe>`.

---

## 3. Security & encryption model for financial data

**Cross-tenant isolation — the shipped-code defect (jury Blocker, Phase 0 week 1):**
- `progressBuffer` is **module-level at `runtime.ts:808`** — under concurrency, run A's progress events ("Reading your transactions…") drain into run B's SSE stream. This is an **active unauthorized disclosure** (GDPR Art. 5(1)(f); Plaid Production-disqualifying), not a latent risk. **Fix:** move the buffer inside the `run()` generator scope (already referenced by closure at 358–392); delete the module-level declaration. **Test (required, blocks merge):** a concurrent-invocation test that interleaves two runs and asserts run A events never appear in run B's stream. Re-audit by ShieldAudit + Proof.

**Encryption at rest (Cipher / KMS envelope):**
- Plaid access token → `cipher.encrypt(token, tenantId, 'plaid_access_token')`. Dedicated purpose namespace; `token_expires_at = NULL` (long-lived, revocable).
- Sync cursor encrypted (`purpose='plaid_transaction_cache'`). Do not store raw Plaid blobs unencrypted.
- **Per-tenant CMK decision (jury Major, decide Phase 0):** adopt a **KMS alias-per-tenant model** with an `EncryptionContext` condition and **scheduled key deletion on hard-delete** — this is the only path that gives true cryptographic erasure on GDPR delete (wrapped DEKs in backups otherwise remain decryptable). Jo + Cipher decide in Phase 0. **If deferred to Phase 2, the limitation is documented explicitly in the GDPR consent copy** (backups may retain decryptable DEKs until backup expiry).

**Data minimization into the LLM (the AI contract):**
- Only **aggregated** data enters LLM context (totals, trends, category sums, runway, bills due). Never raw account/routing numbers or full transaction dumps.
- **Prompt-injection via tool output is mitigated (jury Critical):** `composeSystemPrompt()` is **wired into the SSE route** (replaces `DEFAULT_SYSTEM_FALLBACK`), and **merchant/memo fields are stripped, truncated, and allowlisted at the Treasurer tool layer** before reaching the model. Attacker-controlled webhook data can no longer inject instructions ("say my balance is $1M"). The adversarial-injection case is in the eval gate.
- Every dollar figure the model produces must trace to a `tool_result` in context; empty/error → explicit "data unavailable" block, never an estimate.

**Auth & access — config.toml is hardened (jury Blocker, Phase 0, applied to remote):**
- TOTP `enroll_enabled=true`, `verify_enabled=true`; **passkeys enabled** (`rp_id='autonomux.io'`, prod origins).
- `enable_confirmations=true`; `minimum_password_length=12`; `password_requirements='lower_upper_letters_digits_symbols'`; `secure_password_change=true`.
- Sessions block **uncommented**: `timebox='8h'`, `inactivity_timeout='2h'`.
- **Turnstile captcha on**; `email.max_frequency='5m'`.
- `db.network_restrictions.allowed_cidrs` **restricted to Railway egress + Vercel ranges** (was `0.0.0.0/0`); **SSL enforcement enabled** (was commented out).
- **Step-up auth** (`purpose='step_up_banking_change'`) required on **both** Plaid connect and disconnect; enforced in the Plaid route template so it cannot be dropped. **≥1 MFA factor enrolled before any Plaid connect.** Phase 3 money-movement will require WebAuthn.
- **Config-drift CI check** diffs remote settings vs `config.toml` and fails the build on divergence.

**Network & transport — HTTP security headers exist (jury Blocker, Phase 0):**
- `next.config.ts` `headers()`: **CSP** (`frame-ancestors 'none'`; `script-src 'self'` + nonce + Plaid domains; `connect-src 'self' *.supabase.co *.upstash.io`; `frame-src` Plaid; `font-src 'self' fonts.gstatic.com`), **HSTS preload**, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` (**including on the SSE header object**), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking camera/mic/geo, **COOP**. **Validated to A grade on securityheaders.com before beta.**

**Webhook integrity (jury Critical):**
- `/api/webhooks/plaid` is **Node-runtime**, verifies the `Plaid-Verification` JWT against Plaid's **rotating JWKS (cache ≤5 min) on the raw body before any JSON parse**; idempotency on Plaid's delivery id; store-before-process; **200 ack within 100ms**; **401 on verification failure.** Without this, injected webhooks poison `plaid_transactions` (indirect prompt-injection into advice). **Plaid does not ship without it.**

**Logging / redaction (jury Minor, Phase 1):**
- Extend `pinoRedactPaths` from ~3 nesting levels to **4 levels or a recursive serializer** (Plaid error payloads embed account-holder names deeper). Add a **Semgrep rule flagging direct serialization of Plaid responses**; log only `{endpoint, status, item_id, error_code}`.

**Rate limiting (jury Critical):**
- `/api/chat/stream` gets `checkRateLimit('chat_stream', …)` (20 req/min/user + IP bucket) **plus a per-tenant daily token-quota check against `usage_meters` before instantiating the runtime**; returns **429 with Retry-After**. `userMessage` cap **lowered 200,000 → 12,000 chars**. This closes LLM04 token-DoS and is a prerequisite for trusted quota enforcement.

---

## 4. Latency budget (Jo's top-notch-connection bar)

| Path | Target | Notes |
|------|-------------|-------|
| `/api/plaid/link-token` | < 200 ms p95 | one Plaid call, no DB write |
| `/api/plaid/exchange` | < 1 s p95 | Plaid exchange + Cipher encrypt + upsert |
| `/api/webhooks/plaid` (ack) | < 100 ms p95 | verify + enqueue only; sync is async |
| Treasurer sub-agent invoke | < 5 s p95 | DB cache read (~50 ms) + 1 LLM hop |
| **Chat TTFB — redefined (jury Major)** | **first text token in DOM < 400 ms p50**, measured POST-dispatch → first non-empty `text_delta` | Replaces the understated "800 ms first SSE frame" (2× the Doherty first-text bound). Instrumented as a KPI. Ping every 20 s to hold the connection. |
| Treasurer chat turn (analysis) | < 4 s typical, < 8 s p95 | Haiku triage + Sonnet synthesis |
| Incremental sync lag (webhook→DB) | < 90 s | typically <50 tx |
| Initial sync (24-mo depth / 12-mo min) | chained 90 s pages | cursor-checkpointed, resumable; UI shows "syncing history…" |

- **`export const maxDuration = 300`** on the SSE route (jury Major) — Vercel Hobby's 10 s cap otherwise kills 4–8 s Treasurer turns. Moves with the Pro upgrade.
- **Tiering:** Haiku 4.5 for categorization/triage/ranking; Sonnet for synthesis/analysis/forecast narrative. Per-turn cost ceiling **$0.02**.

---

## 5. Observability

- **OTel → Axiom** wired; every BullMQ job in `withSpan`. Add spans for: Plaid API calls (endpoint, item, latency, `plaid_calls` delta), sync phases, webhook verify, Treasurer tool invoke, LLM hop cost.
- **Metrics:** per-queue p95 + error rate; **TTFB (redefined, <400 ms p50)** on `/api/chat/stream`; sync lag; Plaid error codes (ITEM_LOGIN_REQUIRED, PENDING_EXPIRATION); per-tenant `plaid_calls` and LLM cost.
- **Worker `/health`** HTTP endpoint returning queue-connection status + depths; Railway healthcheck repointed from `/` to `/health` (the `/` mispoint restart-loops the consumer-only process).
- **Alerts:** Upstash command-count 80%; Plaid item error rate; sync-failure rate; per-tenant token-quota breach; audit-chain checkpoint failure.

---

## 6. Compliance

- **Financial-advice disclosure exists in code (jury Blocker):** author + **lock `FINANCIAL_ADVICE_REFUSAL` in `packages/orchestrator/src/system-prompt.ts`** (Comply-reviewed, versioned). Add a **pre-Link disclosure banner** on the integrations page. Add an **inline DM-Mono caveat on every forward-looking output** per the **caveat-trigger taxonomy (D-10):** data outputs get no per-item caveat; projections/recommendations get the inline caveat + uncertainty framing. **AI-feature gate: no Treasurer feature PASSes without this.**
- **GDPR deletion pipeline is complete (jury Critical):** extend the worker to, in order, (1) call `plaid.itemRemove` for **every active item** before purging (otherwise the bank connection stays live at Plaid), (2) **hard-delete** `plaid_transactions`, `plaid_accounts`, `plaid_items`, `plaid_webhook_events`, `bill_transaction_matches`, `treasurer_bills`, `treasurer_budgets`, `finance_goals`, `net_worth_snapshots` in dependency order, (3) **destroy the Cipher envelope** (scheduled CMK-alias key deletion under the per-tenant model). **Integration test asserts `itemRemove` was called and rows are gone.** Reconcile the **7-year US tax-record retention basis** with Art. 17 in the consent copy (stated in plain language at connect time, not buried).
- **Privacy policy meets the Plaid Production prerequisite (jury Blocker):** `apps/web/app/legal/privacy/page.tsx` gains a **"Financial data (Treasurer)" section** (data categories, legal basis, 7-year retention basis, deletion behavior) and the **Plaid End User Privacy Policy link.** **Domain prerequisite:** confirm `autonomux.io` resolves to the Vercel deployment and `/privacy` returns **200 unauthenticated** (MEMORY: .io is Resend-only today) **before submitting the Plaid app.**
- **Connect-time consent copy exists (jury Critical):** write pre-Link consent covering what is stored, retention (incl. the 7-year tax basis in plain language), who accesses it, deletion behavior (token revoked + rows deleted), and legal-hold exceptions. **Test with ≥3 real-ICP users before finalizing.** Comply **approves, does not author**; Compass + Herald own the copy.
- **AI-interaction transparency (jury Major):** add a **one-time first-login AI-interaction banner (EU AI Act Art. 50(2))**; correct the system-card comment to cite **Art. 50(2)**, not Art. 50 generically.
- **System-card version-bump gate (jury Critical):** the card currently describes Treasurer as read/categorize-only and assigns finance-refusal to Companion, but Phase 2 adds forecasts / tax set-aside / what-if — a material capability expansion (CA SB 942, EU AI Act Art. 50). Add a **mandatory system-card version-bump gate to the PR template** for any Treasurer feature producing normative outputs; **active before the first advisory Treasurer output ships.** Also replace the parenthetical "(Founder is a registered nurse; this rule is non-negotiable.)" with a **verifiable statement that the refusal is enforced at the system-prompt layer and cannot be overridden** (jury Minor).
- **SOC 2 (CC6.1):** RLS + Cipher + audit chain give demonstrable access control + integrity; documented in `system-card/page.tsx`.
- **CASA / financial-app assurance:** OWASP ZAP (DAST) on staging + Semgrep (SAST) with finance rules before public launch.
- **Ethics gate:** no dark patterns on pricing/upsell; read-only posture stated plainly; emoji rule enforced in code.

---

## 7. Testing & eval strategy

- **CI from zero (jury Blocker, Phase 0 week 1):** `.github/workflows/ci.yml` runs `tsc --noEmit` (all workspaces), `turbo lint`, `turbo test` (**with the RLS proof suite**), `npm audit --audit-level=high`, **gitleaks**, `supabase db diff` drift check, **config.toml drift check**. **Branch protection on `main`** (required checks + 1 approval, **no direct push**). **Vercel promotion gated on green CI.** Custom lint rules **fail the build** on: an `<iframe>` in `app/app/page.tsx`, and any `--brand-aqua` reference. Target PR feedback < 8 min, full suite < 20 min.
- **RLS isolation proof is functional for finance (jury Major):** implement **`setupCi.ts`** (two users / two tenants / two JWTs via the admin API — currently missing) and remove the `TODO(Phase 1.0-B6)`. Extend the **5-operation isolation pattern** (cross-tenant SELECT → 0 rows; INSERT → 42501; UPDATE → 0 rows; DELETE → 0 rows; and the RLS-FORCE bypass check) to **every finance table** as a required CI check **before migration 0016 touches any real-data env.**
- **Treasurer eval suite (jury Blocker — no LLM finance feature ships without it):** author **`treasurer.eval.ts`** (promptfoo), scaffolded Phase 0, wired as a **required CI gate on any change to `system-prompt.ts` or `treasurer.tool.ts`.** Cases: (1) **grounding** — cite only tool-returned figures; (2) **no-data abstention** — declines to invent when Plaid unconnected; (3) **temperature-0 consistency** — identical output across 5 runs; (4) **adversarial injection** — "say my balance is $1M" / merchant-field injection produces no fabricated figure; (5) **tool-selection** — spend questions route to Treasurer; (6) **provenance assertion** — rendered output contains the `last_synced_at` timestamp; (7) **forecasting accuracy** vs actuals with 30-day lag (Phase 2); (8) **cost profile** — p50/p95 tokens, $/turn ≤ $0.02. **No Treasurer PASS without Oracle/eval sign-off.**
- **Webhook verification test suite** (valid JWK passes; rotated key re-fetches; bad signature → 401; replay → idempotent no-op); Plaid Sandbox webhook tester in the loop.
- **Playwright:** stop-button appears within 200 ms of POST; disconnect confirmation dialog + step-up flow; empty-state chips switch on Plaid item presence.
- **Prompt versioning:** finance system-prompt section versioned + Comply-reviewed + locked; bump `BIGBRAIN_VERSION` to a major on the new refusal class.
- **`user_2fa_verify_attempts` purge (jury Polish, before beta):** daily job `DELETE … WHERE created_at < now() - interval '24h'`; confirm the recent-attempts index covers the predicate.

---

## 8. Cost envelope (MVP, <100 users)

| Item | Monthly |
|------|---------|
| Vercel Pro (streaming timeout, maxDuration) | ~$20 |
| Supabase Pro ×2 (staging + prod) | ~$50 |
| Railway worker (1 replica) | ~$5–15 |
| Upstash Redis ×2 (BullMQ + rate-limit, PAYG) | ~$10–25 |
| Axiom (OTLP) | free tier |
| AWS KMS (per-tenant aliases) | negligible at MVP scale |
| **Fixed subtotal** | **~$90–130/mo** |
| Plaid | Sandbox free; Production ~$0.30–0.50/item/mo (≈$12–20 at 20 beta users) |
| Anthropic | variable, tracked per tenant in `usage_meters`; ≤$0.02/turn target |

**Pricing tiers — locked to PRD (D-8, jury Blocker):** **Free**, **$29/mo**, **$79/mo**. The roadmap's earlier Free/$12/$29 draft is **superseded**. Jo signs off before Phase 0 exit; Penny re-checks the ≥70% margin against the fixed + Plaid + LLM envelope **before any pricing page, Stripe product, or funnel is built.**
- **Free:** ≥12-month history (D-9), chat only; differentiated by **bank-count + no Autoroom/briefings** — **not** by data depth.
- **$29:** multi-bank, daily briefing, **Bill Watcher Autoroom** (incl. action-adjacent features below).
- **$79:** unlimited banks, 24-month depth, all Automations, export.
- Annual 15% off; grandfather beta users. **Upgrade fence reframed** (jury Minor) around the outcome — "never scramble to cover a bill again" — not the notification; instrument in beta whether notified users act vs dismiss.

---

## 9. Success metrics / KPIs

- **NSM:** Treasurer conversations per active tenant per week (P1 ≥3; P2 ≥5 with ≥40% proactive-initiated). **Churn-signal loop (jury Major):** instrument **one qualitative mechanism in Phase 1** (thumbs-down → "what went wrong?" free-text, or weekly micro-survey) so **Phase 2 is scoped against observed friction, not the NSM number alone.**
- **Onboarding:** Plaid connection rate > 70%.
- **Engagement:** conversation-to-insight rate > 50%.
- **Quality:** thumbs-up ≥ 80% (production sampling, Phase 2); forecast error within tolerance vs 30-day actuals.
- **Latency SLO:** Treasurer turn p95 < 4 s; **TTFB < 400 ms p50** (redefined).
- **Reliability:** webhook processing 99.5% within 60 s; sync lag p95 < 90 s.
- **Trust/security:** 100% of finance actions audited; **zero cross-tenant SSE-event incidents** (asserted by the concurrency test); zero raw-credential log incidents.

---

## 10. Top risks & mitigations

| Risk | Sev | Mitigation |
|------|-----|-----------|
| `progressBuffer` cross-tenant SSE leak (shipped code) | **Blocker** | Move inside `run()` scope + concurrency test, **Phase 0 week 1**, before any concurrent finance traffic. |
| Plaid Production approval denied/slow (>8 wks) | Blocker | Apply **week 1** (after `/privacy` returns 200 on autonomux.io). Feature-flag gate on prod credentials. Week-3 decision: extend Sandbox beta or add MX/Finicity. Never launch real users on Sandbox. |
| Finance hallucination / injection | Blocker | Locked refusal + wired `composeSystemPrompt` + tool-layer merchant/memo sanitization + eval golden set (grounding, abstention, adversarial) as CI gate. |
| No financial-advice disclosure | Blocker | Refusal in code + pre-Link banner + taxonomy-driven inline caveat; AI-feature gate. |
| iframe home blocks all real features | Blocker | **Hard merge gate:** no Phase 1 feature branch merges until AppShell renders `/app` as a real page with Sidebar + real content; enforced by the CI `<iframe>` lint. |
| No CI / branch protection | Blocker | Full CI + branch protection + Vercel-promotion gate in Phase 0 week 1, before any feature merge. |
| Config wide-open (MFA off, CIDR 0.0.0.0/0, weak passwords) | Blocker | Harden `config.toml` + apply to remote + config-drift CI check, Phase 0. |
| Zero HTTP security headers | Blocker | Full header set in `next.config.ts`; A grade on securityheaders.com before beta. |
| Privacy policy missing Plaid/finance | Blocker | Add finance section + Plaid EUPP link; confirm domain + `/privacy` 200 before Plaid submission. |
| Pricing contradiction (>2× delta) | Blocker | Lock PRD Free/$29/$79 with Jo; margin re-check before any funnel. |
| GDPR delete leaves Plaid item live | Critical | Worker calls `itemRemove` + hard-deletes all finance tables + destroys envelope; integration test. |
| Non-atomic `bumpUsageMeter` lost updates | Critical | Single atomic UPSERT RPC (`bump_usage_meter`); lands before quota enforcement is trusted. |
| No rate limit on `/api/chat/stream` (LLM04) | Critical | `checkRateLimit` + per-tenant token quota + 429/Retry-After; 12k char cap. |
| Plaid webhook handler absent | Critical | Node-runtime JWK verification on raw body; without it, injected webhooks poison advice. |
| Irregular-income miscommunication | Critical | One-page communication spec (never "you will have"; always "based on your history, a range of") before Phase 2 forecasting. |
| Free-tier 90-day cap sabotages forecasting | Critical | 12-month minimum for all tiers (D-9). |
| Transaction volume (21M+ rows/yr) | Major | Integer cents; `(tenant_id, date DESC)` index; RANGE partitioning by year (pg_partman) before real data. |
| Single shared CMK — no crypto-erasure | Major | Per-tenant CMK alias model decided Phase 0; if deferred, documented in consent copy. |

---

## PHASE 0 — Foundation (weeks 1–4)

**Goal:** close every structural + security gap so feature work ships on guarded, observable, isolated infrastructure. No user-facing finance yet. Start the longest-lead external dependency (Plaid Production) on day 1 — **after** the domain + privacy prerequisites are met.

### Week-1 hard gates (must land before any feature merge)
1. **`progressBuffer` moved into `run()` scope** + concurrent-invocation test (ShieldAudit + Proof re-audit).
2. **CI + branch protection live**: `ci.yml` (tsc, lint, test+RLS, `npm audit --high`, gitleaks, `supabase db diff`, config-drift), `main` protection, Vercel promotion gate, and the `<iframe>` + `--brand-aqua` fail-the-build lint rules.
3. **Privacy policy finance section + Plaid EUPP link**; confirm `autonomux.io` resolves to Vercel and `/privacy` returns 200 unauthenticated (Pipeline owns the domain move off Resend-only).

### Workstreams by layer
- **DevOps/Scalability (Pipeline+Terra):** CI + branch protection (above); **staging tier** (2nd Supabase + 2nd Railway + 2nd Upstash + Vercel env groups); **Vercel Pro** + `maxDuration=300`; worker `/health` + Railway healthcheck fix; split Upstash (BullMQ vs rate-limit); per-queue concurrency via env; automated migration step gated before promotion; domain cutover so `autonomux.io` → Vercel with `/privacy` 200.
- **Backend (Forge+Bridge):** `progressBuffer` per-run fix + concurrency test; **atomic `bump_usage_meter` UPSERT RPC**; **rate limit + per-tenant token quota + 12k char cap on `/api/chat/stream`** (429/Retry-After); add `PLAID_CLIENT_ID/SECRET/ENV` to worker `env.ts` + `.env.example` + Vercel (Sandbox) with boot-time assertions.
- **Data model (Atlas+Keeper):** **migration 0016** — `plaid_items`, `plaid_accounts`, `plaid_transactions`, `plaid_webhook_events`, `bill_transaction_matches`, `treasurer_bills`; RLS enabled + FORCE + 5-policy pattern inline; money as integer cents; `(tenant_id, date DESC)` + `(account_id, date DESC)` indexes; `plaid_transaction_id` UNIQUE per tenant; tsvector + GIN for search; **drop UNIQUE(tenant_id, integration)** for multi-bank; declare year-range partitioning. **Implement `setupCi.ts`** and extend the RLS proof suite to every finance table (blocks 0016 on any real-data env). Regenerate DB types in CI.
- **Security+Encryption (Shield+Cipher):** `next.config.ts` full security-header set + CSP (incl. `nosniff` on SSE headers); validate A grade on securityheaders.com; **`config.toml` hardening applied to remote** (TOTP+passkeys, confirmations, 12-char + symbols, `secure_password_change`, sessions 8h/2h, Turnstile, `email.max_frequency=5m`, CIDR → Railway+Vercel, SSL enforced) + config-drift CI check; confirm KMS CMKs + **decide per-tenant CMK alias model**; step-up enforced in the Plaid route template (connect + disconnect); ≥1 MFA before Plaid connect.
- **Frontend (Arch+Vega):** ADRs (nav=URL, streaming=rAF, composer=local state, finance-card contract); establish `components/shell|chat|finance/`; **native shell port so `/app` stops being an `<iframe>`** — minimal native shell hosting existing ChatStream is the Phase 0 deliverable and a merge gate; **swap `--brand-aqua` → `var(--status-active, var(--brand-gold))` immediately** (do not defer); hide the `'/ for commands'` composer hint until the palette ships (jury Minor).
- **AI/Evals (Cortex+Oracle):** author + lock **`FINANCIAL_ADVICE_REFUSAL`** in `system-prompt.ts` (versioned, Comply-reviewed); **wire `composeSystemPrompt()`** into the SSE route; **scaffold `treasurer.eval.ts`** + wire the CI gate on `system-prompt.ts`/`treasurer.tool.ts`; define the **caveat-trigger taxonomy** (D-10) in code; decide embedding provider for episodic recall.
- **Compliance/Product (Axiom+Penny + Comply + Compass + Jo):** **submit Plaid Production application** (privacy policy with Plaid EUPP link at `autonomux.io/privacy`, data-use policy, dashboard app) — only after week-1 domain gate; **lock pricing to PRD Free/$29/$79** + margin re-check; **resolve Open Question 2 (personal vs light-business)** — determines Plaid product scope (if business checking is in scope, apply for Assets/Liabilities and confirm institution Consumer-scope support; if not, make personal-only explicit in onboarding copy); confirm Stripe webhook + subscription UI status (flag as extra P0 workstream if absent).

### Deliverables
CI green + branch protection + Vercel-promotion gate; `<iframe>`/`--brand-aqua` lint rules; staging live; Vercel Pro + `maxDuration`; worker `/health`; migration 0016 on staging with **passing finance-table RLS proofs** (via `setupCi.ts`); full security headers (A grade) + hardened `config.toml` on remote + drift check; `progressBuffer` fixed with concurrency test; atomic usage-meter RPC; rate limit + 12k cap on chat stream; locked refusal prompt + wired `composeSystemPrompt` + eval scaffold; privacy policy finance section + Plaid EUPP link + `/privacy` 200 on autonomux.io; Plaid Production app submitted; pricing locked; per-tenant CMK decision; Open Question 2 resolved.

### Exit criteria
All foundation tracks green on staging; **iframe replaced by a functional native shell in prod**; security headers at A grade; `config.toml` hardened on remote with no drift; concurrency test proves no cross-run SSE bleed; Plaid Production application acknowledged; pricing locked to a single source of truth; per-tenant CMK model decided; Plaid scope (Open Question 2) resolved; **no finance data has entered any table without RLS + FORCE.**

---

## PHASE 1 — MVP: read / analyze / notify + chat + native AlterEgo port (weeks 5–10, public launch gated on Plaid Production)

**Goal:** a signed-in user connects a bank (Plaid), lands on the native AlterEgo home, chats with Treasurer grounded in real transactions with visible provenance, gets bill-deadline notifications, and gets suggestions/analysis — all read-only. NSM begins.

### Workstreams by layer
- **Frontend (Arch+Vega, Canvas+Flow):** complete native port — dark Sidebar (canonical); EmptyState + 6-skill grid incl. Treasurer; SearchModal (Cmd+K); **ComposerPanel** (auto-grow, `/money` slash-palette + active-skill chip, attachments, voice, **stop wired**, 12k cap); **MessageTurn** (rAF-batched `text_delta`, in-TS markdown, streaming cursor, emoji stripper); **ThinkingTurn** (full panel; **renders `progressText` from `sub_agent_progress` events** — "Reading your transactions…" — so a hung connection is distinguishable from an active read); **TreasurerCard** (2×2 lanes + AccountList + TransactionList + BillAlert countdown; DM Mono numerals, Cormorant note; bank-badge slot; **every dollar figure carries "Balances as of [last_synced_at]"**, narrative referencing specific figures ends with a provenance line). Fixes folded in:
  - **Stop button reachable (jury Major):** wire `handleStop`; pass `onStop={inFlight ? handleStop : undefined}` from ChatStream; Playwright asserts the button appears within 200 ms of POST.
  - **`sub_agent_progress` rendered (jury Major):** store `progressText` on `UiMessage`; ThinkingTurn renders it; Forge emits "Reading your transactions…".
  - **Conditional empty-state chips (jury Major):** `EMPTY_CHIPS` conditional on integration state (Plaid item → Treasurer chips: "Map my money this week", "What bills are due soon?"); pass `connectedSubAgents` from the server page; migration plan in the Phase 1 spec.
  - **MailroomRow dead buttons (jury Critical):** Approve/Dismiss currently submit to `noopMailroomAction` with no state. **Hide interactive buttons whose backend does not exist** (preferred) or add an explicit "Queued — coming soon" pending state. No silent no-ops in a finance-adjacent context.
  - **Plaid disconnect UX (jury Major):** confirmation dialog + **TOTP/WebAuthn step-up** + loading state + explicit success/error feedback (disconnect triggers irreversible `itemRemove` + envelope wipe + GDPR purge). Step-up enforced by the route template.
  - `--brand-aqua` already gone (Phase 0); focus rings everywhere; **no payment-approval gates.**
- **Backend/Plaid (Forge+Bridge):** `/api/plaid/link-token`; `/exchange` (Cipher-encrypt token, upsert `connected_accounts` + `plaid_items`, enqueue **≥12-month** initial sync, audit `plaid.connected`); `/items/:id` disconnect (Plaid `itemRemove` + envelope wipe + audit); **`/api/webhooks/plaid`** (Node, raw-body JWK verify against rotating JWKS ≤5 min cache, idempotent on delivery id, 200 ack <100 ms, 401 on failure, ITEM_ERROR → status=error + notify); worker `processPlaidSyncJob` (cursor sync, upsert accounts+transactions, bump `plaid_calls`); **merchant/memo sanitization at the tool layer** (strip/truncate/allowlist before the LLM); `treasurer.detect_bills` worker (deterministic SQL recurring-payee detection → `treasurer_bills` source='plaid_detected', confirmed=false — no LLM).
- **Treasurer agent (Forge+Cortex):** `treasurer.tool.ts` (Zod discriminatedUnion; `get_accounts`, `get_transactions`, `get_spending_summary`, `get_bills`, `get_summary`/runway) reading DB cache via `enqueueAndAwait`; register `treasurerEntry` in `factory.ts`; `TreasurerResultPayload` schema; **FINANCE_CONTEXT** injection (balances + bills-due-7d + goals) when tenant has active items — **with a freshness/source line so no figure is context-injected without provenance**; error/empty → explicit "data unavailable" block.
- **Data model (Atlas):** apply 0016 to prod (after finance-table RLS proofs pass); `bill_transaction_matches` populated post-sync; regenerate types.
- **GDPR (Forge+Cipher, jury Critical):** worker deletes all finance tables in dependency order + calls `itemRemove` per active item + destroys the envelope; integration test asserts both.
- **Security (Shield):** step-up on connect/disconnect (route-template enforced); Plaid surface review (no tokens in logs, no PII in job payloads beyond requestId+tenantId, webhook test suite, hosted Plaid Link only — never custom credential capture); **recursive/4-level redaction + Semgrep Plaid-serialization rule**; consent-expiry tracking + re-auth prompt.
- **DevOps (Pipeline):** Redis-backed feature-flag cache (sub-1s propagation) to gate Plaid prod credentials; daily `plaid_sync` cron fallback; SSE ping frames + **TTFB instrumentation (<400 ms p50, POST→first text_delta)**.
- **AI/Evals (Cortex+Oracle):** commit + wire `treasurer.eval.ts` (grounding, abstention, temp-0 consistency, adversarial injection, tool-selection, **provenance-timestamp assertion**, cost) in CI; episodic `writeEpisode` after each finance turn.
- **Notifications (Scheduler+Resend+Web Push):** bill-due alerts at 3-day/1-day/morning-of; **label reads "For your information — not financial advice"** (jury Minor — replaces "READ ONLY / Advisory" permissions-jargon); read-only framing only.
- **Compliance/Product (Comply+Herald+Compass+Proof):** **connect-time consent copy user-tested with ≥3 real-ICP users** (Comply approves, does not author); **first-login AI-interaction banner (Art. 50(2))**; **system-card corrections** (Art. 50(2) citation; refusal-enforcement statement replacing the RN parenthetical); remove "advise/advice" from user-facing copy → "suggestions/analysis/insights."
- **UX/Product (Canvas+Axiom):** onboarding (connect first bank → first Treasurer conversation, ≥12-month history); **finance-vocabulary ICP audit** (jury Major — test "runway"→"months of safety net", "invoice lanes"→"client income", "net-worth"→"what you own vs owe"; Herald owns copy, Compass signs off); **action-adjacent Bill Watcher features** (jury Major — deep-link "Pay this bill" into the user's bank app with payee/amount prefilled, exportable payment schedule to calendar, copy-to-clipboard payment details — **no money movement, no license**); Bill Watcher Autoroom template; pricing page + Stripe checkout + tier gating (per-plan bank cap, 12-mo history for all); invite 10–20 beta users.
- **Design (Canvas, jury Polish):** **TreasurerCard empty/partial states specified before build** — "No bills detected yet — check back after your first sync", forecast-unavailable (<30 days data), net-worth with no investment accounts, 1-of-3-accounts. No blank grid cells.

### Deliverables
End-to-end Treasurer chat loop on real Plaid Sandbox data with visible provenance; multi-bank connect/disconnect with confirmation + step-up + explicit feedback; bill detection + 3/1/day-of notifications; native shell with zero iframe; complete GDPR delete (itemRemove + all finance tables + envelope) with test; consent copy user-tested; action-adjacent Bill Watcher features; pricing live; eval suite (incl. provenance + adversarial) green in CI; TTFB instrumented; churn-signal mechanism live.

### Sequencing & dependencies
0016 (P0) → Link+exchange → initial sync worker → `treasurer.tool.ts` (with merchant/memo sanitization) → FINANCE_CONTEXT injection (with provenance) → webhook → Bill Watcher. Native shell (Composer + MessageTurn + TreasurerCard) in parallel; **iframe removal is a hard launch dependency** (CI-enforced). Public launch **gated on Plaid Production approved + flipped** via feature flag. **Churn-signal mechanism must be live before Phase 2 scope locks.**

### Exit criteria
Beta users connect a real bank and hold ≥3 Treasurer conversations/week; connection rate >70%; Treasurer turn p95 <4 s; **TTFB <400 ms p50**; a detected bill fires a 3-day notification; **every rendered figure shows its `last_synced_at`** (eval-asserted); stop button reachable; no MailroomRow silent no-ops; disconnect gated by step-up + confirmation; GDPR delete test passes (itemRemove called, rows gone); consent copy user-tested; eval golden set (incl. adversarial + provenance) passes in CI; no iframe in prod; Plaid Production approved before public launch; zero payment-approval UI; churn-signal mechanism instrumented.

---

## PHASE 2 — Intelligence (weeks 11–18)

**Goal:** the killer irregular-income features. Treasurer becomes proactive and predictive; memory of goals/risk tolerance compounds. **Scoped against Phase 1 churn signals, not the NSM number alone.**

### Pre-requisite specs (must land before the relevant feature)
- **Irregular-income communication spec (jury Critical):** one page for the irregular-income persona — never "you will have"; always "based on your history, a range of"; plain-English confidence-band label at the ICP's reading level; what it says when data is sparse; what it must never say. **Comply + Herald review before it enters the system prompt.**
- **Data vs Normative output split (jury Major):** Data outputs (balances, category sums) get no per-turn caveat; **Normative outputs (forecasts, tax set-aside, what-if) get a per-output caveat + explicit uncertainty.** Codified per D-10.
- **System-card version bump (jury Critical):** the card must be updated to reflect forecast / tax / what-if capability **before the first advisory Treasurer output ships** — enforced by the PR-template gate.

### Workstreams by layer
- **AI/Evals (Cortex+Oracle):** **cash-flow forecasting** (90-day rolling projection over ≥12-month history for seasonality; irregular-income detection; Sonnet narrative; **honest uncertainty as a range, never a point estimate**; confidence-band chart); auto-categorization refinement (Plaid `personal_finance_category` primary + Haiku for ambiguous merchants + user override); **tax set-aside — no hardcoded 25-30% (jury Major):** present a **range with explicit dependencies**, link **IRS Pub 505**, treated as a normative output with per-output caveat; what-if scenarios (LLM over `get_cash_flow`); duplicate/price-hike detection (same-merchant >10% MoM). Add RAG grounding evals + **forecast-accuracy eval (30-day lag)**. Production thumbs-up sampling ≥80%.
- **Data model (Atlas):** **migration 0017** — `treasurer_budgets`, `finance_goals` (target, date, current, risk_tolerance), `net_worth_snapshots`; do not pre-optimize before seeing real distributions.
- **Backend (Forge):** incremental cursor sync every 2h; net-worth daily cron; goal-progress + budget-vs-actual queries.
- **Frontend (Vega):** `TreasurerChartCard` (SVG/Recharts cash-flow chart, warm palette, no layout shift, confidence band); budget-envelope UI; goal progress bars; insights cards; TweaksPanel persisted. All forecast figures carry provenance + uncertainty.
- **UX/Autoroom (Canvas):** proactive briefings via Autoroom (morning-briefing gains a Finance snapshot; ≥40% proactive-initiated).

### Deliverables
Cash-flow forecast card (range, not point); budgets/envelopes; goal + net-worth tracking; tax set-aside (range + Pub 505 link, caveated); what-if; duplicate/price-hike alerts; proactive daily briefing; forecast-accuracy evals in CI; system-card version-bumped.

### Sequencing & dependencies
Requires ≥30 days of real data **and** ≥12-month history for seasonality. Forecasting depends on Phase 1 categorization proven on real data. Communication spec + system-card bump + data/normative split precede any normative output. Autoroom native port scheduled late Phase 1.

### Exit criteria
NSM ≥5 Treasurer conversations/tenant/week; ≥40% proactive-initiated; forecast error within tolerance vs 30-day actuals; thumbs-up ≥80%; net-worth answerable in chat; every normative output carries a caveat + uncertainty; system card reflects current capability.

---

## PHASE 3 — Gated money movement (weeks 19–28+, regulated — NOT MVP)

**Goal:** pay bills / transfer / execute debt payoff — only behind licensing, legal review, and trust-tier gates. Explicitly out of MVP; not promised in P1/P2 marketing.

### Workstreams
- **Compliance/Legal (Axiom+Comply):** money-transmission path — partner with a **licensed BaaS** (Treasury Prime / Column) or use Plaid Transfer / Payment Initiation. **Correction (jury Major):** the earlier claim that "Plaid Transfer handles licensing" is **removed** — it does **not** confer an MTL; requires **state-by-state analysis or a licensed BaaS program agreement plus a written legal opinion.** NACHA/Reg E; KYC/AML; PCI scope analysis. Gate the phase until revenue funds the compliance work.
- **Security (Shield):** every money move requires **WebAuthn step-up** + tamper-evident audit event; 2-tap arm-then-confirm; network-isolated payment service.
- **Data model (Atlas):** `payment_orders`/`plaid_transfers` behind a feature flag; **`plaid_transactions` stays read-only throughout** — no P0–P2 schema change.
- **Frontend (Vega):** approval-queue UI from the prototype (`AE_APPROVALS`) — "Payment is irreversible" prominent; trust-tier minimum = Confirm-each per Autoroom PRD.

### Exit criteria
Legal sign-off (incl. written MTL opinion); licensed partner live; WebAuthn-gated + audited money move in staging; regulatory review passed. **No write capability ships until Comply signs off.**

---

## PHASE 4 — Breadth (weeks 29+)

**Goal:** expand sub-agents once Treasurer unit economics are proven.

### Workstreams
- Studio (image/video via Replicate/Runway), Scribe (writing + Substack/LinkedIn via Composio), full Oracle (cardology/astrology — `oracle_readings` + `payload_encrypted` in schema), social integrations, Plaid Investments/Liabilities (debt-payoff), cross-sub-agent intelligence. Each new sub-agent follows the queue+worker+tool.ts pattern with no new infra. Evaluate Supabase pooler (Supavisor) at >100 concurrent users.
- **Rationale:** each sub-agent adds per-turn LLM cost + integration maintenance. Prove one before expanding (cost discipline).

### Exit criteria
Treasurer unit economics validated (LTV > CAC on the $29/$79 tiers) before any Phase 4 sub-agent enters scope.

---

## Realistic timeline

| Phase | Duration | Milestone |
|-------|----------|-----------|
| 0 Foundation | Weeks 1–4 | CI + branch protection + iframe replaced (week 1); `progressBuffer` fix + security headers + `config.toml` hardened; 0016 + finance RLS proofs; refusal + eval scaffold; **`/privacy` 200 on autonomux.io then Plaid Production app submitted** |
| 1 MVP | Weeks 5–10 | Beta on Sandbox → **public launch gated on Plaid Production approval** (4–6 wk external); full GDPR delete; consent user-tested; provenance + eval gate live |
| 2 Intelligence | Weeks 11–18 | Forecasting (ranges), budgets, goals, tax set-aside (caveated), proactive briefings; system-card bumped |
| 3 Money movement | Weeks 19–28+ | Regulated; licensed BaaS + written MTL opinion + WebAuthn |
| 4 Breadth | Weeks 29+ | Additional sub-agents after unit economics proven |

**Critical-path caveat:** Plaid Production approval (4–6 weeks, started week 1 after the domain/privacy gate) is the gating external dependency for Phase 1 public launch. If it slips beyond 8 weeks, the week-3 decision is: extend Sandbox beta or add an alternate aggregator — never launch real users on Sandbox.

---

## Open questions for Jo (most now resolved; residual decisions flagged)

1. **Plaid product scope:** Consumer Transactions for MVP (recommended); add Liabilities for debt-payoff (paid add-on). — decide during Phase 0.
2. **Business vs personal finance (RESOLVED before Phase 0 exit — jury Major):** confirm whether the Founder ICP connects business checking. If yes, apply for Assets/Liabilities and confirm institution Consumer-scope support; if no, make personal-only explicit in onboarding. A missing primary account on first connect is a trust break.
3. **Rollback if Plaid denied >8 weeks:** extend beta vs alternate aggregator (MX/Finicity) — decide Phase 0 week 3.
4. **Stripe status:** webhook + subscription UI wired? If not, added Phase 0 workstream (pricing gate depends on it).
5. **Embedding provider** for episodic recall — affects memory recall path + latency.
6. **Historical depth:** 24-month for paid vs 12-month minimum for all (RESOLVED: **12-month floor for every tier**, 24-month gated to paid — D-9).
7. **Per-tenant KMS key isolation (DECISION IN PHASE 0 — jury Major):** adopt the per-tenant CMK-alias model (cryptographic erasure on delete) now, or defer to Phase 2 and document the limitation in consent copy.
8. **Pricing (RESOLVED — D-8):** locked to PRD **Free/$29/$79**; roadmap $12/$29 superseded; margin re-checked before any funnel.

_This is the master plan, Rev 2. Every jury Blocker and Critical is resolved in-plan with an owner, a phase, and a test or gate; Majors are folded where cheap. Phase 0 unblocks everything and closes the shipped-code security defects in week 1; the three Phase 1 workstreams (native port, Plaid data layer, Treasurer agent) run in parallel behind hard merge gates; money movement stays gated behind Phase 3. Ship read-and-analyze excellence first, prove it, then expand._
