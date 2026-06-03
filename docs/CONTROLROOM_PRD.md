# Autonomux ControlRoom — Product Requirements

**Version:** 0.1 (draft)
**Date:** 2026-06-03
**Owner:** kameleyon
**Companion docs:** [PRD.md](./PRD.md) · [AUTOROOM_PRD.md](./AUTOROOM_PRD.md) · [CONTROLROOM_FUNCTIONALITIES.md](./CONTROLROOM_FUNCTIONALITIES.md) · [CONTROLROOM_ROADMAP.md](./CONTROLROOM_ROADMAP.md)
**Status:** Draft for Phase 1.2-CR sprint planning · ships alongside AutoRoom MVP

---

## 1. Mission

ControlRoom is the **user-facing operations surface** for everything AlterEgo runs on the user's behalf. Where AutoRoom is the build surface (the "editor"), ControlRoom is the operate surface (the "control panel"). It answers four questions in one screen:

1. **What is AlterEgo doing right now?**
2. **What did it do recently — and was it right?**
3. **What is it about to do that I need to approve?**
4. **What's broken, what costs too much, what should I change?**

Plus the user can act on any of those answers without leaving the screen: pause a job, cancel a run, edit a step, approve a pending action, rollback to a previous version, delete an automation outright.

---

## 2. The problem

Today autonomux has:
- A chat surface for ad-hoc questions (no observability beyond the current conversation).
- An admin cpanel for operator-side audit work (Forge / Comply use; not user-facing).
- AutoRoom (designed, building) — lets users create automations but offers no surface to watch them.

Without ControlRoom, a user who enables Morning Briefing has no way to:
- See if it ran this morning.
- See what it cost.
- Pause it for a week of vacation.
- See pending approvals from three different jobs in one place.
- Spot that one job has been failing silently.
- Roll back an edit that broke things.

Trust requires visibility. AutoRoom without ControlRoom is a black box.

---

## 3. Where it sits

Three surfaces, three workspaces, one backend:

| Surface | Purpose | Mental model |
|---|---|---|
| **Chat** (`/app/chat`) | Converse with AlterEgo, ad-hoc actions | The chat client |
| **AutoRoom** (`/app/autoroom`) | Build + configure automations | The editor |
| **ControlRoom** (`/app/controlroom`) | Watch + operate + intervene | The control panel |

ControlRoom is the user's primary destination for "is everything okay?" Chat is for "I have a question." AutoRoom is for "I want to build/change a recipe."

---

## 4. ICP fit

Same four ICPs as the main PRD §3. Each cares about different ControlRoom surfaces:

| ICP | Most-used ControlRoom view |
|---|---|
| **Polymath** | Activity timeline (chronological "what happened today") |
| **Founder** | Approval inbox + cost dashboard (oversight + spend control) |
| **Creator** | Run history per Substack draft + voice-match score trends |
| **Wellness practitioner** | Compliance / consistency dashboard ("did I do my morning routine 7 days straight?") |

Default ControlRoom landing page is **ICP-aware**: each ICP sees their dominant view first.

---

## 5. Core concepts

| Concept | Definition |
|---|---|
| **Run** | One execution of an automation. Has a lifecycle (pending → running → completed/failed/cancelled/awaiting_approval). Defined in AutoRoom; observable in ControlRoom. |
| **Activity item** | A user-visible row in the timeline. Auto-generated from `audit_log` + automation_runs. One activity per significant event (run started, run completed, action taken, approval requested). |
| **Approval** | A pending decision belonging to a run. Surfaces in the Approval Inbox until decided or expired. |
| **Health signal** | A computed metric per automation: success rate (last 30 runs), avg cost, avg duration, last-error class. Surfaces as a per-automation card. |
| **Integration status** | Per-integration health (Gmail connected, OAuth valid, last successful call < N min ago). Drives the integrations strip. |
| **Custom view** | A user-saved combination of filters, sort order, columns, and widgets that the user can re-open in one click. |
| **Custom widget** | A user-composed dashboard tile (e.g. "Cost this week", "Failed runs", "VIP sender activity"). User picks data source + visualization. |
| **Custom alert** | A user-defined threshold ("notify me if Morning Briefing fails 2× in a row") that emits to the user's chosen channel. |
| **Bulk action** | One control verb applied to N selected automations or runs (pause 5 jobs, archive 12 old runs). |

---

## 6. Control surface (the verbs)

ControlRoom is verb-dense. Every object (automation, run, approval, integration) has a clear set of allowed verbs. The matrix:

| Object | Verbs available |
|---|---|
| **Automation** | view · edit · clone · pause · resume · archive · unarchive · delete · rollback to version · run now · export YAML · share (1.7+) · change trust tier |
| **Run** | view · cancel (if running) · replay · retry from failed step · acknowledge (mark seen) · pin (keep at top of feed) · share permalink |
| **Step within a run** | view input · view output · view cost · view trace · retry just this step · download payload |
| **Approval** | approve · deny · postpone · request more info · view the action being approved · view the run that requested it |
| **Integration** | view status · reconnect · revoke · view affected automations |
| **Custom view** | save · rename · share (1.7+) · delete · set as default · pin to sidebar |
| **Custom widget** | add to dashboard · configure · resize · remove · duplicate |
| **Custom alert** | create · edit · pause · delete · test (fire a synthetic trigger) |

**Every destructive verb (delete, revoke, cancel-mid-write) requires explicit confirmation.** Non-destructive verbs apply immediately with one click.

---

## 7. Customization model (the differentiator)

ControlRoom is **highly customizable by design**. The static-dashboard pattern is the wrong one — users have wildly different preferences for what to surface first.

### 7.1 Custom views

A "view" is a saved combination of:
- **Filters** (status, tag, sub-agent, ICP, date range, cost range, trust tier, integration)
- **Sort order** (most recent / most expensive / most failed / most useful)
- **Columns** (which fields appear in the table)
- **Density** (compact / comfortable / spacious)
- **Default time range** (today / this week / this month / custom)

Users can save unlimited views. Each view gets a name + optional icon. Views can be **pinned to the ControlRoom sidebar** for one-click access.

Default ships with five pre-built views:
1. **All active** (default landing — every active automation)
2. **Needs attention** (failed in last 24h, approval pending, integration broken)
3. **Most expensive** (sorted by cost desc, last 30 days)
4. **Recently changed** (edited or version-bumped in last 7 days)
5. **Archived** (paused + archived, hidden from main views)

### 7.2 Custom dashboards (Phase 1.3-CR)

The user composes a dashboard from a widget palette. Widgets include:
- KPI tiles (cost this week, runs this week, success rate, approval-pending count)
- Time-series charts (cost over time, runs per day, latency p95)
- Tables (top 10 most-run automations, top 10 most expensive, recently failed)
- Activity stream (last N items, filterable)
- Integration health strip
- Approval inbox preview (top 3)
- Custom — a user-written query against `automation_runs` (advanced)

Users can have multiple dashboards (e.g., "Daily check-in", "Cost review", "Compliance check"). Each dashboard is shareable as a JSON template (Phase 1.7+).

### 7.3 Custom alerts

Users define per-automation or global alert rules. Each rule is `(condition, channel, frequency)`:
- **Conditions**: failure (N consecutive, N in window), cost (over $X per run, $Y per day), latency (slower than X seconds), approval-expired, integration-disconnected, anomaly-detected.
- **Channels**: in-app notification, email, SMS, push (1.5+), Slack webhook (1.6+).
- **Frequency**: immediate, hourly batch, daily digest.
- **Snoozing**: per-alert and global "quiet hours."

Defaults shipped at first run: alert on 2 consecutive failures, alert at 80% / 95% / 100% of monthly cost ceiling, alert on integration disconnect.

### 7.4 Custom notification routing

The user maps event class → channel. Defaults:
- Approval requested → in-app + push (mobile)
- Run failed → in-app (non-urgent)
- Cost ceiling hit → in-app + email
- Integration broken → in-app + email + SMS (if SMS enabled)

Users can override every mapping per automation (e.g., "VIP Watcher approvals always SMS me; other approvals stay in-app").

### 7.5 Other customizations

- **Theme density**: compact (more rows visible) vs comfortable vs spacious
- **Color theme**: defaults match autonomux brand; light/dark/auto
- **Keyboard shortcuts**: configurable per action (default `?` opens the help sheet)
- **Default time zone display** (when looking at run timestamps)
- **Report cadence**: daily digest / weekly digest / monthly summary / never; user picks which channels receive each

---

## 8. Real-time freshness model

ControlRoom must feel **live**. Stale data is a trust killer.

| Surface | Freshness target | Mechanism |
|---|---|---|
| Run feed (in-flight runs) | < 1s | SSE stream from `automation:run:*` Redis pub/sub channels |
| Approval inbox | < 2s | SSE + DB poll fallback |
| Activity timeline | < 5s | DB poll (existing pattern) |
| Cost dashboard | 1 minute cache | Aggregate from `automation_runs` |
| Health signals | 5 minute cache | Background job recomputes |
| Integration status | 30s | OAuth token validity ping |

The SSE bridge already exists for chat. ControlRoom reuses it on a separate channel namespace (`controlroom:tenant:*`).

---

## 9. Mobile parity

ControlRoom MUST work on mobile. Users will check status on the go more than they'll build automations on the go.

**Mobile-specific behaviors:**
- Approval inbox is the default mobile landing (highest action density).
- One-tap approve / deny on the approval card.
- Push notification deep-links to the relevant run / approval.
- Pinch-to-zoom on dashboard widgets (charts).
- Swipe-to-archive on activity items.
- Pull-to-refresh on every list view.

The collapsible app shell (Phase 1.7 work already shipped) means ControlRoom inherits the mobile drawer pattern for free.

---

## 10. Compliance + audit visibility

The user can see their own audit log. This is **GDPR Art. 15 — Right of Access** support, plus pure transparency:

- Every user has a "My audit log" view showing every action AlterEgo took on their behalf, chained-hashed and verifiable.
- Each row links to the originating automation + run.
- Filterable by action class, integration, time range.
- Exportable as CSV (Phase 1.3-CR) or signed PDF (1.5-CR).

The user can verify the audit chain integrity from this view (`verify_audit_chain(my_tenant)` returns OK/FAIL).

---

## 11. Performance budgets

- ControlRoom landing page: **< 800ms** TTI (server-render + skeleton + hydrate).
- Live run feed update: **< 100ms** from event to DOM.
- Dashboard with 10 widgets: **< 1.5s** to fully render.
- Search across runs: **< 500ms** for last 30 days, **< 2s** for last year.
- Mobile bundle: **< 180kB** First Load JS.

---

## 12. Success metrics

### Phase 1.2-CR launch (founder dogfood)
- Founder visits ControlRoom ≥ 1×/day for 14 consecutive days.
- 0 missed-approval incidents (approval expires without user seeing it).
- < 5 second median time-to-acknowledge for a critical alert.
- ≥ 3 custom views created by founder within first 7 days.

### Phase 1.7-CR launch (external paying users)
- 80% of users open ControlRoom within 24h of first automation enable.
- Median user has 2+ custom views saved within 30 days.
- 95% of approvals decided within their TTL (no expired-by-default).
- < 2% of users complain about "missed something AlterEgo did."

### Operational (always)
- 99.9% SSE delivery success rate.
- < 1% of dashboard widget renders fail.
- 0 cross-tenant data exposure incidents.

---

## 13. Non-goals

- **Operator-grade observability** (queue depth, worker health, infrastructure metrics) → those live in the admin cpanel, not ControlRoom.
- **Multi-tenant team dashboards** (Phase 1.7+).
- **AI-driven anomaly insights** ("you spent 3× more on Mailroom this week — here's why") → defer to Phase 2+ ML work.
- **Custom code execution in widgets** → no JavaScript in user-defined widgets (security boundary).
- **Real-time collaboration on a dashboard** (multiple users editing simultaneously) → Phase 2+.

---

## 14. Dependencies

| Required | Status |
|---|---|
| AutoRoom Phase 1.2-AR (provides automation_runs + automation_step_runs + automation_approvals) | NEEDS BUILD |
| Migration 0015 — AutoRoom schema | ✅ APPLIED |
| SSE bridge (existing chat pattern) | EXISTS (apps/web SSE route) |
| Audit chain (`packages/audit`) | EXISTS |
| Notification system (in-app + email via Resend) | PARTIAL (Resend wired; in-app notification surface NEEDS BUILD) |
| Tenant isolation (RLS) | EXISTS |
| App shell (collapsible primary sidebar) | EXISTS (shipped 1bfcd57) |
| Widget rendering library (charts) | NEEDS DECISION (Recharts vs Visx vs custom — defer to Sprint A) |

---

## 15. Open questions (resolve before Phase 1.2-CR build)

1. **Widget library choice**: Recharts (battle-tested, larger bundle), Visx (lighter, more flexible), or custom CSS-driven (smallest bundle, limited capability). Recommendation: Recharts for MVP, revisit at 1.5.
2. **Custom dashboard persistence**: per-user JSON blob in `user_settings` vs. dedicated `custom_dashboards` table. Recommendation: dedicated table, easier to query + share later.
3. **Live SSE vs polling fallback**: if SSE connection drops, do we degrade to 5s polling or show a "reconnecting" banner? Recommendation: silent polling fallback for 30s, then banner.
4. **Approval inbox urgency model**: do approvals have a "priority" field (high/medium/low) or just rely on TTL? Recommendation: TTL-driven with auto-promotion to high when < 1h remaining.
5. **Bulk actions transaction boundary**: if user selects 10 automations and "pause all," do we pause as a transaction (all-or-nothing) or best-effort? Recommendation: best-effort with per-item result feedback.
6. **Export format**: YAML for editing-friendliness or JSON for tool-friendliness? Recommendation: YAML primary (matches AutoRoom format), JSON secondary.

---

## 16. Risk register

| Risk | Mitigation |
|---|---|
| User overwhelmed by customization options | Ship with 5 default views + 5 default widgets; "Advanced" panel hides power features until requested |
| SSE connection drops cause silent staleness | Visible "reconnecting" banner after 30s of failed reconnects; auto-recover |
| User builds a custom view that's slow (huge time range, many filters) | Server-side query timeout at 3s; surface "narrow your filters" hint |
| Cross-tenant leak via custom widget SQL escape hatch | Custom-SQL widgets are RLS-bound + read-only + parametrized; no raw SQL input |
| Alert rule fires too often (alert fatigue) | Built-in dedup: same rule won't fire more than 1×/15min by default; user-configurable |
| Custom dashboard breaks after a schema change | Widgets reference stable view names, not table columns directly; migration script updates views |

---

## 17. Document change log

| Date | Version | Change |
|---|---|---|
| 2026-06-03 | 0.1 | Initial draft. Phase 1.2-CR scope locked. Customization model finalized. Mobile parity required from MVP. |

---

*End of ControlRoom PRD v0.1.*

*Next decisions:* resolve §15 open questions before Phase 1.2-CR Sprint A kickoff. Run this doc through [Compass · Vega · Probe] gate before locking the build plan.
