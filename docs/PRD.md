# Autonomux — Product Requirements Document

**Version:** 0.1 (draft)
**Date:** 2026-05-29
**Owner:** kameleyon (josinsidevoice@gmail.com)
**Status:** Living document — Phase 1 (Foundation) scoped, Phase 2-7 sketched
**Adjacent docs:** [ROADMAP.md](./ROADMAP.md) · [ARCHITECTURE.md] (TBD) · [SECURITY.md] (TBD)

---

## 0 · Document conventions

- **Locked** in a section header means the decision is final for v1.0. Changing requires founder sign-off.
- **TBD** means a question we still need to answer — listed in §17.
- Studio-zero personas referenced in [BRACKETS] — Forge, Atlas, Cipher, etc. See §16 for the persona-to-domain map.

---

## 1 · Vision (locked)

**Autonomux is a SaaS platform that gives every paying user a personal AI orchestrator — their AlterEgo — that lives inside their digital life and acts on their behalf across email, calendar, finances, writing, and wellness, under explicit ongoing user control.**

The product thesis: existing "AI assistants" are conversational toys. Autonomux turns assistance into a persistent, accountable, audit-logged agent that knows you over time and gets measurably better at the things you keep asking it to do. The differentiator is **persistent memory + judgment + provable accountability**, not the integrations themselves (those are commodities).

**One sentence we'd put on the homepage:**
> Your AlterEgo runs your inbox, your calendar, your money, and your writing — so you can run the rest.

---

## 2 · Audience

### Primary ICP (founder cohort) — locked

**Profile:** Polymath operators with high cognitive load. Multiple roles simultaneously. Need an agent that can context-switch as fast as they do.

| Trait | Profile |
|---|---|
| Roles | Founder-operator OR professional-with-side-hustles (e.g., RN + creator + investor + parent) |
| Income | $100k-300k household |
| Tech comfort | High — uses Notion, Linear, Stripe, has self-hosted something |
| Pain | "Too many lanes. None getting the attention they deserve." |
| Willingness to delegate | High for repeatable tasks (email triage, bill paying), low for irreversible decisions |
| Privacy posture | Cares — won't hand bank access to a no-name SaaS without proof |

**Founder is the prototype (single mom · RN · content creator · sport · coding · woo-woo · studying).** Building for her first means the surface organically supports the polymath ICP. [Compass owns ICP refinement at Phase 3.]

### Secondary ICPs (Phase 3+ — not designed for yet)
- Indie founders / solo SaaS operators
- Creator-economy operators (newsletter + Substack + podcast)
- Family CFOs (managing household finance + scheduling)

### Out of audience (explicit)
- Enterprise teams — different product
- "Casual ChatGPT users" — won't pay our price
- Users in regulated industries needing HIPAA/SOX-compliant data handling for **patient/employer** data (the founder is an RN — see §10.3 HIPAA refusal contract)

---

## 3 · Product surfaces

### 3.1 User-facing surfaces (locked surfaces, scope per phase in ROADMAP)

| Surface | Description |
|---|---|
| **AlterEgo Home** | Single landing screen on every login. Today's briefing + chat + quick actions. The "open the app, see one thing" surface. |
| **Morning Briefing** | Auto-generated daily summary delivered (a) in-app at login and (b) by email at user-configured time (default 6am local). |
| **Mailroom** | Email triage UI: ranked inbox, AI-proposed actions (draft, snooze, delete, escalate), user approves or overrides |
| **Scheduler** | Calendar overview, conflict detection, agent-proposed slots, accept-to-write |
| **Scribe** | Drafting surface for Substack + other outbound content. Plan → draft → approve → publish |
| **Oracle** | Cardology (weekly + daily) + astrology (natal + transits + derivative) + tarot pulls — daily reading + on-demand |
| **Treasurer** | Plaid-fed dashboard: balance · upcoming bills · spend categories · agent insights ("you spent 40% more on takeout this month") |
| **Voice** | Chat surface: long-running conversation with AlterEgo + topic broadcast (record + publish) |
| **Companion** | Wellness lane: reading reminder · exercise nudge · meditation timer · gratitude/journal capture. Soft-touch, not gamified. |
| **Settings** | Connected accounts, notification rules, AlterEgo personality dial, data export, account deletion |

### 3.2 Admin cPanel (locked) — separate Next.js app, separate auth, separate domain

| Section | Contents |
|---|---|
| **Tenants** | List · drill-down per tenant · usage · cost · errors · sub-agent runs · last-activity |
| **Costs** | LLM cost per tenant / per model / per sub-agent · budget alerts · margin per tier |
| **Integrations health** | Composio per-tool status · Plaid per-tenant status · OAuth refresh failures |
| **Queue** | Railway worker + BullMQ mirror — pending / running / failed / retries |
| **Audit log** | Searchable · exportable · 7-year retention · signed-chain verification |
| **Activity log** | User-facing log mirror — what we'd show the user |
| **Compliance** | GDPR export queue · deletion queue · DPA generator · CASA audit trail · SOC 2 evidence |
| **Billing** | Stripe MRR / churn / LTV · cohort retention · refund processing |
| **Feature flags** | GrowthBook console · % rollouts · per-tenant overrides |
| **Support** | Impersonate-with-audit · force re-OAuth · reset agent memory · resend briefing |
| **Health** | Per-service SLO board · uptime · error budgets |

### 3.3 Out of product (Phase 1) — explicit
- Native voice (calling on phone), full-day always-listening — Phase 5+
- Multi-user shared AlterEgos (couple, family) — Phase 5+
- Browser-use / web automation — Phase 4+ (use Composio actions where possible)
- Custom workflows / Zapier-style flow builder — never (would change the product)

---

## 4 · AlterEgo orchestration model (locked)

**AlterEgo = single persistent agent.** The user always talks to AlterEgo by name. Sub-agents are implementation details — never surfaced as separate identities to the user.

### 4.1 Sub-agent roster (Phase 1 launch set)

| Sub-agent | Owner [persona] | Reads | Writes | Tools |
|---|---|---|---|---|
| **Mailroom** | [Forge] | Gmail messages, threads, labels | Drafts, snooze, delete, label | Composio Gmail / Outlook |
| **Scheduler** | [Forge] | Google Calendar events, free/busy | Event creation, response, cancel | Composio Google Calendar |
| **Scribe** | [Forge + Herald] | User's writing samples, briefings, prior posts | Substack draft (publish-by-email), X thread, LinkedIn post | Composio Substack-via-email + X + LinkedIn |
| **Oracle** | [Forge + Herald] | Calendar (date context), cardology data, astrology API, tarot deck | Daily reading rendered to UI | Internal (cardology · already ported in autonomux2), Astrology API (Astrodienst/Swiss Ephemeris), tarot deck table |
| **Treasurer** | [Forge + Cipher] | Plaid transactions, balances, bill rules | Bill reminders to inbox · category-tag spend | Plaid (US Open Banking) |
| **Voice** | [Forge] | Chat history, broadcast topics | Saved chats, broadcast outputs | Internal · LLM only |
| **Companion** | [Forge + Compass] | Wellness setpoints, journal entries | Nudges, journal entries, log timers | Internal · LLM + scheduled triggers |

### 4.2 Orchestration kernel

- **Single agent loop** running Claude Sonnet 4.6 with tool-calling — via `packages/llm` pluggable adapter (OpenRouter default; one env var swaps to Anthropic direct)
- **Routine triage** (Mailroom rank, Scheduler conflict check) runs on Haiku 4.5 to keep cost low (same adapter, just different model name)
- **Tools = sub-agents** — each sub-agent exposes a Claude-formatted tool schema; AlterEgo calls them as tools
- **Decision tree:**
  1. User opens app → AlterEgo runs "morning briefing" composite (Mailroom rank + Scheduler today + Oracle pull + Treasurer alerts + Companion nudge → single rendered briefing)
  2. User opens a sub-agent surface (e.g., Mailroom) → that surface's sub-agent runs in conversational mode within AlterEgo
  3. User types in Voice → free-form chat; AlterEgo decides which sub-agent(s) to invoke as tools
- **Idempotency:** every sub-agent action carries `request_id`. Retries are safe.
- **Confirmation gate:** any write action with **reversibility = false** (sending email, paying bill, posting Substack) requires explicit user confirmation. Per-tenant configurable "trusted action" rules can auto-approve certain reversible writes.

### 4.3 Memory architecture (locked, owned by [Atlas + Cipher])

Three tiers — all encrypted at rest with per-tenant data keys:

| Tier | Storage | Contents | Retention |
|---|---|---|---|
| **Short-term** | Upstash Redis (per-session) | Active conversation context, in-flight tool calls | 24h |
| **Episodic** | Supabase `agent_memory_episodes` (pgvector) | Embedded summaries of past briefings, conversations, sub-agent runs | 90d hot, archived encrypted to S3 |
| **Structured facts** | Supabase `agent_facts` JSONB | Stable profile: name, relationships, preferences, recurring obligations, brand voice samples, AlterEgo personality settings | Permanent until user-deleted |

**Privacy guarantees:**
- Memory NEVER leaves user's tenant — no cross-tenant learning, ever
- User can view, edit, delete any fact at any time via Settings → Memory
- Deletion is hard delete + audit log entry (no soft delete on memory; GDPR Art. 17)

---

## 5 · Integrations (Phase 1 set — locked)

| Integration | Via | Scope (Phase 1) | Notes |
|---|---|---|---|
| Gmail | Composio | Read messages · drafts · labels · send | Restricted scope · CASA Tier 2 required |
| Outlook | Composio | Read messages · drafts · send | Phase 1.2 — Microsoft Graph Tier 2 verification |
| Google Calendar | Composio | Read events · free/busy · write events | Standard scope |
| Substack | Composio (Substack-via-email) | Publish drafts via author email-to-post address | Substack lacks public posting API |
| X / Twitter | Composio | Read user posts · post threads · DMs | Standard API |
| LinkedIn | Composio | Post personal updates | Standard API |
| YouTube | Composio | Upload, update metadata, comments | Future (motionmax sync potential) |
| Plaid | Direct (no Composio) | Account balance · transactions · category · bill detection | US Open Banking · production needs Plaid agreement |
| Astrology data | Direct (Astrodienst / Swiss Ephemeris) | Natal + transit calc | Library: `swisseph` or Astrodienst API |
| LLM | **Pluggable adapter** (`packages/llm`) — OpenRouter default, Anthropic direct via 1-env-var switch | All LLM calls | Sonnet 4.6 + Haiku 4.5 |
| Resend | Direct | Transactional email (briefing email, password reset, billing) | — |

### Integrations explicitly out of Phase 1
- iMessage / WhatsApp / Telegram (Apple sandbox + WhatsApp Business too heavy for v1)
- Notion (planned Phase 2)
- Slack (planned Phase 3)
- Stripe (we use Stripe for billing autonomux itself — Phase 1 — but Treasurer doesn't surface user's own Stripe yet)

---

## 6 · Data model (high-level; full schema in `packages/db/schema.sql`)

### 6.1 Tenant / user identity

| Table | Purpose |
|---|---|
| `tenants` | One row per paying account · plan · billing status · per-tenant master encryption key reference |
| `users` | Auth identity — Supabase Auth-managed |
| `user_sessions` | Supabase Auth-managed |
| `tenant_members` | M:M users ↔ tenants (Phase 5+ for shared AlterEgos) |

### 6.2 AlterEgo state

| Table | Purpose |
|---|---|
| `alterego_settings` | Personality dial, briefing time, notification rules, trusted-action rules |
| `agent_facts` | Structured user-profile facts (encrypted JSONB) |
| `agent_memory_episodes` | Episodic memory (pgvector embeddings + summary text, encrypted) |
| `agent_runs` | Every orchestrator invocation: trigger, tools called, LLM tokens, duration, status |
| `sub_agent_runs` | Per-sub-agent invocation log (FK → `agent_runs`) |

### 6.3 Connected accounts

| Table | Purpose |
|---|---|
| `connected_accounts` | One row per (tenant, integration) — Composio account id, OAuth status, scope grants |
| `connected_account_events` | Token refresh log, scope changes, disconnections |

### 6.4 Sub-agent state

| Table | Purpose |
|---|---|
| `mailroom_rules` | User-defined rules for Mailroom (always-delete, always-draft, escalate, etc.) |
| `treasurer_bills` | Detected + user-confirmed recurring bills |
| `scribe_voice_samples` | User's prior writing (for voice mimicry) |
| `oracle_readings` | Saved oracle pulls (daily card + interpretation + user feedback) |
| `companion_nudges` | Wellness nudge schedule + dismissal history |

### 6.5 Logging

| Table | Purpose |
|---|---|
| `activity_log` | User-facing — what AlterEgo did + chain-of-thought |
| `audit_log` | Compliance — every write to user data, signed chain (Merkle-style) |
| `system_log_meta` | Pointers to Axiom log streams (not stored in DB) |

### 6.6 Billing

| Table | Purpose |
|---|---|
| `billing_subscriptions` | Stripe sub mirror — plan, status, MRR, period dates |
| `billing_events` | Webhook event log (signed) |
| `usage_meters` | Per-tenant LLM tokens, Plaid calls, Composio calls — for cost roll-up and overage billing |

### 6.7 RLS posture (locked by [Atlas])

- **Every** tenant-scoped table has `tenant_id uuid not null` + RLS policy `using (tenant_id = auth.jwt() ->> 'tenant_id')`
- Service-role queries restricted to specific helpers in `packages/db/admin.ts` — never exposed to web app
- Admin cpanel uses a separate JWT claim (`admin_role`) and a separate RLS policy set

---

## 7 · Security model (locked by [Cipher + Shield])

### 7.1 Authentication (locked 2026-05-29 — email/password)

| Vector | Standard |
|---|---|
| Web auth | Supabase Auth · **email + password** (primary) · password ≥ 12 chars · zxcvbn strength meter at signup |
| Email verification | Mandatory before first agent connection · verification link expires 24h |
| 2FA | **TOTP mandatory** at signup · authenticator app of user's choice (Google Authenticator, 1Password, Authy) · backup codes generated + downloadable |
| Optional 2nd factor | WebAuthn / Passkeys offered after first sign-in for users who prefer |
| Step-up auth | TOTP re-prompt for sensitive actions: banking changes, account deletion, plan downgrade, revoke-all-sessions |
| Session | 24h access token · 7d refresh · device fingerprint · revoke-all-sessions in Settings |
| Admin auth | Separate Supabase project · email + password + TOTP mandatory · IP allowlist + WireGuard mesh |

**OAuth providers — optional add-ons (deferred):** Google + GitHub + Microsoft (Outlook) can be enabled with ~5 min config each, no review process — add when convenient. Apple (requires Developer Program enrollment) + Facebook (requires Meta app review, 4-8 weeks) deferred to post-launch.

**Composio is NOT used for identity.** Composio handles agent action OAuth separately (Mailroom reading Gmail, Scheduler writing to Calendar, etc.) — different scope grants, different storage, different purpose.

### 7.2 Encryption

| Surface | Scheme |
|---|---|
| Data at rest (PII) | Envelope encryption — AWS KMS master key wraps per-tenant data keys; libsodium for app-side AEAD |
| Data at rest (OAuth tokens) | Same envelope scheme, separate key namespace, key rotation 90d |
| Data in transit | HTTPS only · HSTS preload · TLS 1.3 min |
| LLM payloads | Anthropic API over HTTPS · zero data retention contract on file |

### 7.3 Secrets

- All secrets in Doppler · synced to runtime via env at deploy time
- No secret in code, no secret in logs (Sentry redaction rules from studio-zero ported)
- AWS access via IAM roles, not static keys, wherever possible

### 7.4 OAuth handling

- Composio holds OAuth tokens — we hold only Composio's reference id
- For Plaid: we hold Plaid `item_id` + access_token (envelope-encrypted) — Plaid doesn't have a Composio proxy
- Re-OAuth flows on token expiry are surfaced in-app + admin cpanel alert

### 7.5 Audit + tamper-evidence

- `audit_log` is append-only at the DB level (RLS denies UPDATE/DELETE)
- Every entry includes `prev_hash` (sha256 of prior row) — Merkle chain
- Daily checkpoint signs the chain head + posts to a verifiable timestamp service (OpenTimestamps)
- Admin cpanel verify button replays the chain

### 7.6 Penetration testing

- Pre-launch: scoped pen-test by an external firm (~$8-15k)
- Quarterly: lighter rerun
- Bug bounty: planned Phase 4 via HackerOne or self-managed

---

## 8 · Logging system (locked) — three tiers

### 8.1 Activity log (user-facing)
- Stored in `activity_log` table
- Contents: human-readable summary of every AlterEgo action + reasoning chain
- Surfaces in user app at Settings → Activity + Admin cpanel
- Retention: 90d hot in DB, 2yr archived encrypted to S3
- User can export full activity log as JSON via GDPR export
- Tone: written by [Herald] copy — explanatory, not jargon

### 8.2 System log (engineering)
- Pino-formatted JSON → Axiom
- Contents: structured logs from every service (web, worker, api routes)
- Includes: request_id, tenant_id (NEVER user-identifying PII), span context
- Redaction rules (port from studio-zero `lib/sentry-redaction.ts`)
- Retention: 30d hot in Axiom, 1yr cold S3

### 8.3 Audit log (compliance)
- Stored in `audit_log` (Postgres, signed chain)
- Contents: every write to user data — who, what, when, what changed
- Required by SOC 2 (CC6.1), GDPR Art. 30
- Retention: 7 years
- Exposed: admin cpanel only · GDPR export only · subpoena response only

### 8.4 LLM-specific logging

| Per LLM call | Captured |
|---|---|
| `agent_runs.input_tokens` | Anthropic billing dimension |
| `agent_runs.output_tokens` | Same |
| `agent_runs.model` | Sonnet 4.6 / Haiku 4.5 / other |
| `agent_runs.cost_usd` | Computed from current pricing |
| `agent_runs.latency_ms` | Time to first byte + total |
| `agent_runs.tools_called[]` | Sub-agent + tool name + duration per call |
| `agent_runs.chain_of_thought` | Encrypted, available in cpanel impersonate |

---

## 9 · Non-functional requirements (locked)

| Class | Target |
|---|---|
| **Uptime (web)** | 99.5% SLO · 99.9% stretch · status.autonomux.io public board |
| **Uptime (briefing delivery)** | 99% — briefing email arrives within ±15min of user-configured time |
| **TTFB (dashboard)** | < 500ms p95 from cold cache |
| **Briefing generation latency** | < 90s p95 |
| **Accessibility** | WCAG 2.2 AA · all surfaces · automated + manual audit |
| **Lighthouse** | 90+ on all 4 axes for marketing + 80+ for app |
| **Reflow** | 320px width minimum |
| **Browsers** | Last 2 Chrome / Safari / Firefox / Edge |
| **Mobile** | iOS 16+ Safari · Android 11+ Chrome · PWA-installable |
| **Performance budget** | First Load JS ≤ 200kB per route |
| **i18n** | en-US locked v1 · en-GB + en-CA Phase 3 · es Phase 4 |
| **Region** | US East primary · US West DR · EU expansion Phase 5+ |

---

## 10 · Compliance scope (locked by [Comply])

### 10.1 In scope for v1.0 launch
- **GDPR** — even US-only, applies to EU citizens · Data Export · Deletion · DPA template · Cookie consent
- **CCPA** — California "Do not sell" signal honored · annual disclosure
- **SOC 2 Type II** — in audit by month 6 post-launch · Vanta from Day 1
- **Google CASA Tier 2** — required for restricted Gmail scopes · submit in parallel with Foundation sprint
- **Microsoft 365 verification** — Tier 2 for Outlook · Phase 1.2
- **Plaid agreement** — production access tier · ongoing security questionnaire

### 10.2 Out of scope (explicit)
- **HIPAA** — we do NOT accept PHI · refusal contract below
- **PCI** — Stripe handles card data · we never see PAN
- **FERPA, GLBA, SOX** — not in scope
- **EU PSD2 Open Banking** — Phase 5+ when EU expansion lands

### 10.3 HIPAA refusal contract (founder is RN — non-negotiable)
- Terms of Service explicit: "Do not paste patient information into AlterEgo. We do not have a BAA. We are not a covered entity."
- AlterEgo system prompt refuses to summarize / draft about patient-identifiable content
- Mailroom triage flags inbound mail with detected PHI patterns (SSN, MRN-like, "patient" + name) — auto-redacts before LLM call, logs incident
- Penalty for breach: account suspension + breach notification

### 10.4 Compliance documents to ship pre-launch
- Privacy Policy
- Terms of Service
- Data Processing Agreement (DPA)
- Cookie Policy + banner
- AI System Card (per EU AI Act Art. 50 / California SB 942) — published
- Subprocessor list — published, change-notified
- Security page (security.autonomux.io) — controls + certifications
- DMCA agent registration
- Accessibility statement

---

## 11 · Pricing + monetization (draft — [Penny] owns)

### 11.1 Subscription tiers (v1.0 — directional, not locked)

| Tier | Price | LLM budget | Integrations | Differentiator |
|---|---|---|---|---|
| **Free** | $0 | 100k tokens/mo (Haiku only) | Read-only Gmail · Read-only Calendar · Oracle | Trial — limits enforce upgrade |
| **AlterEgo Personal** | $29/mo | 1M tokens (Haiku + Sonnet mixed) | + Gmail write · Scribe drafts only · Companion | Daily briefing + write actions |
| **AlterEgo Pro** | $79/mo | 5M tokens | + Scribe publishing · Treasurer (Plaid) · Outlook · X/LinkedIn cross-post | Full agent — "your AlterEgo runs your stuff" |
| **AlterEgo Founder** | $199/mo | 20M tokens | + Multi-account · custom integrations · priority queue · monthly 1:1 with team | For the polymath ICP |

### 11.2 Annual discount
- 20% off annual prepay across all paid tiers

### 11.3 Overage policy
- Soft: in-app warning at 80%, 90%, 100% of monthly token budget
- Hard: 110% → auto-throttle to Haiku-only for routine ops; 150% → pause non-essential sub-agents until next cycle or top-up
- Top-up packs: $10 = +500k tokens

### 11.4 Unit economics target
- **Per-user gross margin ≥ 70%** at Pro tier (target the founder cohort)
- LLM cost ceiling at Pro: $15/user/mo
- Composio + Plaid + infra: ~$4/user/mo amortized
- Target LTV/CAC ≥ 4:1 within 18 months

### 11.5 Revenue surfaces beyond subscription (Phase 4+)
- Integration marketplace (future) — share % with third-party integration authors
- White-label AlterEgo for creators (Phase 5+)

---

## 12 · Success metrics (locked by [Hook + Compass])

### 12.1 North Star
**Daily Active Briefings** — the count of users who opened or received-and-read their morning briefing yesterday.

### 12.2 Activation funnel
| Step | Metric | Target by month 6 |
|---|---|---|
| Sign up | `signup_completed` | — |
| Connect first integration | Within 24h of signup | ≥ 70% |
| Receive first briefing | Within 7d of signup | ≥ 85% |
| Approve first agent action | Within 7d | ≥ 60% |
| First paid month | Within 30d | ≥ 25% (free → paid conversion) |

### 12.3 Retention
- Day-7 retention: 60%
- Day-30 retention: 45%
- Day-90 retention: 35%
- Monthly logo churn (paid): ≤ 5%

### 12.4 Trust signals
- NPS ≥ 50 by month 12
- "I trust AlterEgo with my [email / money / calendar]" — survey monthly, target +5 NPS quarter-over-quarter

### 12.5 Operating health
- Briefing delivery success rate ≥ 99%
- Failed sub-agent rate < 2% (errored / total runs)
- Cost per active user trending down month-over-month

---

## 13 · Brand + voice (draft — [Herald + Canon])

### 13.1 AlterEgo personality (locked direction)
- **Voice:** calm, competent, never anxious. Knows things; doesn't show off knowing them.
- **Tone:** warm but professional. Closer to a great executive assistant than a chatty companion.
- **Confidence:** says what it knows, asks when it doesn't. Never invents.
- **Boundary:** explicit when refusing (HIPAA, illegal, harmful). No moralizing on legitimate requests.

### 13.2 Brand identity
- **Logo:** autonomux chameleon (orange → red gradient on white)
- **Palette:** warm-only — red · orange · gold · yellow. No greens / blues / purples. Semantic distinction via value ladder.
- **Type:** Cormorant Garamond (display) · DM Mono (data) · Inter (body)
- **Radius:** `--r-xl` = 12px on every rounded surface
- **Mood:** intelligent · warm · accountable · not sterile · not chatty

### 13.3 Banned words (initial — [Proof] owns)
- "platform" — we're an AlterEgo, not a platform (even though technically we are one)
- "unlock," "fastest," "best-in-class," "synergy," "leverage," "world-class"
- "magical" — we earn it; we don't claim it

### 13.4 Substantiation rule (port from studio-zero brand voice §8)
- Every quantitative claim has a `marketing/claims-substantiation/*.md` file with `Status: VERIFIED` and pinned commit
- Preflight gate blocks releases with STUB-status claims shipping live

---

## 14 · Risks + mitigations (top 10, ranked)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | CASA Tier 2 review delayed > 6mo | High | Critical | Submit during Foundation; have non-restricted Gmail fallback (`gmail.metadata` scope) for v1.1 |
| 2 | LLM cost spikes per user > tier budget | Medium | Critical | Hard token budget per tenant · Haiku fallback for routine · cpanel cost alerts |
| 3 | Composio outage cascades across sub-agents | Medium | High | Per-tool circuit breakers · degrade gracefully ("Mailroom unavailable, briefing without email today") |
| 4 | Plaid agreement rejected / delayed | Medium | High | Build Treasurer behind a feature flag · ship v1.4 without it if blocked |
| 5 | Founder churn (one-person dependency) | High | High | Document everything · pair on critical decisions with studio-zero agents · hire first eng by month 3 |
| 6 | SOC 2 audit failure | Low | Critical | Vanta from Day 1 · monthly internal audits · external pen-test before audit kicks off |
| 7 | User-perceived "AI made a mistake" trust loss | Medium | High | Confirmation gate on all irreversible writes · explainable chain-of-thought visible · easy undo |
| 8 | Substack policy change blocks email-to-publish | Low | Medium | Monitor; fall back to in-app draft + manual copy if needed |
| 9 | Multi-tenant RLS leak | Low | Catastrophic | RLS proof tests in CI · quarterly external pen-test scoped to tenancy · `tenant_id` in every JWT claim |
| 10 | Vector memory data exfiltration | Low | Catastrophic | pgvector encrypted at column level · embeddings include tenant salt · no cross-tenant search ever |

---

## 15 · Out-of-scope decisions (explicit no's)

| Topic | Decision | Reason |
|---|---|---|
| Open-source AlterEgo | No | Our edge is judgment + memory + accountability, not the integrations |
| Self-hosted option | No (v1.x) | Too expensive to support; revisit at v3 |
| AI agent marketplace (third-party agents) | No (v1.x) | Quality + safety control matters more; revisit at v2.5+ |
| Voice (phone calls) | No (v1.x) | Latency + cost don't yet justify |
| Photo / video understanding | No (v1.x) | Scope balloon; revisit when Anthropic releases stable vision pricing |
| Browser automation (Browser-Use, Playwright agent) | No (v1.x) | Composio + native APIs cover 90% of asks; revisit at v2 |
| Code-writing assistant | Hard no | Wrong audience, wrong product |
| Therapy / mental-health diagnosis | Hard no | Liability; Companion stays nudge-only |

---

## 16 · Studio-zero persona map (locked)

| Persona | Domain | Phase 1 surface |
|---|---|---|
| **Arch** | Architecture | Monorepo shape, build sequence, dependency graph |
| **Forge** | Backend engineering | API routes, agent runtime, Composio + Plaid clients |
| **Atlas** | Data | Supabase schema, RLS, pgvector, retention |
| **Cipher** | Encryption + secrets | Envelope encryption, KMS, vault wrappers |
| **Shield** | Security ops | OAuth handling, session, pen-test response |
| **Comply** | Regulation | SOC 2, GDPR, CCPA, CASA, HIPAA refusal |
| **Probe** | Quality | Test harness, e2e, integration, RLS proofs |
| **Jury** | Audit (orchestrator) | Per-sprint audit synthesis |
| **Optic / Proof / Halo / Compass / Trace / Canon** | The 6 reviewer audit panel | Per-sprint review |
| **Pipeline** | DevOps | CI/CD |
| **Watch** | Monitoring | Observability, SLOs, on-call |
| **Terra** | Infra | Vercel, Supabase, Railway, AWS (KMS only), Doppler |
| **Vega** | Visual design | Web + admin design system |
| **Optic** | UX | Information architecture, flows |
| **Halo** | Accessibility | WCAG 2.2 AA |
| **Herald** | Voice / copy | AlterEgo personality, all user-facing strings |
| **Compass** | Audience fit | ICP, segment positioning |
| **Penny** | Pricing + finance | Tiers, unit economics, runway |
| **Signal** | Growth channels | Acquisition, ICP-channel fit |
| **Hook** | Analytics | Funnel, retention, NSM instrumentation |
| **Lens** | Experimentation | A/B, feature flag rollouts |
| **Echo** | Support ops | Help center, ticket flow, response SLA |
| **Ledger** | Finance ops | Stripe ops, refunds, reconciliations |
| **Scribe** | Internal docs | Engineering docs, runbooks, ADRs |
| **Guide** | User docs | Help center articles |
| **Tongue** | i18n | Locale management |
| **Locale** | Localization | Translation pipeline |
| **Edge** | Performance | TTFB, bundle size, caching |
| **Chronicle** | Changelog | Release notes |
| **Siren / Meter** | Alerting / SLO metrics | Pager + cost meters |
| **Jo (founder persona)** | Product decisions | Final call on everything not delegated |

---

## 17 · Open questions / TBD

1. **GitHub repo location + visibility** — private under `kameleyon` org assumed; confirm
2. **Hosting accounts** — confirm Vercel + Supabase + Railway + Doppler + Axiom + Sentry + Vanta + AWS (KMS) + Upstash (Redis) all under `josinsidevoice@gmail.com`; provision in week 1 of Foundation
3. ~~**Phase 1 success criteria number**~~ → **LOCKED 2026-05-29:** Phase 1 = founder-dogfood only (DAB = 1). Phase 1.7 multi-tenant exit gate = **`DAB / paying users ≥ 50%` by month 2 post-launch.**
4. **AlterEgo voice samples** — does the founder want her own writing samples pre-loaded into Scribe at launch (yes / no) — affects v1.3 Scribe scope
5. **Companion content library** — meditation scripts, journal prompts, exercise sequences — source licensed library, original content, or both? Affects v1.5+ scope
6. **Apple Sign In support** — required for native iOS App Store submission. Add to Phase 1.5 (Capacitor) or earlier?
7. **Native push notification provider** — Vercel/Web Push for PWA Phase 1.1+; OneSignal vs Firebase for Capacitor Phase 1.5
8. ~~**Astrology engine** — Astrodienst API (paid) vs `swisseph` library (free, on our infra)~~ → **LOCKED 2026-05-29:** `swisseph` on our own infra. Runs in `apps/worker`. Zero per-call cost.
9. **Subscription billing day** — calendar-month vs subscription-anniversary — affects MRR reporting
10. **Cookie consent provider** — self-built (cheap, ours to maintain) vs Cookiebot / OneTrust (paid, compliance-cleaner)

---

## 18 · Glossary

- **AlterEgo** — the orchestrator persona the user interacts with. Single name, single voice, single relationship.
- **Sub-agent** — internal worker module (Mailroom, Scheduler, etc.) the orchestrator delegates to. Never surfaced as a separate identity to the user.
- **Briefing** — the daily summary AlterEgo produces (in-app + email).
- **Activity log** — user-facing log of what AlterEgo did + why.
- **Audit log** — compliance-grade immutable write log.
- **Tenant** — a billing entity. v1 = one user per tenant. v1.7+ = shared AlterEgos = multi-user tenants.
- **Reversible / irreversible action** — confirmation-gate classification. Sending an email = irreversible. Saving a draft = reversible.
- **Trusted-action rule** — user-defined auto-approval for specific repeated actions.
- **Daily Active Briefings (DAB)** — the North Star metric. Users who engaged with their briefing yesterday.

---

*End of PRD v0.1.*

Next: see [ROADMAP.md](./ROADMAP.md) for phased delivery plan.
