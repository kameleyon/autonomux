# Autonomux — Detailed Roadmap

**Version:** 0.1 (draft)
**Date:** 2026-05-29
**Owner:** kameleyon
**Companion docs:** [PRD.md](./PRD.md)
**Status:** Phase 1 scoped to sprint level · Phase 2-7 scoped to deliverables · Phase 8+ exploratory

---

## How to read this doc

| Symbol | Meaning |
|---|---|
| **🔒** | Decision locked — change requires founder sign-off |
| **⚠️** | Risk to flag in standup |
| **🛂** | Compliance gate — cannot skip |
| **🎯** | Phase-exit gate — must be green to start next phase |
| **[Persona]** | Studio-zero persona accountable for the deliverable |
| **+Dn** | Day relative to phase start |
| **Concurrent** | Workstream runs in parallel with the main sprint |

---

## Phase summary

| Phase | Name | Duration | Exit gate | Founder bet |
|---|---|---|---|---|
| **v0.1** ✓ | Cardology Weekly Tool | 1 day | Live at autonomux2/ | Proved the data model |
| **v1.0** | Foundation | 3-5 weeks | Jury PASS WITH FIXES on infrastructure | Production scaffolding done |
| **v1.1** | Mailroom + Scheduler (read) + Briefing | 3-4 weeks | First real briefing delivered to founder daily | Wedge product |
| **v1.2** | Mailroom write + Companion v1 | 2-3 weeks | Daily reply drafts working | Earn write trust |
| **v1.3** | Scribe + Substack auto-publish | 2-3 weeks | First cardology weekly auto-published to existing Substack | Content lane closes |
| **v1.4** | Oracle full (astrology + tarot + cardology) | 2-3 weeks | Daily reading section live in briefing | Woo-woo lane closes |
| **v1.5** | Treasurer (Plaid) + Capacitor native | 4-5 weeks | Plaid prod approved + iOS app submitted to TestFlight | Money lane closes |
| **v1.6** | Voice (chat + broadcast) + Polish | 2-3 weeks | Founder uses AlterEgo as primary daily UI | Founder validation complete |
| **v1.7** | Multi-tenant launch | 4-6 weeks | First external paying user converts | Public launch |
| **v2.0+** | Outlook · YouTube sync · Companion v2 · International · Marketplace | Quarter by quarter | TBD per phase | Scale |

**Founder dogfood window:** v1.0 through v1.6 (~14-20 weeks) the only user is the founder. v1.7 opens to others.

---

## Phase 1.0 — Foundation (sprint-detailed)

**Duration estimate:** 3-5 weeks (15-25 working days)
**Lead:** [Arch]
**Concurrent:** CASA Tier 2 prep (Comply) · Vanta init (Comply) · Hosting account provisioning (Terra)

### Goals

1. Monorepo + every shared package shipped + typed
2. Supabase schema + RLS + audit chain + encryption-at-rest working end-to-end
3. Auth + admin cpanel shell + observability + CI/CD operational
4. Foundation Jury audit lands PASS WITH FIXES ≥ 70/100

### Sprint plan

#### Sprint 1.0-A · Days 1-5 · "Skeleton up"

| # | Task | Owner | Output |
|---|---|---|---|
| A1 | Init monorepo (Turborepo + pnpm) | [Arch] | `package.json` workspaces, turbo.json, ESLint + Prettier + TS configs shared |
| A2 | `apps/web` Next.js 15 + design tokens skeleton | [Forge + Vega] | Landing-marketing structure, dark-friendly tokens, navigation primitives |
| A3 | `apps/admin` Next.js 15 separate auth + skeleton | [Forge] | Admin landing, login, tenant list shell |
| A4 | `apps/worker` Node 20 + BullMQ + Upstash Redis + Railway deploy + 1 sample fn | [Forge + Pipeline] | Local dev runs cron sample, Railway picks it up |
| A5 | `packages/db` — Supabase schema migrations: tenants, users, sessions, audit_log, activity_log | [Atlas] | Migrations run cleanly, RLS on |
| A6 | `packages/ui` — Button, Form, Input, Card, Nav, Footer, Dialog (warm palette + `--r-xl`) | [Vega + Halo] | Storybook deployed or doc page |
| A7 | `packages/cipher` — libsodium envelope encryption, AWS KMS wrapper, per-tenant key derivation | [Cipher] | Encrypt/decrypt round-trip test passes |
| A8 | `scripts/preflight.mjs` (port from studio-zero) — 10 static checks | [Probe] | Runs in <2s, fails on banned words / undefined CSS vars / etc. |
| A9 | GitHub Actions CI: install → lint → typecheck → unit → preflight | [Pipeline] | CI green on init commit |
| A10 | Vercel + Supabase + Railway + Upstash + Doppler + Axiom + Sentry accounts wired | [Terra] | First deploy to staging, log line flows to Axiom |

🎯 **Sprint 1.0-A exit:** First page renders at staging URL · CI green · monorepo + 4 apps + 6 packages compile

#### Sprint 1.0-B · Days 6-10 · "Auth + audit chain"

| # | Task | Owner | Output |
|---|---|---|---|
| B1 | Supabase Auth integration: email + Google + Apple sign-in | [Forge + Shield] | Sign up + sign in flows work |
| B2 | TOTP enrollment + verification flow | [Forge + Cipher] | Mandatory 2FA at signup live |
| B3 | WebAuthn / Passkeys enrollment (optional 2nd factor) | [Forge + Cipher] | Passkey login works on supported devices |
| B4 | `packages/audit` — audit log writer + Merkle chain signer | [Atlas + Cipher] | Every write to user data writes a chained audit row |
| B5 | `packages/logger` — Pino + Axiom shipper + Sentry hook + redaction rules ported from studio-zero | [Watch] | Test event flows through, redacts PII |
| B6 | Tenant-scoped Supabase client helper (`createTenantClient`) | [Forge + Atlas] | Cross-tenant query attempt fails RLS in test |
| B7 | Session middleware + tenant-from-JWT extraction | [Forge] | API routes auto-receive `tenant_id` |
| B8 | Rate limiting (Upstash Redis) — per-IP, per-user, per-route | [Shield] | 429 on abuse, audit log captures |
| B9 | Cookie consent banner (GDPR-correct) + analytics gate (port from studio-zero) | [Comply + Hook] | Banner blocks non-essential cookies until consent |
| B10 | OpenTelemetry tracing instrumentation in `apps/web` + `apps/worker` | [Watch] | Traces visible in Axiom / Tempo |

🎯 **Sprint 1.0-B exit:** Founder can sign up · enroll TOTP · log in · their session writes 4+ audit rows · admin cpanel can find their tenant

#### Sprint 1.0-C · Days 11-15 · "Admin cpanel + compliance docs"

| # | Task | Owner | Output |
|---|---|---|---|
| C1 | Admin cpanel: tenant list with filtering + drill-down + per-tenant snapshot | [Forge + Vega] | Admin can see all tenants, drill into 1, see counters |
| C2 | Admin cpanel: audit log viewer (searchable, filter by tenant + action + date) | [Forge + Atlas] | Audit trail visible, chain verify button works |
| C3 | Admin cpanel: activity log mirror | [Forge] | Same activity log a user sees, surfaced for support |
| C4 | Admin cpanel: cost dashboard skeleton (no real LLM costs yet — instrumentation hooks in place) | [Forge + Penny] | Cost panel renders with $0 placeholders |
| C5 | Admin cpanel: integrations health board (skeleton — populated v1.1) | [Forge] | Empty board with placeholders renders |
| C6 | Admin cpanel: feature flags console — GrowthBook OR self-hosted minimum | [Lens + Forge] | Toggle flag, web app reflects change |
| C7 | GDPR export job (BullMQ job on Railway worker) + UI button in user Settings | [Atlas + Comply] | Export runs, produces .zip with all user data, emails download link |
| C8 | GDPR deletion job + UI confirm flow (30-day soft delete + final hard delete + audit) | [Atlas + Comply] | Deletion runs, account gone, audit log retained per policy |
| C9 | Privacy Policy + Terms of Service + DPA + Cookie Policy — drafted + lawyer-reviewed | [Comply + Herald] | All 4 docs live at /legal/* |
| C10 | Security page (security.autonomux.io) + AI System Card + Subprocessor list | [Comply + Herald] | Live at /security |

🎯 **Sprint 1.0-C exit:** Admin can manage one tenant end-to-end · GDPR export + deletion run cleanly · all legal docs live

#### Sprint 1.0-D · Days 16-20 · "Jury audit + remediation"

| # | Task | Owner | Output |
|---|---|---|---|
| D1 | Run Foundation Jury audit: Optic + Proof + Halo + Compass + Trace + Canon + Cipher pen-test stub | [Jury] | 6 reviewer reports + Jury synthesis · honest verdict |
| D2 | Address Blockers (whatever surfaces) | [Forge + Halo + Cipher + others] | All Blockers cleared, verified by owning reviewer |
| D3 | Address Criticals | [Forge + others] | Same |
| D4 | Vanta — initial security review run · evidence gathering started | [Comply + Cipher] | Vanta dashboard populated, gap list known |
| D5 | CASA Tier 2 submission package drafted (Gmail restricted scopes) | [Comply] | Package ready to submit when first beta user signs up |
| D6 | Preflight CI gate enforced (no merge without preflight green) | [Pipeline + Probe] | Branch protection rule active |
| D7 | Studio-zero PRD-style claim substantiation pipeline ported | [Proof + Comply] | First substantiation files written + verified |
| D8 | Initial pen-test scope letter sent to external firm | [Cipher] | Quote requested |

🎯 **Phase 1.0 exit:** Foundation Jury PASS WITH FIXES ≥ 70 · Vanta started · CASA package ready · Founder can use admin cpanel to support themselves as the first tenant

### Phase 1.0 deliverables checklist

- [ ] Turborepo monorepo with `apps/web`, `apps/admin`, `apps/worker`, `packages/db/ui/cipher/composio/plaid/logger/audit/orchestrator/oracle`
- [ ] Supabase schema with RLS on every tenant-scoped table
- [ ] Audit chain Merkle-signed + verifiable
- [ ] Auth: email + Google + Apple + TOTP mandatory + WebAuthn optional
- [ ] Admin cpanel: tenant list · audit viewer · activity viewer · cost shell · integrations shell · feature flags
- [ ] GDPR export + deletion working end-to-end
- [ ] Legal docs live (Privacy / ToS / DPA / Cookie / Security / AI System Card / Subprocessors)
- [ ] CI/CD green · preflight gate enforced · Vercel deploy automatic
- [ ] Observability: Axiom + Sentry + OpenTel + Vanta connected
- [ ] Jury PASS WITH FIXES on Foundation
- [ ] All Foundation Blockers + Criticals cleared with reviewer verification

---

## Phase 1.1 — Mailroom + Scheduler (read) + Morning Briefing

**Duration:** 3-4 weeks
**Lead:** [Forge]
**Concurrent:** CASA Tier 2 review running (4-12 weeks) ⚠️

### Goals
1. Composio wired with Gmail + Google Calendar OAuth
2. Mailroom reads inbox, ranks by AI importance
3. Scheduler reads calendar, surfaces today + tomorrow + conflicts
4. Briefing composer: pulls Mailroom + Scheduler + Oracle + Companion → renders the daily briefing
5. Briefing delivery: in-app at login + email at user-configured time (default 6am local)
6. Founder receives a real daily briefing every morning by end of phase

### Sprints
- **1.1-A (week 1):** Composio integration — OAuth flow for Gmail + GCal, token vault, refresh handling
- **1.1-B (week 2):** Mailroom read — pull last 24h, rank by importance, store ranking + reasoning, surface in UI
- **1.1-C (week 3):** Scheduler read — today + tomorrow events, conflict detection, surface in UI
- **1.1-D (week 4):** Briefing composer — system prompt + composite call to LLM + render + email deliver via Resend; founder dogfoods + iterates

### Exit gates
🎯 Founder uses the briefing daily for 5+ consecutive days without intervention
🎯 Halo a11y review passes (briefing is the first content surface)
🎯 Per-LLM-call cost tracking active and visible in cpanel
🎯 Briefing generation latency < 90s p95
🎯 Briefing delivery success rate ≥ 99% over the 5-day dogfood window

---

## Phase 1.2 — Mailroom write + Companion v1

**Duration:** 2-3 weeks
**Lead:** [Forge]
**Concurrent:** CASA review continuing ⚠️ · Vanta SOC 2 gap remediation 🛂

### Goals
1. Mailroom proposes reply drafts; user approves/edits before send
2. Mailroom snooze / delete / label actions
3. User can set "trusted-action rules" (e.g., always auto-delete sender X)
4. Companion v1: morning nudge ("did you stretch?"), reading reminder (set a book), 5-min breath timer

### Sprints
- **1.2-A:** Mailroom write — draft composition, send via Gmail (confirmation-gated), snooze, label
- **1.2-B:** Trusted-action rule engine — JSON DSL stored per tenant, evaluated server-side, auditable
- **1.2-C:** Companion v1 — nudge engine, in-app + push notification, dismiss + snooze + complete

### Exit gates
🎯 Founder sends 10+ replies via Mailroom drafts without escalation
🎯 No irreversible action without explicit confirmation OR explicit trusted-action rule match (security review)
🎯 Push notifications working on PWA-installed iOS + Android

---

## Phase 1.3 — Scribe + Substack auto-publish

**Duration:** 2-3 weeks
**Lead:** [Forge + Herald]

### Goals
1. Scribe drafting surface: pick topic → AI draft → user edit → publish
2. Substack auto-publish via Composio email-to-publish using founder's existing Substack
3. Cross-post X thread + LinkedIn from same draft
4. Voice samples stored per tenant (founder's prior writing) — Scribe imitates voice

### Sprints
- **1.3-A:** Drafting surface — topic input, system prompt with voice samples, draft rendering, edit + save
- **1.3-B:** Substack email-to-publish wiring, confirmation gate, post-publish verification (poll the public RSS to confirm)
- **1.3-C:** Cross-post — X thread chunker + LinkedIn formatter, scheduled or immediate

### Exit gates
🎯 First cardology weekly post auto-published to founder's Substack
🎯 Voice match — founder rates AI draft ≥ 7/10 on voice fidelity
🎯 Herald copy gate passes (no banned words; substantiation rule honored)

---

## Phase 1.4 — Oracle full

**Duration:** 2-3 weeks
**Lead:** [Forge + Herald]

### Goals
1. Oracle daily reading: cardology card of the day + astrology (transit summary for user's natal chart) + 3-card tarot pull
2. Cardology weekly tool (ported from autonomux2) integrated as oracle/weekly route
3. Natal chart input + storage (DOB, time, place — encrypted)
4. Derivative astrology (progressions, returns) on demand

### Sprints
- **1.4-A:** Port cardology data + algo from autonomux2 into `packages/oracle/cardology/`; new `/oracle/weekly` route reuses page
- **1.4-B:** Astrology engine — Astrodienst API integration OR `swisseph` local — generates natal + transit data
- **1.4-C:** Tarot pull — deck table, daily 3-card spread, AI interpretation in AlterEgo voice
- **1.4-D:** Daily reading composer — assembles cardology + astrology + tarot into briefing oracle section

### Exit gates
🎯 Founder uses oracle daily reading for 7+ days, marks ≥ 5 readings as "useful"
🎯 Astrology cost ≤ $0.10/reading
🎯 Tarot deck + interpretations not generic — recognizably AlterEgo voice

---

## Phase 1.5 — Treasurer (Plaid) + Capacitor native wrapper

**Duration:** 4-5 weeks
**Lead:** [Forge + Cipher + Comply]
**Concurrent:** Plaid production agreement negotiation ⚠️ · Apple Developer enrollment + TestFlight setup

### Goals
1. Plaid Link flow → connect first bank account
2. Treasurer surface: balance, transaction list, AI categorization, bill detection
3. Bill reminder: 3d / 1d / day-of, with proposed payment action (read-only in v1.5; payment in v2)
4. Capacitor wrapper around `apps/web` → ship to TestFlight (iOS) + Internal Testing (Android)
5. Face ID / Touch ID unlock on app launch (Capacitor biometric plugin)

### Sprints
- **1.5-A:** Plaid Link sandbox integration, item storage (encrypted), webhook handler for transaction updates
- **1.5-B:** Treasurer dashboard — balance card, transaction feed, AI category tags, manual category override
- **1.5-C:** Bill detection — recurring-transaction analyzer, user confirms, reminder schedule
- **1.5-D:** Capacitor shell + biometric + push notifications + App Store submission package
- **1.5-E:** Plaid prod application + security questionnaire response + Plaid agreement signed

### Exit gates
🎯 Plaid production approved 🛂
🎯 Treasurer dashboard accurate vs founder's bank UI cross-check
🎯 Native app submitted to TestFlight + Internal Testing
🎯 Cipher pen-test on Plaid integration passes 🛂
🎯 Vanta SOC 2 evidence gathered for Plaid scope

---

## Phase 1.6 — Voice (chat + broadcast) + Polish

**Duration:** 2-3 weeks
**Lead:** [Forge + Herald + Vega]

### Goals
1. Long-running chat with AlterEgo — persistent threads, picks up where last conversation left off
2. Broadcast mode — user records or types a topic, AlterEgo turns it into outbound post(s)
3. Polish pass: design audit, copy audit, accessibility audit, performance audit
4. Founder uses AlterEgo as primary daily UI for 14 days

### Sprints
- **1.6-A:** Chat surface — thread list, in-thread context loading, episodic memory wiring
- **1.6-B:** Broadcast mode — voice (Whisper transcribe) OR text input, AlterEgo proposes Substack draft + X thread + LinkedIn post, cross-post via Scribe
- **1.6-C:** Polish — Vega visual review, Halo a11y pass, Optic UX flow audit, Proof copy substantiation sweep, Edge bundle/perf optimization

### Exit gates
🎯 Founder dogfood: 14 consecutive days as primary UI without falling back to ChatGPT / native email
🎯 Full Jury audit passes ≥ 80/100
🎯 Edge perf budget met (TTFB <500ms p95, First Load JS ≤200kB per route)
🎯 Halo audit: WCAG 2.2 AA on every shipped surface

---

## Phase 1.7 — Multi-tenant launch

**Duration:** 4-6 weeks
**Lead:** [Forge + Compass + Penny + Signal]
**Concurrent:** SOC 2 Type II audit kickoff 🛂

### Goals
1. Multi-tenant isolation proven (RLS audit + pen-test specifically scoped to tenancy)
2. Stripe subscription billing live with 3 tiers
3. Public landing site + signup
4. Waitlist drain — invite first 50 paying users, gradual rollout
5. Onboarding flow — guided setup, first integration in <3 minutes
6. Support infrastructure ([Echo]) — help center, ticket flow, response SLA

### Sprints
- **1.7-A:** RLS proof tests — every table, every read + write path tested for cross-tenant leakage; external pen-test scope letter
- **1.7-B:** Stripe integration — checkout, customer portal, subscription lifecycle, webhook reconciliation, billing dashboard in cpanel
- **1.7-C:** Public site — landing, pricing, FAQ, security, AI System Card, about
- **1.7-D:** Onboarding flow — signup → choose plan → connect first integration → first briefing within 24h
- **1.7-E:** Waitlist drain — invite first 50 founders, watch error rates, adjust
- **1.7-F:** Echo: Help Center (Crisp / Intercom / custom) · ticket flow · response SLA dashboards in cpanel
- **1.7-G:** Signal: launch channel plan — Hacker News Show HN, Reddit r/productivity + r/getmotivated, niche newsletters, ProductHunt prep

### Exit gates
🎯 First 10 external paying users converted from waitlist
🎯 Day-7 retention ≥ 60% on waitlist cohort
🎯 Briefing success rate ≥ 99% across all tenants
🎯 SOC 2 Type II audit kicked off 🛂
🎯 NPS captured for waitlist cohort; baseline established

---

## Phase 2.0+ — Scale + expansion (quarter-by-quarter)

| Quarter | Theme | Key initiatives |
|---|---|---|
| **Q1 post-launch** | Stabilize | Outlook (Microsoft Graph Tier 2) · YouTube creator integration · Companion v2 (deeper wellness) · Echo SLA tightening |
| **Q2** | Cohort growth | Family tier (multi-user tenants) · Notion integration · Referral program · International English (UK + CA + AU) |
| **Q3** | Verticalize | Founder-cohort vertical features · Creator-cohort vertical features · Marketplace MVP (third-party integrations) |
| **Q4** | International + Bill pay | EU expansion (PSD2, GDPR Art. 27 representative, Stripe EU) · Plaid bill-pay enabled (write tier 1) · Spanish locale |
| **Year 2** | Voice + photo | Native phone calling · Photo/document understanding · Apple Watch companion · Self-hosted enterprise tier eval |

---

## Concurrent workstreams (run across phases)

### CWS-1 · CASA Tier 2 (Google Gmail restricted scopes)
- Start: Phase 1.0-D
- Duration: 4-12 weeks (Google's pace)
- Owner: [Comply]
- Blocker for: Phase 1.1 production launch (we can run on `gmail.metadata` scope until approved, but full read needs Tier 2)
- Cost: $15k-75k (depends on annual revenue tier)

### CWS-2 · Microsoft 365 verification (Outlook)
- Start: Phase 1.7 (after first paying users)
- Duration: 4-8 weeks
- Owner: [Comply]
- Blocker for: Outlook in Q1 post-launch

### CWS-3 · Vanta SOC 2 Type II preparation
- Start: Phase 1.0-D
- Audit kickoff: Phase 1.7-A
- Type I report: ~6 months from kickoff
- Type II report: ~12 months from kickoff (continuous compliance over 6mo period required)
- Owner: [Comply + Cipher]
- Cost: $7k-15k/yr Vanta + $20k-30k Type II audit fee

### CWS-4 · Plaid production agreement
- Start: Phase 1.5-A
- Duration: 4-8 weeks (Plaid's pace)
- Owner: [Cipher + Comply]
- Blocker for: Phase 1.5 production launch
- Cost: $500/mo starting tier

### CWS-5 · External pen-tests
- Foundation pen-test: Phase 1.0-D scope letter sent · Phase 1.7-A run
- Banking pen-test: Phase 1.5-E
- Quarterly maintenance pen-tests from Phase 2.0+
- Owner: [Cipher]
- Cost: $8k-15k each

### CWS-6 · Apple Developer Program + TestFlight
- Start: Phase 1.5-D
- Duration: 1-2 weeks for enrollment, ongoing for app review
- Owner: [Terra + Forge]
- Blocker for: Phase 1.5 native release
- Cost: $99/year (founder) or $299/year (organization — recommended)

### CWS-7 · Founder dogfood discipline
- Continuous from Phase 1.1
- Founder uses AlterEgo as primary daily UI
- Bugs / friction logged to GitHub Issues with label `dogfood`
- Weekly review: triage + ship within sprint

---

## Risk register (top 10, ranked) — see PRD §14 for mitigations

| # | Risk | Phase exposure | Live mitigation |
|---|---|---|---|
| 1 | CASA Tier 2 takes >12 weeks | Phase 1.1+ | Build gmail.metadata fallback path; production launch can survive on metadata scope until full read approved |
| 2 | LLM cost per user > $15/mo at Pro tier | Phase 1.1+ | Hard token budget + Haiku fallback + cpanel cost alerts at 80/90/100% |
| 3 | Composio service outage | Phase 1.1+ | Per-tool circuit breakers + degraded-briefing fallback |
| 4 | Plaid prod application rejected | Phase 1.5 | Treasurer ships behind feature flag; v1.5 can launch as "read-only sample data" demo until approved |
| 5 | Founder bandwidth (one-person dependency) | All phases | Hire first eng by Phase 1.4; use studio-zero agent panel for review at every phase exit |
| 6 | SOC 2 audit failure year 1 | Phase 1.7+ | Monthly internal audits via Vanta; external pen-test before audit kicks off |
| 7 | First "AI made a wrong call" trust incident | Phase 1.2+ | Confirmation gates on all irreversible writes; weekly incident review; transparent post-mortems published |
| 8 | Substack changes email-to-publish | Phase 1.3+ | Monitor; fallback to "draft saved, manual paste" workflow |
| 9 | Multi-tenant RLS leak | Phase 1.7 | Pre-launch external pen-test scoped to tenancy; RLS proof tests in CI; quarterly maintenance pen-tests |
| 10 | Vector memory data exfiltration | Phase 1.1+ | Per-tenant embedding salt; column-level encryption; no cross-tenant search ever |

---

## Hiring trigger points

| Trigger | Hire | Phase |
|---|---|---|
| Phase 1.0 lands · founder still solo · Phase 1.1 LLM costs trending toward $200/mo for one user | First full-stack eng (T-shape, Next.js + Postgres + LLM tools) | Phase 1.4 |
| Phase 1.5 banking surface live · founder support load > 10h/week | Customer-success / support ops | Phase 1.7 |
| Phase 1.7 multi-tenant live · 50+ paying users · NPS ≥ 50 | Growth marketer (Signal owns ICP-channel fit) | Phase 2 Q1 |
| Phase 2 Q1 hits 250+ paying users · cost-per-active-user not trending down | LLM cost optimization specialist (could be contract) | Phase 2 Q2 |
| Phase 2 Q2 international launch approved | Compliance + legal counsel (EU) — contract | Phase 2 Q4 |

---

## Cost trajectory (monthly run rate)

| Stage | Infra | LLM (per active user × users) | Compliance | Total/month | Annualized one-time |
|---|---|---|---|---|---|
| Phase 1.0 Foundation (single tenant — founder) | $200 | $30 | $0 (Vanta started but free tier) | $230 | $0 |
| Phase 1.1-1.4 (founder dogfood) | $500 | $80 | $600 (Vanta paid) | $1,180 | $0 |
| Phase 1.5 (Plaid prod) | $1,000 | $150 | $600 | $1,750 | $30k (SOC 2 audit + CASA + pen-test) |
| Phase 1.7 launch (10 users) | $1,200 | $300 (avg $30/user) | $600 | $2,100 | — |
| Phase 2 Q1 (100 users) | $1,500 | $2,000 | $1,500 (lawyer retainer + ongoing audits) | $5,000 | — |
| Phase 2 Q2 (500 users) | $2,500 | $8,000 | $2,000 | $12,500 | — |
| Phase 2 Q4 (2,000 users) | $5,000 | $30,000 | $5,000 | $40,000 | $40k (international compliance) |

**Margin watch:**
- At 100 users on Pro ($79): $7,900 MRR · ~$5,000 cost · 37% gross margin (acceptable for early stage, must trend up)
- At 500 users on Pro: $39,500 MRR · ~$12,500 cost · 68% gross margin (healthy)
- At 2,000 users mixed tiers (~$70 avg): $140,000 MRR · ~$40,000 cost · 71% gross margin (target)

---

## Critical path (Phase 1.0 → Phase 1.7 launch)

```
Phase 1.0 Foundation  ────►  Phase 1.1 Mailroom+Sched
                                        │
                                        ├──► Phase 1.2 Mailroom write + Companion
                                        │              │
                                        │              └──► Phase 1.3 Scribe + Substack
                                        │                            │
                                        ▼                            ▼
                              Phase 1.4 Oracle ────►  Phase 1.5 Treasurer + Capacitor
                                                              │
                                                              ▼
                                                Phase 1.6 Voice + Polish
                                                              │
                                                              ▼
                                                Phase 1.7 Multi-tenant launch
```

**Earliest realistic launch:** 18-26 weeks (4.5-6.5 months) from Phase 1.0 kickoff. Assumes:
- Founder works ~30 productive hours/week on this
- No major CASA delay (best case 4 weeks · realistic 8-12 weeks)
- No Plaid agreement delay
- One full-stack eng joins by Phase 1.4

**With first eng hire at Phase 1.4:**
- Phase 1.4-1.6 compresses from ~8-11 weeks to ~5-7 weeks
- Total: 16-22 weeks

---

## Phase exit checklists (summary)

Each phase has a sprint-level checklist in its section above. The phase-exit summary:

| Phase | Sign-off requires |
|---|---|
| 1.0 | Foundation Jury PASS WITH FIXES ≥ 70 · All Blockers + Criticals cleared with reviewer verification · CASA + Vanta in flight |
| 1.1 | Founder receives + reads briefing 5+ consecutive days · Halo a11y green · Cost tracking live |
| 1.2 | Founder sends 10+ replies via Mailroom drafts · No irreversible write without confirmation · Push notifications working PWA |
| 1.3 | First cardology weekly auto-published to founder's Substack · Voice match ≥ 7/10 |
| 1.4 | Founder uses oracle daily for 7+ days · ≥ 5 readings "useful" · Astrology cost ≤ $0.10 |
| 1.5 | Plaid prod approved · Treasurer accurate vs bank UI · TestFlight + Internal Testing submitted · Plaid pen-test passed |
| 1.6 | Founder primary UI for 14 consecutive days · Full Jury ≥ 80 · Edge perf met · Halo full pass |
| 1.7 | 10+ external paying users · Day-7 retention ≥ 60% · Briefing success ≥ 99% · SOC 2 Type II audit kicked off |

---

## Document change log

| Date | Version | Change |
|---|---|---|
| 2026-05-29 | 0.1 | Initial draft — Phase 1.0 sprint-level · Phase 1.1-1.7 deliverable-level · Phase 2+ quarter-level |

---

*End of Roadmap v0.1.*

Next decisions needed: see PRD §17 (TBD list) + decide whether to start Phase 1.0 immediately or run PRD + Roadmap through Compass + Penny + Comply review first.
