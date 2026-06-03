# Autonomux AutoRoom — Roadmap

**Version:** 0.1 (draft)
**Date:** 2026-06-02
**Owner:** kameleyon
**Companion docs:** [AUTOROOM_PRD.md](./AUTOROOM_PRD.md) · [AUTOROOM_FUNCTIONALITIES.md](./AUTOROOM_FUNCTIONALITIES.md) · [ROADMAP.md](./ROADMAP.md) (parent)
**Status:** Phase 1.2-AR scoped sprint-level · Phase 1.3-AR through 1.7-AR deliverable-level · Phase 2+ exploratory

---

## How to read

Symbols inherited from the parent roadmap:

| Symbol | Meaning |
|---|---|
| **🔒** | Decision locked — change requires founder sign-off |
| **⚠️** | Risk to flag in standup |
| **🛂** | Compliance gate — cannot skip |
| **🎯** | Phase-exit gate — must be green to start next phase |
| **+Dn** | Day relative to phase start |

AutoRoom phases are suffixed `-AR` to distinguish from the parent product roadmap. Each AutoRoom phase ships alongside the same-numbered parent phase (e.g., **1.2-AR** ships with parent **1.2**).

---

## Phase summary

| Phase | Name | Duration | Exit gate | Founder bet |
|---|---|---|---|---|
| **1.2-AR** | AutoRoom MVP | 3-4 weeks | Founder uses Morning Briefing 5+ consecutive weekdays | The wedge — standing automations make AlterEgo "real" |
| **1.3-AR** | Scribe automations | 2 weeks | First cardology weekly auto-publishes to Substack | Content lane closes |
| **1.4-AR** | Oracle automations | 1.5 weeks | Daily oracle reading injected into Morning Briefing | Woo-woo lane closes |
| **1.5-AR** | Treasurer automations | 2 weeks | Bill Watcher catches 100% of recurring bills | Money lane closes |
| **1.6-AR** | Voice + advanced flows | 2 weeks | Conversational setup ships; voice triggers work | Setup friction → zero |
| **1.7-AR** | Multi-tenant collaboration | 3 weeks | Team templates + shared jobs work for paying users | Public scale |
| **2.0+** | Marketplace · Sub-flows · A/B testing | Quarter by quarter | TBD per phase | Scale + ecosystem |

**Founder dogfood window for AutoRoom:** Phase 1.2-AR through 1.6-AR (~10-12 weeks), founder-only. 1.7-AR opens to paying users.

---

## Phase 1.2-AR — AutoRoom MVP (sprint-detailed)

**Duration estimate:** 3-4 weeks (15-20 working days)
**Lead:** [Forge + Arch]
**Concurrent:** Mailroom write + Scheduler write + Companion v1 (the parent Phase 1.2 features that AutoRoom depends on)

### Goals

1. Schema, runtime, and worker for AutoRoom shipped end-to-end.
2. Six day-one templates work for the founder against real Gmail + Calendar.
3. Morning Briefing fires daily at 7am, delivers a useful card.
4. Trust ramp enforced: new jobs default to Observe for 7 days.
5. Cost ceilings + audit chain hookup verified in production.

### Sprint plan

#### Sprint 1.2-AR-A · Days 1-5 · "Foundation"

| # | Task | Owner | Output |
|---|---|---|---|
| A1 | Migration 0015 — 8 AutoRoom tables, RLS, indexes, seed templates ✅ APPLIED | [Atlas] | `packages/db/migrations/0015_autoroom.sql` live on prod (ref `tulflzqrlafufjwdehie`) |
| A2 | `packages/autoroom` package scaffold + skill abstraction | [Forge] | `Skill` interface, dual-mode invocation, registry adapter to `@autonomux/orchestrator` |
| A3 | YAML composition format + validator (Zod schemas) | [Forge] | Round-trip YAML ↔ persisted config |
| A4 | Variable resolver (`{{ stepId.output.path }}`) + safe expression evaluator | [Forge + Shield] | Sandboxed, no eval, type-checked at save time |
| A5 | Runner worker `apps/worker/src/workers/automation.ts` | [Forge] | BullMQ `automation` queue, in-process step loop, idempotency, abort handling |
| A6 | Cron self-rescheduling pattern for cron triggers | [Forge] | `autorun:{automationId}:{nextFireEpochSec}` dedup |
| A7 | `enqueueAndAwait` reuse for sub-agent dispatch from steps | [Forge] | Steps invoke Mailroom/Scheduler via existing pattern |

🎯 **Sprint A exit:** Migration applied · runner worker boots · one synthetic 2-step automation runs end-to-end against test fixtures · `automation_runs` row written with cost + duration

#### Sprint 1.2-AR-B · Days 6-10 · "Trust + safety"

| # | Task | Owner | Output |
|---|---|---|---|
| B1 | Trust tier enforcement at executor level (5 tiers + action-class taxonomy) | [Shield] | Each skill tagged; tier × class compatibility matrix enforced before invocation |
| B2 | Approval gate persistence (`automation_approvals`) + Redis signal + timeout-fallback | [Forge + Shield] | Step pauses, web POST resolves, polling loop wakes |
| B3 | Approval UI primitive (in-app card + email link with one-tap actions) | [Vega] | User clicks Approve/Deny inline; 2FA step-up for money/destructive |
| B4 | Cost ceiling enforcement (per-step + per-run + per-day) | [Forge + Penny] | Pre-flight, mid-stream, and post-flight checks; downgrade Sonnet→Haiku at threshold |
| B5 | Kill switches (per-job pause, per-tenant freeze, per-integration auto-pause) | [Shield + Forge] | Redis flag + DB column fallback; 5s propagation |
| B6 | Audit chain hooks (`autoroom.*` action kinds) | [Atlas + Trace] | Every create/edit/run/approval lands in `audit_log` with Merkle hash |
| B7 | PHI redaction at every external-input boundary (pre-LLM and pre-DB-persist) | [Shield + Comply] | `phi-redactor` runs unconditionally; PHI-positive payloads halt non-Observe runs |

🎯 **Sprint B exit:** Trust tiers enforced · approval gates work · cost ceiling halts a runaway test job · kill switches halt all runs within 5s · PHI redaction verified

#### Sprint 1.2-AR-C · Days 11-15 · "Skills + templates"

| # | Task | Owner | Output |
|---|---|---|---|
| C1 | `system.send_notification` skill (in-app + email via Resend) | [Forge + Herald] | Resend digest template; in-app card renders in chat thread |
| C2 | `mailroom.archive` as a worker job + tool action | [Forge] | Already in gmail-client; needs case in switch + tool schema action |
| C3 | `mailroom.draft_reply` + `mailroom.send_reply` (Phase 1.2 write skills) | [Forge] | Confirmation gate on send; draft persists to `agent_runs.draft` |
| C4 | `scheduler.decline_meeting` + `scheduler.find_open_slot` + `scheduler.block_focus_time` | [Forge] | New gcal-client methods + worker cases + tool schema actions |
| C5 | `mailroom.list_rules` worker implementation (was declared, not implemented) | [Forge] | Closes the silent gap |
| C6 | Six day-one templates seeded + tested end-to-end | [Compass] | Morning Briefing, EOD Shutdown, Inbox Declutter, Calendar Guard, VIP Watcher, Focus Block Auto-set |
| C7 | `companion.send_dm` skill (in-app notification surface) | [Forge] | Used by Wellness Triple template (later) and as default delivery channel |

🎯 **Sprint C exit:** Founder triggers Morning Briefing manually from chat · all six day-one templates can be instantiated · drafts surface in chat as inline cards · all approval-gated paths work

#### Sprint 1.2-AR-D · Days 16-20 · "Web UI + dogfood"

| # | Task | Owner | Output |
|---|---|---|---|
| D1 | `/app/autoroom` landing page — template gallery as the hero | [Vega + Forge] | ICP-ranked recommendations, search, filter, "Try with sample data" |
| D2 | Template instantiation flow — wizard for top 3 templates | [Vega] | 60-second setup for Morning Briefing, VIP Watcher, Inbox Declutter |
| D3 | Automation editor (visual + YAML toggle) | [Vega + Forge] | Form-generated from skill JSON Schema; YAML escape hatch behind setting |
| D4 | Run history dashboard per automation | [Vega + Trace] | Last 50 runs, cost, duration, step breakdown, error details |
| D5 | Conversational setup intent recognition (chat-side shortcut) | [Forge + Compass] | "Make a job that triages my inbox at 7am" → draft config preview |
| D6 | Trust ramp prompts (Observe→Propose nudge after 5 runs) | [Compass + Vega] | Background eval; in-app card prompts promotion |
| D7 | Founder activates Morning Briefing + dogfoods | [Founder + Compass] | 5 consecutive weekday runs without manual intervention |

🎯 **Phase 1.2-AR exit:**
- Foundation Jury PASS WITH FIXES on AutoRoom layer
- Founder uses Morning Briefing 5+ consecutive weekdays
- Median per-run cost ≤ $0.10
- Median run duration ≤ 30s (excluding approval gates)
- Approval acceptance rate ≥ 70%
- Zero unintended writes
- All six day-one templates work end-to-end

### Phase 1.2-AR deliverables checklist

- [x] Migration 0015 applied to prod Supabase
- [ ] `packages/autoroom` package shipped
- [ ] `apps/worker/src/workers/automation.ts` runner deployed to Railway
- [ ] Six day-one templates seeded + tested
- [ ] Mailroom write skills (draft / send / archive) wired
- [ ] Scheduler write skills (decline / find_slot / block_focus) wired
- [ ] `system.send_notification` + Resend digest template
- [ ] `/app/autoroom` UI live
- [ ] Trust ramp enforced (Observe 7-day default)
- [ ] Cost ceilings enforced + audit chain verified
- [ ] Kill switches tested end-to-end
- [ ] Founder dogfood: Morning Briefing 5+ days consecutive

---

## Phase 1.3-AR — Scribe automations

**Duration:** 2 weeks
**Lead:** [Forge + Herald]
**Concurrent:** Parent Phase 1.3 — Scribe + Substack auto-publish

### Goals

1. Scribe skills wired into AutoRoom (`scribe.draft_post`, `scribe.publish_to_substack`, `scribe.crosspost`).
2. Substack Weekly template (T6 in functionalities catalog) goes live.
3. Cross-post automation (X + LinkedIn from one Substack draft).
4. Conversational refinement: "edit the draft to be more concise" mid-flight.

### Exit gates
🎯 First cardology weekly post auto-published to founder's Substack
🎯 Voice match score ≥ 7/10 on AI-drafted posts
🎯 Cross-post to X + LinkedIn works without manual intervention
🎯 Herald copy gate passes (no banned words, substantiation rule honored)

---

## Phase 1.4-AR — Oracle automations

**Duration:** 1.5 weeks
**Lead:** [Forge + Herald]
**Concurrent:** Parent Phase 1.4 — Oracle full (astrology + tarot + cardology)

### Goals

1. Oracle skills wired (`oracle.daily_cardology_reading`, `oracle.daily_astrology`, `oracle.weekly_forecast`, `oracle.tarot_pull`).
2. Daily Cardology + Astro Reading template (T7) goes live.
3. Morning Briefing template extended to inject Oracle section.
4. Per-person multi-natal-chart support (you, your partner, your kid).

### Exit gates
🎯 Founder uses daily oracle reading 7+ days; rates ≥ 5 "useful"
🎯 Astrology cost ≤ $0.10/reading (per parent PRD)
🎯 Oracle voice recognizably AlterEgo, not generic horoscope

---

## Phase 1.5-AR — Treasurer automations

**Duration:** 2 weeks
**Lead:** [Forge + Cipher + Penny]
**Concurrent:** Parent Phase 1.5 — Treasurer (Plaid) + Capacitor native ⚠️ Plaid prod approval gate 🛂

### Goals

1. Treasurer skills wired (`treasurer.categorize_transactions`, `treasurer.detect_bills`, `treasurer.bill_reminder`, `treasurer.forecast_cash_flow`).
2. Bill Watcher template (T9) goes live with 3d/1d/day-of cadence.
3. Read-only mode at launch — no `pay_bill` until Phase 2 (per security audit).
4. Cost-aware budget triggers ("freeze automations if monthly Plaid spend > $X").

### Exit gates
🎯 Bill Watcher catches 100% of founder's recurring bills (manual cross-check)
🎯 Treasurer dashboard accurate vs bank UI
🎯 Plaid pen-test passes 🛂
🎯 Treasurer cost per run ≤ $0.03

---

## Phase 1.6-AR — Voice + advanced flows

**Duration:** 2 weeks
**Lead:** [Forge + Vega + Herald]
**Concurrent:** Parent Phase 1.6 — Voice (chat + broadcast) + Polish

### Goals

1. Voice trigger: "Hey AlterEgo, run my morning triage."
2. Voice setup: "Set up a focus block for me Mon/Wed/Fri 9-11am."
3. Web search skill (`system.web_search` via Perplexity API).
4. Sub-flows (one automation calling another).
5. Advanced control flow: `try/catch`, `parallel:` concurrency, deeper conditional expressions.

### Exit gates
🎯 Voice trigger latency < 3s p95
🎯 Setup-via-voice works for top 5 templates without slot-fill UI fallback
🎯 Web search skill: results land in skill output schema (not free-form text)
🎯 Sub-flow execution doesn't leak audit context (each sub-flow has its own `automation_run` row chained to parent)

---

## Phase 1.7-AR — Multi-tenant collaboration

**Duration:** 3 weeks
**Lead:** [Forge + Compass + Shield]
**Concurrent:** Parent Phase 1.7 — Multi-tenant launch · SOC 2 Type II audit kickoff 🛂

### Goals

1. Tenant-shared automations (team members can view + run + edit).
2. RBAC: owner / editor / runner / viewer roles per automation.
3. Cross-user trust: explicit binding-approval flow for team-owned automations using another member's connected_accounts.
4. Marketplace v0 — curated templates from the team for new tenants to copy.
5. Per-team usage quotas + cost attribution.

### Exit gates
🎯 First 3 paying-team-tier tenants have ≥ 1 shared automation each
🎯 RBAC tested via Cipher pen-test (cross-tenant escalation prevented)
🎯 Cost attribution accurate to within ±5% on per-user-per-team rollup
🎯 SOC 2 evidence captured for AutoRoom audit posture

---

## Phase 2.0-AR+ — Marketplace · sub-flows · A/B testing

Quarter-by-quarter, post-launch:

| Quarter | Theme | Key initiatives |
|---|---|---|
| **Q1 post-launch** | Sub-flow library | Reusable templates that are themselves AutoRoom jobs · cross-team imports |
| **Q2** | A/B testing | Run two automation variants 50/50 · auto-promote winner on user metric (open rate, etc.) |
| **Q3** | Marketplace v1 | Community-shared templates with ratings + verified-by-Comply badge |
| **Q4** | Workflow imports | Zapier zip import · Make.com blueprint converter · n8n YAML |
| **Year 2** | API for 3rd-party apps | OAuth scopes for "this app may create/edit my automations" |

---

## Concurrent workstreams

### CWS-AR-1 · CASA Tier 2 (Gmail restricted scopes)
- Already covered by parent CWS-1; AutoRoom's `mailroom.send_reply` rides the same approval.

### CWS-AR-2 · Vanta SOC 2 evidence for AutoRoom
- Start: Phase 1.2-AR-D (after MVP ships)
- Auditor evidence: trust tier enforcement test logs, kill-switch propagation timing, audit chain integrity verification, cost ceiling enforcement traces.
- Owner: [Comply + Penny]

### CWS-AR-3 · Skill catalog curation
- Continuous from Phase 1.2-AR.
- Owner: [Compass + Canon]
- Every new skill across all sub-agents must include: action-class tag, JSON Schema for I/O, cost-tier default, RLS posture note.

### CWS-AR-4 · Template gallery curation
- Continuous from Phase 1.2-AR.
- Owner: [Compass]
- Weekly review of: founder dogfood feedback, cost-per-template trends, user-acceptance rates per template, new opportunities surfaced from chat intent logs.

---

## Risk register (top 10, AutoRoom-specific)

| # | Risk | Phase exposure | Live mitigation |
|---|---|---|---|
| 1 | Runaway loop blows monthly LLM budget | All phases | Per-run cost ceiling + per-day tenant ceiling + anomaly auto-pause |
| 2 | Approval-gate hijack via stolen session | Phase 1.2-AR+ | Step-up TOTP for money/destructive/personal_data classes |
| 3 | Webhook trigger forgery sends spam | Phase 1.2-AR+ | Per-webhook HMAC signing secret; mismatched → reject + log |
| 4 | Skill version bump silently changes behavior | Phase 1.2-AR+ | Skill pinning per-step; non-blocking nudge on bump |
| 5 | Automation runs against revoked OAuth | All phases | Per-integration auto-pause; user must re-grant + manually resume |
| 6 | Cost forecast vs actual diverges (user surprise) | Phase 1.2-AR+ | Single most-important metric: forecast accuracy ≥ 85% within 60 days of GA |
| 7 | PHI leaks into LLM payload | All phases | Unconditional PHI redaction at every external input + LLM output gate |
| 8 | Template gallery becomes empty/dated | All phases | Compass weekly curation review |
| 9 | Cron worker crashes mid-run, run replays incorrectly | Phase 1.2-AR+ | Step-level persistence + stable requestId hashing for sub-agent dedup |
| 10 | Trust ramp prompts feel naggy | Phase 1.2-AR+ | Limit to 1 prompt/week; user can dismiss permanently per automation |

---

## Cost trajectory (AutoRoom additions to parent cost model)

| Stage | AutoRoom LLM (per active automation × jobs) | Total/month delta |
|---|---|---|
| Phase 1.2-AR Founder dogfood (~6 active jobs) | ~$15/month | +$15 |
| Phase 1.3-AR add Scribe (Substack weekly + crossposts) | +$25/month (Sonnet drafts) | +$40 |
| Phase 1.4-AR add Oracle daily | +$8/month | +$48 |
| Phase 1.5-AR add Treasurer (bill watcher daily) | +$12/month | +$60 |
| Phase 1.7-AR launch (10 paying users × avg 5 active jobs) | $300-500/month tenant LLM | +$500 |
| Phase 2 Q1 (100 users × 5 jobs avg) | $3,000-5,000/month | +$5,000 |

**Margin watch:**
- At 100 users on Pro tier ($79/mo): $7,900 MRR · AutoRoom cost ~$4,500 (LLM) · gross margin on AutoRoom slice: ~43%.
- Target: drive AutoRoom marginal cost below $30/user/month by Phase 2 Q3 via better routing (Haiku-only for triage) + caching (mailroom cache reduces re-processing).

---

## Hiring trigger points

| Trigger | Hire | Phase |
|---|---|---|
| Phase 1.2-AR ships · founder still solo · AutoRoom LLM cost trends > $100/month | First full-stack eng (T-shape: Next.js + Postgres + queue + LLM tools) | Phase 1.4-AR |
| Phase 1.7-AR launches · 50+ paying users with shared automations · support load > 10h/week | Customer success specialist | Phase 2 Q1 |
| Phase 2 Q2 hits 250+ paying users · AutoRoom-specific cost-per-user not trending down | LLM cost optimization specialist (could be contract) | Phase 2 Q2 |
| AutoRoom marketplace launches (Phase 2 Q3) | Community manager (template curation + vendor relationships) | Phase 2 Q3 |

---

## Critical path (Phase 1.2-AR → Phase 1.7-AR launch)

```
Phase 1.2-AR Foundation MVP ──► Phase 1.3-AR Scribe automations
                                          │
                                          ├──► Phase 1.4-AR Oracle automations
                                          │              │
                                          ▼              ▼
                              Phase 1.5-AR Treasurer ──► Phase 1.6-AR Voice
                                                              │
                                                              ▼
                                                  Phase 1.7-AR Multi-tenant
```

**Earliest realistic AutoRoom launch:** 12-16 weeks (3-4 months) from Phase 1.2-AR kickoff. Aligns with the parent roadmap's 18-26 week total ship for Phase 1.7.

---

## Phase exit checklists (summary)

| Phase | Sign-off requires |
|---|---|
| **1.2-AR** | Founder uses Morning Briefing 5+ days consecutive · 6 templates work · cost ceilings + audit chain verified · trust tiers enforced · Foundation Jury PASS WITH FIXES |
| **1.3-AR** | First cardology weekly auto-publishes · voice match ≥ 7/10 · cross-post works · Herald copy gate passes |
| **1.4-AR** | Founder uses oracle daily 7+ days · ≥ 5 "useful" · astrology cost ≤ $0.10/reading |
| **1.5-AR** | Bill Watcher 100% accurate · Plaid pen-test passes · cost per Treasurer run ≤ $0.03 |
| **1.6-AR** | Voice trigger latency < 3s · setup-via-voice works top 5 templates · sub-flows audit cleanly |
| **1.7-AR** | First 3 paying teams have shared automations · RBAC pen-test passes · cost attribution ±5% · SOC 2 evidence captured |

---

## Document change log

| Date | Version | Change |
|---|---|---|
| 2026-06-02 | 0.1 | Initial draft. Phase 1.2-AR sprint-detailed. Six day-one templates locked. Migration 0015 already applied to prod. |

---

*End of AutoRoom Roadmap v0.1.*

*Next decisions:* resolve the open questions in [AUTOROOM_PRD.md](./AUTOROOM_PRD.md) §12 before Phase 1.2-AR Sprint A kickoff.
