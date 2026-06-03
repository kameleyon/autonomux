# Autonomux ControlRoom — Roadmap

**Version:** 0.1 (draft)
**Date:** 2026-06-03
**Owner:** kameleyon
**Companion docs:** [CONTROLROOM_PRD.md](./CONTROLROOM_PRD.md) · [CONTROLROOM_FUNCTIONALITIES.md](./CONTROLROOM_FUNCTIONALITIES.md) · [AUTOROOM_ROADMAP.md](./AUTOROOM_ROADMAP.md) · [ROADMAP.md](./ROADMAP.md) (parent)
**Status:** Phase 1.2-CR scoped sprint-level · Phase 1.3-CR through 1.7-CR deliverable-level · Phase 2+ exploratory

---

## How to read

Symbols inherited from parent roadmap:

| Symbol | Meaning |
|---|---|
| **🔒** | Decision locked — change requires founder sign-off |
| **⚠️** | Risk to flag in standup |
| **🛂** | Compliance gate — cannot skip |
| **🎯** | Phase-exit gate — must be green to start next phase |
| **+Dn** | Day relative to phase start |

ControlRoom phases are suffixed `-CR` to distinguish from the parent product roadmap and from AutoRoom (`-AR`). Each ControlRoom phase ships alongside the same-numbered parent and AutoRoom phase.

**Critical dependency:** ControlRoom Phase 1.2-CR ships **after** AutoRoom Phase 1.2-AR — the data model (`automation_runs`, `automation_approvals`, etc.) must exist first.

---

## Phase summary

| Phase | Name | Duration | Exit gate | Founder bet |
|---|---|---|---|---|
| **1.2-CR** | ControlRoom MVP | 2 weeks | Founder visits ControlRoom daily for 14 days | Visibility into what AlterEgo is doing |
| **1.3-CR** | Custom dashboards + deeper analytics | 1.5 weeks | Founder creates 2+ custom dashboards | Power-user customization |
| **1.4-CR** | Custom alerts + keyboard shortcuts | 1 week | Founder configures 5+ custom alerts | Proactive ops |
| **1.5-CR** | Mobile parity + push notifications | 1.5 weeks | Founder uses mobile ControlRoom 7+ consecutive days | Always-on visibility |
| **1.6-CR** | Conversational ops + AI diagnosis | 1 week | "Pause all jobs" via chat works; AI diagnoses failed runs | Zero-friction intervention |
| **1.7-CR** | Team dashboards + shared views | 2 weeks | First 3 teams share a dashboard | Multi-tenant operations |
| **2.0+** | Advanced analytics · ML-driven insights · Dashboard marketplace | Quarter by quarter | TBD per phase | Scale + ecosystem |

**Total time to ControlRoom GA (1.2-CR through 1.7-CR):** approximately 9 weeks of dev work, parallel-tracked with parent + AutoRoom phases.

---

## Phase 1.2-CR — ControlRoom MVP

**Duration:** 2 weeks (10 working days)
**Lead:** [Vega + Forge]
**Concurrent:** AutoRoom Phase 1.2-AR (data layer + runner)
**Prerequisites:** AutoRoom Sprint A complete (schema + runner live); SSE pattern available from chat

### Goals

1. Five core ControlRoom surfaces shipped: live run feed, activity timeline, per-automation health, approval inbox, cost dashboard.
2. Five default custom views available + user can save their own.
3. All single-automation control verbs work (pause, resume, edit, clone, archive, delete, rollback).
4. SSE streaming for live updates.
5. Founder uses ControlRoom daily without falling back to DB queries or admin cpanel.

### Sprint plan

#### Sprint 1.2-CR-A · Days 1-5 · "Read surfaces"

| # | Task | Owner | Output |
|---|---|---|---|
| A1 | Migration 0016 — `controlroom_views`, `controlroom_user_preferences`, `controlroom_alerts`, `controlroom_notifications_log` | [Atlas] | RLS, indexes, applied to prod |
| A2 | ControlRoom layout shell — sidebar nav (Runs / Activity / Approvals / Costs / Integrations) | [Vega] | Lives at `/app/controlroom`; mobile-responsive via existing app shell |
| A3 | Live run feed (SSE-driven) | [Vega + Forge] | `apps/web/app/api/controlroom/stream/route.ts`; real-time step updates |
| A4 | Activity timeline (DB-fetch with infinite scroll) | [Vega] | Pulls from `audit_log` + `automation_runs`; filters by date/class/automation |
| A5 | Per-automation health card | [Vega + Trace] | Success rate + cost + last-run sparkline; click → deep view |
| A6 | Cost dashboard (KPI tiles + 90-day trend chart) | [Vega + Penny] | Recharts library; reads `automation_runs.total_cost_usd_cents` |
| A7 | Approval inbox (sorted by urgency / TTL) | [Vega + Shield] | Inline approve/deny; 2FA step-up for high-risk |

🎯 **Sprint A exit:** All five read surfaces render real data · SSE stream delivers updates within 1s · founder can see runs happening live

#### Sprint 1.2-CR-B · Days 6-10 · "Write actions + customization"

| # | Task | Owner | Output |
|---|---|---|---|
| B1 | Per-automation action verbs (pause / resume / edit / clone / archive / unarchive / delete / rollback / run-now / export-YAML) | [Forge + Vega] | Each verb wired to server action; destructive verbs require confirmation |
| B2 | Per-run action verbs (cancel / replay / acknowledge / pin / share-permalink) | [Forge + Vega] | Cancel propagates to worker via Redis flag |
| B3 | Bulk actions (multi-select → pause/resume/archive/acknowledge) | [Vega] | Checkboxes + bulk action bar |
| B4 | Global emergency freeze button (Settings → Security) | [Shield + Vega] | 2FA-gated; halts all automations within 5s |
| B5 | Custom views — save, rename, delete, pin to sidebar, set as default | [Vega] | Five pre-built views + user-saved |
| B6 | Version history viewer with diff (per automation) | [Vega + Atlas] | Side-by-side YAML diff; rollback button |
| B7 | Search bar (global) | [Vega] | Searches automation names + run IDs + activity items |
| B8 | Audit log viewer (user's own) — GDPR Art. 15 surface | [Comply + Vega] | Filterable, exportable as CSV |
| B9 | Founder dogfood + telemetry verification | [Founder + Trace] | 5+ daily visits over 14 days |

🎯 **Phase 1.2-CR exit:**
- Founder visits ControlRoom ≥ 1×/day for 14 consecutive days
- 0 missed-approval incidents
- < 5s median time-to-acknowledge for a critical alert
- ≥ 3 custom views created by founder within first 7 days
- All single-automation + single-run + bulk verbs work
- Foundation Jury PASS WITH FIXES on ControlRoom layer

### Phase 1.2-CR deliverables checklist

- [ ] Migration 0016 applied to prod
- [ ] `/app/controlroom` shell deployed
- [ ] Live run feed (SSE)
- [ ] Activity timeline (infinite scroll)
- [ ] Per-automation health cards
- [ ] Approval inbox (with 2FA step-up)
- [ ] Cost dashboard (KPIs + trends)
- [ ] All 13 single-automation action verbs
- [ ] All 4 single-run action verbs
- [ ] Bulk action selection
- [ ] Emergency freeze button
- [ ] 5 default custom views + user save/load
- [ ] Version history + diff + rollback
- [ ] Global search
- [ ] Audit log viewer
- [ ] Founder dogfood: 14 days consecutive

---

## Phase 1.3-CR — Custom dashboards + analytics

**Duration:** 1.5 weeks
**Lead:** [Vega + Forge]
**Concurrent:** AutoRoom 1.3-AR (Scribe automations)

### Goals

1. Drag-and-drop dashboard composer.
2. Widget palette: KPI tile, time-series chart, table, activity stream, integration strip, approval preview.
3. Multiple dashboards per user with default selection.
4. CSV exports for cost reports, activity timeline, audit log.
5. Cost forecasting (projected next-30-days spend).
6. Latency + cost profiler per run.

### Exit gates
🎯 Founder creates 2+ custom dashboards covering different operational concerns
🎯 Widget library bundle size < 80kB gzipped
🎯 Dashboards render within 1.5s on cold load
🎯 Cost forecast accuracy ≥ 70% within 14 days

---

## Phase 1.4-CR — Custom alerts + keyboard shortcuts

**Duration:** 1 week
**Lead:** [Forge + Vega + Watch]
**Concurrent:** AutoRoom 1.4-AR (Oracle automations)

### Goals

1. Alert rule builder (conditions × channels × frequencies).
2. Default alerts ship enabled (2 consecutive failures, 80/95/100% cost ceiling, integration disconnect).
3. Per-alert + global snooze and quiet hours.
4. Test alert (synthetic trigger) for verification.
5. Alert dedup (15-min default window, user-configurable).
6. Configurable keyboard shortcuts (defaults + user overrides).
7. Command palette (`Cmd/Ctrl + .`) for quick navigation.

### Exit gates
🎯 Founder configures 5+ custom alerts and uses them for real triage
🎯 Alert delivery success rate ≥ 99% in dogfood window
🎯 Keyboard shortcut adoption ≥ 50% of founder navigation actions
🎯 No alert-fatigue complaints (dedup working as designed)

---

## Phase 1.5-CR — Mobile parity + push notifications

**Duration:** 1.5 weeks
**Lead:** [Vega + Forge]
**Concurrent:** AutoRoom 1.5-AR (Treasurer); parent Phase 1.5 (Capacitor native shell)

### Goals

1. Every ControlRoom feature working on mobile via responsive layout.
2. Push notifications (PWA + Capacitor) for: approval-pending, critical alert, run-failed-3×, integration-broken.
3. Push deep-links to specific run / approval.
4. Swipe gestures: archive / approve / deny on cards.
5. Pull-to-refresh on all lists.
6. Mobile-default landing = Approval Inbox.
7. Signed-PDF export of audit log (compliance).

### Exit gates
🎯 Founder uses mobile ControlRoom 7+ consecutive days
🎯 Push notification delivery ≥ 98% success rate
🎯 Mobile First Load JS ≤ 180kB
🎯 Approval inline action from push notification works without app open

---

## Phase 1.6-CR — Conversational ops + AI diagnosis

**Duration:** 1 week
**Lead:** [Forge + Herald + Vega]
**Concurrent:** AutoRoom 1.6-AR (Voice + advanced flows)

### Goals

1. Chat-side commands: "pause all my jobs," "show me what failed yesterday," "approve everything from Sarah."
2. AI-assisted run diagnosis ("Why did this run fail?" — LLM reads step trace + suggests fix).
3. Cross-reference diagnostics ("show me other runs that failed with the same error").
4. Natural-language search ("show me runs that failed yesterday on Mailroom").
5. Voice triggers: "Hey AlterEgo, pause Morning Briefing for a week."

### Exit gates
🎯 Founder uses chat-side ControlRoom commands 3+ times/week
🎯 AI diagnosis accuracy ≥ 70% (founder rates "useful" on diagnosis suggestions)
🎯 Natural-language search returns correct top result ≥ 80% of the time
🎯 Voice trigger latency < 3s p95

---

## Phase 1.7-CR — Team dashboards + shared views

**Duration:** 2 weeks
**Lead:** [Forge + Compass + Shield]
**Concurrent:** AutoRoom 1.7-AR (multi-tenant collaboration); parent Phase 1.7 (multi-tenant launch); SOC 2 Type II audit kickoff 🛂

### Goals

1. Tenant-shared dashboards (team members can view + edit shared dashboards).
2. RBAC: dashboard owner / editor / viewer roles.
3. Share custom views with team members.
4. Dashboard library (community templates with ratings, Phase 2).
5. Per-team usage attribution (which user's automation cost what).
6. Cross-user activity timeline (with RBAC enforcement — only see what you're allowed).

### Exit gates
🎯 First 3 paying teams have ≥ 1 shared dashboard
🎯 RBAC pen-test (cross-tenant view leakage prevented) passes
🎯 Per-team cost attribution accuracy ≥ 95%
🎯 SOC 2 evidence: shared-dashboard access logs verifiable

---

## Phase 2.0-CR+ — Advanced analytics · ML insights · Dashboard marketplace

Quarter-by-quarter, post-launch:

| Quarter | Theme | Key initiatives |
|---|---|---|
| **Q1 post-launch** | Advanced analytics | User-built widgets · custom SQL widgets (RLS-bound) · cohort analysis · funnel metrics |
| **Q2** | ML-driven insights | Anomaly detection (cost spike, latency spike) · predictive forecasting · "your job will probably fail tomorrow" early warnings |
| **Q3** | Dashboard marketplace | Community-published dashboards with ratings · Verified-by-Compass badge for vetted templates · revenue-share for top creators |
| **Q4** | Cross-tenant insights | Anonymized benchmarks ("your VIP Watcher fires 3× more than median tenant") — opt-in only |
| **Year 2** | Public API + webhooks | Outbound webhooks for ControlRoom events · public read-API with OAuth scopes · integrations with Grafana / Datadog / etc. |

---

## Concurrent workstreams

### CWS-CR-1 · Recharts vs Visx bundle eval
- Start: Phase 1.2-CR-A
- Duration: 1 day spike
- Owner: [Vega]
- Output: choose widget library based on bundle size, ergonomics, accessibility

### CWS-CR-2 · SSE reliability hardening
- Start: Phase 1.2-CR-A
- Continuous through 1.5-CR
- Owner: [Forge + Watch]
- Output: connection-resilient SSE with polling fallback, "reconnecting" banner, packet-loss telemetry

### CWS-CR-3 · Mobile push provider eval
- Start: Phase 1.4-CR
- Owner: [Terra + Forge]
- Output: OneSignal vs Pusher Beams vs custom — decision before 1.5-CR

### CWS-CR-4 · Custom-SQL widget security model
- Start: Phase 1.3-CR (decision deferred to Phase 2)
- Owner: [Shield]
- Output: design for read-only, RLS-bound, parametrized custom-SQL widgets without escape hatches

---

## Risk register (top 10, ControlRoom-specific)

| # | Risk | Phase exposure | Live mitigation |
|---|---|---|---|
| 1 | User overwhelmed by customization options | All phases | Ship 5 default views; "Advanced" panel hides power features until requested |
| 2 | SSE connection drops cause silent staleness | All phases | Visible "reconnecting" banner after 30s; auto-recover; polling fallback |
| 3 | Widget library bundle bloat (Recharts is 60kB+) | 1.2-CR | Sprint A spike to confirm < 80kB gzipped; consider Visx if over |
| 4 | Custom view query slowness (huge time range × many filters) | 1.2-CR | Server-side query timeout at 3s; surface "narrow your filters" hint |
| 5 | Alert fatigue (too-frequent alerts) | 1.4-CR | Default dedup window 15min; user-configurable; daily-digest option |
| 6 | Mobile push delivery unreliable (carrier-specific quirks) | 1.5-CR | OneSignal/Pusher fallback; in-app re-poll on focus |
| 7 | Cross-tenant data leak via shared dashboard | 1.7-CR | Pen-test before launch; per-widget RLS enforcement |
| 8 | Audit log viewer exposes data violating retention policy | 1.2-CR | Comply gate review; aged-row truncation per retention spec |
| 9 | Replay action causes duplicate side effects | 1.3-CR+ | Idempotency keys per sub-agent call; user warning on replay-with-side-effects |
| 10 | Custom dashboard breaks after schema migration | 1.3-CR+ | Widgets reference stable view names, not raw columns; migration script updates views |

---

## Cost trajectory

ControlRoom is mostly UI work; no major LLM cost added by ControlRoom itself.

| Stage | ControlRoom cost delta | Notes |
|---|---|---|
| Phase 1.2-CR | ~$0/mo | UI only; no LLM calls |
| Phase 1.3-CR (custom dashboards) | ~$0/mo | Read aggregations are cheap |
| Phase 1.4-CR (alerts) | Twilio SMS marginal cost ~$0.01/SMS | Small if user has reasonable alert volume |
| Phase 1.5-CR (mobile push) | OneSignal/Pusher: $20-100/mo platform fee | Fixed overhead |
| Phase 1.6-CR (AI diagnosis) | +$0.05 per diagnosis (Haiku) | Variable, capped by user-clicks |
| Phase 1.7-CR (multi-tenant) | Database query load grows | Plan indexes carefully |
| Phase 2 Q2 (ML insights) | ML inference cost variable | Defer until justified by usage |

---

## Hiring trigger points

| Trigger | Hire | Phase |
|---|---|---|
| ControlRoom + AutoRoom + parent phase 1.7 launch | Frontend specialist (React + accessibility + perf) | Phase 1.7-CR |
| AI diagnosis usage > 100/day in Phase 1.6-CR | ML/LLM engineer (cost optimization specialist) | Phase 2 Q1 |
| 500+ paying users + custom dashboard adoption > 60% | Design systems engineer (widget composer polish) | Phase 2 Q2 |

---

## Critical path

```
AutoRoom 1.2-AR (data) ──► ControlRoom 1.2-CR (MVP)
                                  │
                                  ├──► 1.3-CR (custom dashboards)
                                  │           │
                                  │           ├──► 1.4-CR (alerts)
                                  │           │           │
                                  │           ▼           ▼
                                  │     1.5-CR (mobile + push)
                                  │                       │
                                  ▼                       ▼
                            1.6-CR (conversational ops)
                                  │
                                  ▼
                            1.7-CR (team dashboards)
```

**Earliest realistic ControlRoom GA:** 9 weeks (~2 months) from Phase 1.2-CR kickoff, assuming AutoRoom Phase 1.2-AR is complete first.

---

## Phase exit checklists (summary)

| Phase | Sign-off requires |
|---|---|
| **1.2-CR** | Founder uses ControlRoom 14 days consecutive · 5 views default + user-saved work · all action verbs work · SSE delivers < 1s · Foundation Jury PASS WITH FIXES |
| **1.3-CR** | Founder builds 2+ custom dashboards · widget bundle < 80kB · cost forecast 70% accurate |
| **1.4-CR** | Founder configures 5+ alerts · alert delivery ≥ 99% · dedup working · no fatigue complaints |
| **1.5-CR** | Mobile use 7+ days consecutive · push delivery ≥ 98% · mobile bundle ≤ 180kB |
| **1.6-CR** | Chat-side commands work · AI diagnosis ≥ 70% useful · natural-language search ≥ 80% accuracy |
| **1.7-CR** | First 3 teams share dashboards · RBAC pen-test passes · cost attribution ±5% · SOC 2 evidence |

---

## Integration with parent + AutoRoom roadmaps

**Phase alignment table:**

| Parent | AutoRoom | ControlRoom | Sub-agents in play |
|---|---|---|---|
| 1.1 | (not yet) | (not yet) | Mailroom + Scheduler (live now) |
| 1.2 | 1.2-AR (MVP) | 1.2-CR (MVP) | + Mailroom write + Scheduler write + Companion v1 |
| 1.3 | 1.3-AR (Scribe automations) | 1.3-CR (dashboards) | + Scribe + Substack |
| 1.4 | 1.4-AR (Oracle automations) | 1.4-CR (alerts) | + Oracle (cardology + astrology + tarot) |
| 1.5 | 1.5-AR (Treasurer automations) | 1.5-CR (mobile + push) | + Treasurer (Plaid) |
| 1.6 | 1.6-AR (Voice + advanced) | 1.6-CR (conversational ops) | + Voice (TTS + Whisper) |
| 1.7 | 1.7-AR (multi-tenant) | 1.7-CR (team dashboards) | All sub-agents live |

ControlRoom is **always one beat behind AutoRoom in the same phase** — AutoRoom builds the data, ControlRoom exposes the operations surface. Both ship at phase end.

---

## Document change log

| Date | Version | Change |
|---|---|---|
| 2026-06-03 | 0.1 | Initial draft. Phase 1.2-CR sprint-detailed. Customization features (views, dashboards, alerts) split across 1.2-CR through 1.4-CR. Mobile parity locked at 1.5-CR. |

---

*End of ControlRoom Roadmap v0.1.*

*Next decisions:* resolve [CONTROLROOM_PRD.md](./CONTROLROOM_PRD.md) §15 open questions before Phase 1.2-CR Sprint A kickoff. Coordinate Sprint A start with AutoRoom Sprint A completion.
