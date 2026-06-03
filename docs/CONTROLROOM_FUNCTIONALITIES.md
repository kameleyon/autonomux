# Autonomux ControlRoom — Functionalities

**Version:** 0.1 (draft)
**Date:** 2026-06-03
**Owner:** kameleyon
**Companion docs:** [CONTROLROOM_PRD.md](./CONTROLROOM_PRD.md) · [CONTROLROOM_ROADMAP.md](./CONTROLROOM_ROADMAP.md) · [AUTOROOM_FUNCTIONALITIES.md](./AUTOROOM_FUNCTIONALITIES.md)
**Status:** Comprehensive feature inventory · MVP scoped to Phase 1.2-CR

This document is the canonical list of every capability ControlRoom must offer. Each functionality is tagged:
- ✅ MVP — ships with Phase 1.2-CR
- 🟡 1.3–1.5 — follow-on phases
- 🔵 1.6+ — later
- ⚪ deferred — Phase 2+ or never

---

## 1. Live run feed

What's running, queued, and just finished — updated in real time.

| Feature | Tag |
|---|---|
| Live SSE stream of in-flight runs | ✅ |
| Inline progress per step (1/5, 2/5, etc.) with current step name | ✅ |
| Live cost ticker per run | ✅ |
| Live duration counter | ✅ |
| Visual indicator (spinning / paused / awaiting-approval / succeeded / failed) | ✅ |
| Click any run → opens per-run detail | ✅ |
| Filter by automation, status, tag, time range | ✅ |
| Auto-scroll to newest (or pin to current view) | ✅ |
| Pause auto-scroll when user scrolls up (no yank) | ✅ |
| Pin a specific run to the top | ✅ |
| Group by automation (collapse runs of same job) | 🟡 |
| Show queue depth indicator (X runs waiting) | 🟡 |
| Drill into Redis-level queue state | 🔵 (admin only normally; user-facing for advanced) |

---

## 2. Activity timeline

Chronological "what AlterEgo did" feed.

| Feature | Tag |
|---|---|
| Reverse-chronological infinite scroll | ✅ |
| Items pulled from `audit_log` + `automation_runs` + approvals + manual actions | ✅ |
| Per-item: timestamp, action verb, related automation, cost, link to run | ✅ |
| Filter by date range, action class, automation, integration | ✅ |
| Search by keyword (recipient name, subject snippet, file name) | ✅ |
| Compact / comfortable / spacious density toggle | ✅ |
| Pin an item ("remember this for later") | ✅ |
| Acknowledge items (mark "I've seen this") with batch-acknowledge | ✅ |
| Undo eligible items inline (within their undo window) | ✅ |
| Export filtered timeline as CSV | 🟡 |
| Export filtered timeline as signed PDF (compliance) | 🔵 |
| Group by day / hour | ✅ |
| Show "what was different" diff for state-changing items | 🟡 |

---

## 3. Per-automation health card

The "is this job okay?" view, surfaced as a card and a deep view.

| Field on the card | Tag |
|---|---|
| Status (active / paused / archived / error) | ✅ |
| Success rate (last 30 runs) | ✅ |
| Last run timestamp + outcome | ✅ |
| Next scheduled run | ✅ |
| Avg cost per run + total cost this month | ✅ |
| Avg duration | ✅ |
| Trust tier badge | ✅ |
| Integrations the job depends on (with health dots) | ✅ |
| Last 30 runs sparkline (success/failure pattern) | ✅ |
| Approval-pending badge (if any) | ✅ |
| Quick actions: pause / run now / edit / clone | ✅ |
| Click → opens per-automation deep view | ✅ |

Deep view adds:
- Full run history (last 50, paginated)
- Cost trend over time chart
- Latency p50/p95 trend
- Approval acceptance rate
- Version history with diff viewer
- Edit log (who changed what when, even for solo user)

---

## 4. Per-run detail view

Step-by-step timeline of one specific run.

| Feature | Tag |
|---|---|
| Step timeline (vertical, top-to-bottom) | ✅ |
| Per-step: name, status, duration, cost, attempts | ✅ |
| Inline view of step input (collapsed by default, expand to see) | ✅ |
| Inline view of step output | ✅ |
| Step error message + retry log | ✅ |
| LLM trace per LLM step (model, tokens in/out, cost) | ✅ |
| Sub-agent run linkage (click → opens the sub_agent_runs row) | ✅ |
| OTel trace deep-link (admin only) | 🟡 |
| Replay run (re-execute from scratch) | ✅ |
| Retry from failed step (re-execute starting at step N) | 🟡 |
| Download raw run JSON (for support / debugging) | 🟡 |
| Share run permalink | ✅ |
| Cancel in-flight run (only if status='running') | ✅ |
| Pin run for later review | ✅ |
| Annotate run with note ("this one drafted wrong tone") | 🟡 |
| Run feedback (thumbs up/down) — feeds trust-ramp signal | ✅ |

---

## 5. Approval inbox

The unified inbox of pending approvals across all automations.

| Feature | Tag |
|---|---|
| List of all pending approvals, sorted by urgency | ✅ |
| Per-approval: action summary, requesting automation, action class, cost-if-approved, TTL countdown | ✅ |
| Inline approve / deny / postpone buttons | ✅ |
| Approve-all and deny-all bulk actions (with confirmation) | ✅ |
| 2FA step-up for high-risk approvals (money / destructive / personal_data) | ✅ |
| Filter by action class, automation, urgency | ✅ |
| Search by content of the action | ✅ |
| Snooze a single approval (delay re-prompt) | 🟡 |
| Auto-decline on TTL expire (configured per-approval) | ✅ |
| Notification routing per approval class | ✅ |
| Mobile: swipe-to-approve / swipe-to-deny | ✅ |
| Deep-link from push notification | ✅ |

---

## 6. Cost dashboard

How much AlterEgo is costing you, broken down.

| Widget | Tag |
|---|---|
| This month spend (with progress vs budget) | ✅ |
| This week spend | ✅ |
| Today spend | ✅ |
| Top 10 most-expensive automations (last 30 days) | ✅ |
| Cost by sub-agent (pie / bar) | ✅ |
| Cost by model (Haiku/Sonnet/Opus) | ✅ |
| Cost trend (last 90 days line chart) | ✅ |
| Per-tenant budget ceiling + current % used | ✅ |
| Per-automation budget ceiling settings | ✅ |
| Forecast: projected spend next 30 days | 🟡 |
| Cost-per-outcome metric (e.g., $ per email drafted) | 🟡 |
| Anomaly highlight: "Tuesday was 3× normal" | 🟡 |
| Export cost report as CSV | ✅ |

---

## 7. Integration health monitor

Per-integration status strip.

| Integration | Surface | Tag |
|---|---|---|
| Gmail | connected / disconnected / OAuth expiring soon | ✅ |
| Google Calendar | same | ✅ |
| Resend (outbound email) | last successful send timestamp | ✅ |
| Twilio (SMS) | last successful send | 🟡 |
| Substack | last successful publish | 🟡 |
| Plaid | last successful transaction sync | 🟡 |
| Per-integration: list of automations affected by status | ✅ |
| Reconnect button (re-runs OAuth flow) | ✅ |
| Revoke button (disconnects + auto-pauses affected automations) | ✅ |
| "Test connection" button | 🟡 |

---

## 8. Run controls (the action verbs)

What the user can DO to running and persisted automations.

### 8.1 On a single automation

| Verb | Confirmation? | Tag |
|---|---|---|
| Edit | none (opens AutoRoom) | ✅ |
| Pause | none | ✅ |
| Resume | none | ✅ |
| Run now (manual trigger) | none | ✅ |
| Clone (duplicate as new automation) | name prompt | ✅ |
| Change trust tier (e.g., Observe → Propose) | confirmation (because behavior changes) | ✅ |
| Archive (soft delete, preserves history) | confirmation | ✅ |
| Unarchive | none | ✅ |
| Delete (hard, cascades runs) | two-step confirmation + typed name | ✅ |
| Rollback to previous version | confirmation showing diff | ✅ |
| Export as YAML | none | ✅ |
| Export as JSON | none | 🟡 |
| Share (Phase 1.7+) | per-share confirmation | ⚪ |
| Lock (no further edits) | confirmation | 🟡 |

### 8.2 On an in-flight run

| Verb | Confirmation? | Tag |
|---|---|---|
| Cancel (with safe step boundary stop) | confirmation if mid-write_irreversible | ✅ |
| Kill (immediate, may leave inconsistent state) | two-step confirmation | 🟡 |
| Acknowledge (mark seen) | none | ✅ |
| Pin | none | ✅ |

### 8.3 On a completed run

| Verb | Tag |
|---|---|
| Replay (re-execute from scratch) | ✅ |
| Retry from failed step | 🟡 |
| Annotate | 🟡 |
| Share permalink | ✅ |
| Download raw JSON | 🟡 |

### 8.4 Bulk actions

| Action | Tag |
|---|---|
| Multi-select automations → bulk pause / resume | ✅ |
| Multi-select runs → bulk acknowledge | ✅ |
| Multi-select approvals → bulk approve / deny (with class-class enforcement) | ✅ |
| Multi-select activity items → bulk archive | ✅ |
| Tag selected items (assign a label) | 🟡 |

### 8.5 Global / emergency

| Verb | Confirmation? | Tag |
|---|---|---|
| Pause ALL my automations | confirmation | ✅ |
| Tenant emergency freeze (halts everything within 5s) | 2FA + confirmation | ✅ |
| Resume all (after freeze) | 2FA + confirmation | ✅ |

---

## 9. Edit / save / rollback / version history

The user can edit any automation; ControlRoom shows the diff and persists versions.

| Feature | Tag |
|---|---|
| In-place edit launches AutoRoom editor with current config loaded | ✅ |
| Save → publishes new version (increments `version` column on `automations`) | ✅ |
| Version history list per automation | ✅ |
| Diff viewer (side-by-side YAML diff) | ✅ |
| Rollback to any prior version (with confirmation) | ✅ |
| Draft mode: save without publishing (autosave every 30s) | ✅ |
| Discard draft | ✅ |
| Edit log: who edited (user_id), when, what changed | ✅ |
| Compare any two versions (not just current vs prior) | 🟡 |
| Branch a draft from a prior version | 🔵 |

---

## 10. Custom views

User-saved combinations of filters / sort / columns / density.

| Feature | Tag |
|---|---|
| Save current filter/sort as named view | ✅ |
| View list in sidebar | ✅ |
| Pin views to sidebar (one-click access) | ✅ |
| Set a default view (opens on ControlRoom landing) | ✅ |
| Rename / delete views | ✅ |
| Duplicate a view | ✅ |
| Export view config as JSON (for backup / sharing later) | 🟡 |
| Share view with team (Phase 1.7+) | ⚪ |
| Default ships with 5 pre-built views (All active / Needs attention / Most expensive / Recently changed / Archived) | ✅ |

---

## 11. Custom dashboards (Phase 1.3-CR)

User-composed dashboards built from widget palette.

| Feature | Tag |
|---|---|
| Drag-and-drop widget composer | 🟡 |
| Widget palette: KPI tile, time-series chart, table, activity stream, integration strip, approval preview | 🟡 |
| Resize widgets (grid layout, 12-column) | 🟡 |
| Configure widget data source per widget (which automation, time range, filter) | 🟡 |
| Configure visualization (line / bar / pie / sparkline) | 🟡 |
| Multiple dashboards per user | 🟡 |
| Default dashboard (opens on landing) | 🟡 |
| Dashboard export as JSON template | 🟡 |
| Custom-SQL widget (read-only, RLS-bound, parametrized) | 🔵 |
| Share dashboard (Phase 1.7+) | ⚪ |
| Dashboard library (community templates) | ⚪ |

---

## 12. Custom alerts

User-defined trigger rules → notification.

| Capability | Tag |
|---|---|
| Create alert rule (condition + channel + frequency) | ✅ |
| Conditions: failure count, cost threshold, latency p95, approval expired, integration disconnected, anomaly | ✅ |
| Channels: in-app, email, SMS (1.5+), push (1.5+), Slack (1.6+) | ✅ |
| Frequency: immediate / hourly batch / daily digest | ✅ |
| Per-alert snooze | 🟡 |
| Global quiet hours (10pm–7am no alerts except critical) | ✅ |
| Test alert (synthetic trigger) | 🟡 |
| Alert history (last N firings) | ✅ |
| Alert dedup (same rule won't fire > 1×/15min default) | ✅ |
| User-configurable dedup window | 🟡 |
| Edit / pause / delete rules | ✅ |
| Default alerts shipped: 2 consecutive failures, 80/95/100% cost ceiling, integration disconnect | ✅ |

---

## 13. Notification routing preferences

How alerts and approvals reach the user.

| Feature | Tag |
|---|---|
| Per-event-class → channel mapping | ✅ |
| Per-automation override of routing | ✅ |
| Quiet hours global setting | ✅ |
| Quiet hours per-channel | 🟡 |
| Channel rate limits (max N SMS/day) | ✅ |
| Test notification (send a sample) | ✅ |
| Notification history (last N delivered) | ✅ |

---

## 14. Search & discovery

Find anything across runs, activities, automations.

| Feature | Tag |
|---|---|
| Global search bar (top of ControlRoom) | ✅ |
| Search across: automation names, run IDs, recipient names, subject snippets, file names, error messages | ✅ |
| Full-text search across activity log | ✅ |
| Recent searches saved | ✅ |
| Save a search as a custom view | ✅ |
| Search filters (date, status, automation, integration) | ✅ |
| Search results highlighted in context | 🟡 |
| Natural-language search ("show me runs that failed yesterday on Mailroom") | 🔵 |

---

## 15. Mobile parity

Every ControlRoom capability accessible on mobile.

| Feature | Tag |
|---|---|
| Responsive layout via app shell drawer (already shipped) | ✅ |
| Mobile default landing = Approval Inbox | ✅ |
| Swipe gestures: archive / approve / deny on cards | ✅ |
| Pull-to-refresh on lists | ✅ |
| Push notifications (PWA + Capacitor) | 🟡 |
| Push deep-link to specific run / approval | 🟡 |
| Offline mode (read-only of cached data) | 🔵 |
| Touch-friendly tap targets ≥ 44px | ✅ |
| Pinch-zoom on dashboard charts | 🟡 |

---

## 16. Real-time streaming

Live updates without page reloads.

| Feature | Tag |
|---|---|
| SSE stream from `controlroom:tenant:{tenant_id}` channel | ✅ |
| In-flight run updates (step transitions, cost increments) | ✅ |
| New activity item arrival | ✅ |
| New approval arrival | ✅ |
| Cost ceiling warning broadcast | ✅ |
| Polling fallback when SSE drops (5s) | ✅ |
| "Reconnecting…" banner after 30s of failed reconnects | ✅ |
| Manual refresh button always available | ✅ |

---

## 17. Audit log viewer (user's own)

GDPR Art. 15 + transparency.

| Feature | Tag |
|---|---|
| Browse own audit log chronologically | ✅ |
| Filter by action class, automation, time range | ✅ |
| Search audit log by keyword | ✅ |
| Verify chain integrity inline ("All entries verified") | ✅ |
| Export as CSV | 🟡 |
| Export as signed PDF (Phase 1.5-CR) | 🔵 |
| Each row links to source automation + run | ✅ |
| Tamper-evident badge per row | ✅ |

---

## 18. Diagnostic tools

For when something goes wrong.

| Tool | Tag |
|---|---|
| Replay run (re-execute against current data) | ✅ |
| Dry-run from any past run (re-execute with read-only side effects) | 🟡 |
| Step-by-step replay debugger | 🔵 |
| Download run JSON for support | 🟡 |
| "Why did this fail?" AI-assisted diagnosis (LLM reads step trace + error) | 🔵 |
| Cross-reference: "show me other runs that failed with the same error" | 🟡 |
| Latency profiler (which step took the longest) | ✅ |
| Cost profiler (which step cost the most) | ✅ |

---

## 19. Theming + accessibility

| Feature | Tag |
|---|---|
| Density toggle (compact / comfortable / spacious) | ✅ |
| Light / dark / auto theme | 🟡 |
| Color palette respects autonomux brand | ✅ |
| WCAG 2.2 AA conformance | ✅ |
| Screen-reader support (every list virtualized but accessible) | ✅ |
| Keyboard shortcuts (configurable, `?` opens help) | ✅ |
| Reduced-motion preference respected | ✅ |
| Time zone display per-user preference | ✅ |

---

## 20. Keyboard shortcuts (defaults)

| Shortcut | Action |
|---|---|
| `?` | Open shortcuts help sheet |
| `g r` | Go to Runs feed |
| `g a` | Go to Approvals inbox |
| `g d` | Go to Dashboard |
| `g t` | Go to activity Timeline |
| `g c` | Go to Costs |
| `g i` | Go to Integrations |
| `/` | Focus global search |
| `j` / `k` | Navigate down / up in lists |
| `Enter` | Open selected item |
| `Space` | Quick preview (peek) |
| `e` | Edit current item |
| `p` | Pause / resume current automation |
| `x` | Multi-select toggle |
| `Cmd/Ctrl + .` | Quick command palette |
| `Esc` | Close modal / clear selection |

All shortcuts user-configurable (Phase 1.4-CR).

---

## 21. API surface (read-only for now)

External integrations need a way to query ControlRoom data without scraping the UI.

| Endpoint | Tag |
|---|---|
| `GET /api/controlroom/automations` (list) | ✅ |
| `GET /api/controlroom/automations/:id` | ✅ |
| `GET /api/controlroom/runs?automation=&status=` | ✅ |
| `GET /api/controlroom/runs/:id` | ✅ |
| `POST /api/controlroom/automations/:id/pause` | ✅ |
| `POST /api/controlroom/automations/:id/run` (manual trigger) | ✅ |
| `POST /api/controlroom/runs/:id/cancel` | ✅ |
| `POST /api/controlroom/approvals/:id/decide` | ✅ |
| Webhook to receive ControlRoom events externally | ⚪ |

All require user-scoped JWT (RLS-bound). Rate-limited per user.

---

## 22. Underlying architecture (summary)

- **Routes**: `apps/web/app/app/controlroom/*` (Server + Client Components).
- **State**: SSE-driven for live, server-fetched for static, localStorage for view preferences.
- **Schema reuse**: reads from `automations`, `automation_runs`, `automation_step_runs`, `automation_approvals`, `audit_log`. Writes to: `automations.status`, `automation_runs.status`, `automation_approvals.decision`, `automation_versions` (on edit).
- **New tables (migration 0016)**:
  - `controlroom_views` (per-user saved views)
  - `controlroom_dashboards` (per-user dashboard configs, 1.3-CR)
  - `controlroom_alerts` (per-user alert rules)
  - `controlroom_notifications_log` (delivery log)
  - `controlroom_user_preferences` (theme, density, keyboard shortcuts, notification routing)
- **SSE bridge**: `apps/web/app/api/controlroom/stream/route.ts` (mirrors existing chat SSE pattern).
- **Widget library decision**: Recharts for MVP (Sprint A spike to confirm bundle size acceptable).

---

## 23. Document change log

| Date | Version | Change |
|---|---|---|
| 2026-06-03 | 0.1 | Initial draft. Phase 1.2-CR scope locked. 23 categories enumerated. Customization model finalized. |

---

*End of ControlRoom Functionalities v0.1.*
