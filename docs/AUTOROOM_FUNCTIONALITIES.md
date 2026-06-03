# Autonomux AutoRoom — Functionalities

**Version:** 0.1 (draft)
**Date:** 2026-06-02
**Owner:** kameleyon
**Companion docs:** [AUTOROOM_PRD.md](./AUTOROOM_PRD.md) · [AUTOROOM_ROADMAP.md](./AUTOROOM_ROADMAP.md)
**Status:** Comprehensive feature inventory · MVP scoped to Phase 1.2-AR

This document is the canonical list of every capability AutoRoom must offer. Each functionality is tagged:
- ✅ MVP — ships with Phase 1.2-AR
- 🟡 1.3–1.5 — follow-on phases
- 🔵 1.6+ — later
- ⚪ deferred — Phase 2+ or never

---

## 1. Trigger surface

What can start an automation.

| Trigger | Tag | Details |
|---|---|---|
| Cron schedule | ✅ | Every N min / hour / day / week / month. Day-of-week filter. Day-of-month / nth weekday-of-month. Custom cron string. |
| Time zone | ✅ | Per-job override, defaults to user's tenant TZ |
| Start / end date | ✅ | Bounded runs |
| Quiet hours skip | ✅ | Optional skip during user's sleep window |
| Pause / resume | ✅ | Toggle without losing config |
| Holiday awareness | 🟡 | Skip US federal + user-defined personal holidays |
| Calendar-aware ("not during meetings") | 🟡 | Check Scheduler before firing |
| Event-based — new Gmail matching filter | 🟡 | Composio Gmail push or polling fallback |
| Event-based — calendar event in N minutes | 🟡 | Scheduler polling |
| Event-based — webhook POST hits this URL | ✅ | Per-job signing secret; HMAC verified |
| Threshold-based — "unread inbox > N" | 🟡 | Implemented as scheduled job with conditional first step |
| Threshold-based — "budget remaining < $X" | 🟡 | Treasurer-gated |
| Compound triggers (A AND B) | 🟡 | "Monday morning AND inbox > 20" |
| On-demand / manual run button | ✅ | From chat, dashboard, or external SMS reply |
| Voice trigger ("Hey AlterEgo, run my morning triage") | 🔵 | Phase 1.6 voice surface |
| Geo-fence ("when I arrive at office") | 🔵 | Capacitor + iOS location |
| Cooldown / debounce | ✅ | Don't fire more than once per N minutes (prevents loop storms) |

---

## 2. Skill catalog

Skills are the atomic units automations chain together. Each skill has a typed JSON Schema for input + output and an action-class tag.

### 2.1 Mailroom skills

| Skill | Tag | Action class | Input / Output (summary) |
|---|---|---|---|
| `mailroom.triage_inbox` | ✅ | read | `{ since_iso, max_messages, filters? }` → `{ ranked: [...], phi_incidents }` |
| `mailroom.summarize_thread` | ✅ | read | `{ thread_id }` → `{ summary: string }` |
| `mailroom.search` | 🟡 | read | natural-lang query → Gmail q-operator + result list |
| `mailroom.draft_reply` | ✅ | write_reversible | `{ thread_id, intent, tone? }` → `{ draft_id, body }` |
| `mailroom.send_reply` | 🟡 | write_irreversible / external_comms | `{ thread_id, draft_id }` → `{ message_id }` |
| `mailroom.archive` | ✅ | write_reversible | `{ message_id }` → `{ ok }` |
| `mailroom.snooze` | ✅ | write_reversible | `{ message_id, until }` → `{ ok }` |
| `mailroom.label` | ✅ | write_reversible | `{ message_id, label }` → `{ ok }` |
| `mailroom.unsubscribe` | 🟡 | write_irreversible / external_comms | `{ sender }` → `{ method, ok }` |
| `mailroom.extract_attachments` | 🟡 | read | `{ message_id, save_to }` → `{ saved_paths[] }` |
| `mailroom.forward` | 🟡 | write_irreversible / external_comms | `{ message_id, to, note }` → `{ message_id }` |
| `mailroom.list_rules` / `create_rule` / `update_rule` / `delete_rule` | ✅ | write_reversible | manage mailroom_rules table |

### 2.2 Scheduler skills

| Skill | Tag | Action class | Input / Output (summary) |
|---|---|---|---|
| `scheduler.read_today` | ✅ | read | `{}` → `{ events: [...], conflict_count }` |
| `scheduler.read_range` | ✅ | read | `{ start_iso, end_iso }` → `{ events: [...], conflict_count }` |
| `scheduler.find_open_slot` | 🟡 | read | `{ duration, between, attendees, prefer_morning? }` → `{ slots: [...] }` |
| `scheduler.propose_meeting` | 🟡 | write_irreversible / external_comms | `{ attendees, duration, agenda, options[] }` → `{ proposal_id }` |
| `scheduler.decline_meeting` | 🟡 | write_irreversible / external_comms | `{ event_id, reason, alternative? }` → `{ ok }` |
| `scheduler.reschedule` | 🟡 | write_irreversible | `{ event_id, new_time }` → `{ ok }` |
| `scheduler.create_event` | 🟡 | write_irreversible | `{ ... }` → `{ event_id }` (confirmation required) |
| `scheduler.delete_event` | 🟡 | destructive | `{ event_id }` → `{ ok }` (confirmation required) |
| `scheduler.block_focus_time` | 🟡 | write_reversible | `{ duration, label, recurring? }` → `{ event_id }` |
| `scheduler.suggest_breaks` | 🟡 | read | analyze day, suggest 15-min breaks if back-to-back > 3h |

### 2.3 Scribe skills (Phase 1.3)

| Skill | Tag |
|---|---|
| `scribe.draft_post` | 🟡 |
| `scribe.edit_draft` | 🟡 |
| `scribe.generate_outline` | 🟡 |
| `scribe.expand_section` | 🟡 |
| `scribe.summarize_sources` | 🔵 (needs web fetch) |
| `scribe.transcribe_voice` | 🔵 |
| `scribe.publish_to_substack` | 🟡 (confirmation gate) |
| `scribe.crosspost` | 🟡 (X + LinkedIn chunkers) |
| `scribe.schedule_publish` | 🟡 |
| `scribe.generate_thumbnail` | 🔵 |
| `scribe.generate_seo_metadata` | 🔵 |
| `scribe.match_voice_score` | 🔵 |

### 2.4 Oracle skills (Phase 1.4)

| Skill | Tag |
|---|---|
| `oracle.daily_cardology_reading` | 🟡 (engine exists from v0.1) |
| `oracle.daily_astrology` | 🟡 (astronomia ephemeris engine) |
| `oracle.weekly_forecast` | 🟡 |
| `oracle.tarot_pull` | 🟡 |
| `oracle.natal_chart_report` | 🟡 |
| `oracle.transit_alert` | 🟡 |
| `oracle.moon_phase` | 🟡 |
| `oracle.numerology` | 🟡 |

### 2.5 Treasurer skills (Phase 1.5)

| Skill | Tag |
|---|---|
| `treasurer.categorize_transactions` | 🟡 |
| `treasurer.detect_bills` | 🟡 |
| `treasurer.bill_reminder` | 🟡 |
| `treasurer.spending_summary` | 🟡 |
| `treasurer.budget_check` | 🟡 |
| `treasurer.detect_anomaly` | 🟡 |
| `treasurer.forecast_cash_flow` | 🟡 |
| `treasurer.pay_bill` | ⚪ (Phase 2, hard confirmation + 2FA + amount limits) |

### 2.6 Voice skills (Phase 1.6)

| Skill | Tag |
|---|---|
| `voice.text_to_speech` | 🔵 |
| `voice.transcribe` | 🔵 |
| `voice.voicemail_response` | 🔵 |
| `voice.audio_briefing` | 🔵 |

### 2.7 Companion skills

| Skill | Tag |
|---|---|
| `companion.send_dm` (in-app notification) | ✅ |
| `companion.daily_check_in` | 🟡 |
| `companion.gratitude_prompt` | 🟡 |
| `companion.breath_timer` | 🟡 |
| `companion.reading_reminder` | 🟡 |
| `companion.stretch_reminder` | 🟡 |
| `companion.mood_log_prompt` | 🟡 |
| `companion.weekly_reflection` | 🟡 |

### 2.8 Cross-cutting / system skills

| Skill | Tag | Notes |
|---|---|---|
| `system.delay` | ✅ | Pause N seconds/minutes |
| `system.branch_on` | ✅ | If/else with safe expression evaluator |
| `system.loop_over` | ✅ | Foreach with concurrency cap |
| `system.parallel` | 🟡 | Fan out and wait |
| `system.try_catch` | ✅ | Error fallback |
| `system.send_notification` | ✅ | Channel-routed (in-app / email / SMS / push) |
| `system.request_approval` | ✅ | Pause until user clicks; timeout-then-fallback |
| `system.store_memory` | 🟡 | Write to `agent_facts` (curated keys only) |
| `system.query_memory` | 🟡 | pgvector recall |
| `system.run_sub_agent` | ✅ | Chain to another sub-agent |
| `system.web_search` | 🔵 | Perplexity / Brave (Phase 1.6) |
| `system.web_fetch` | 🔵 | URL → summarized content |
| `system.log` | ✅ | Write to `activity_log` for user-visible history |
| `system.run_automation` | 🟡 | Sub-flow: one job calls another |

---

## 3. Step composition

How skills chain into a pipeline.

| Capability | Tag |
|---|---|
| Linear pipeline (step 1 → step 2 → step 3) | ✅ |
| Named steps (step IDs for reference) | ✅ |
| Variable resolution `{{ stepId.output.path }}` (Jinja subset) | ✅ |
| Whitelisted helpers (`now()`, `duration()`, `default()`, `lower`, `upper`, `length`, `slice`) | ✅ |
| Conditional `when:` expressions | ✅ |
| `foreach` loops with `parallel:` concurrency cap (default 3, max 10) | ✅ |
| Per-step `onError: fail|continue|fallback` | ✅ |
| Per-step `retries:` + `backoff:` exponential | ✅ |
| Approval gates (`system.request_approval`) | ✅ |
| Try/catch around step groups | 🟡 |
| Sub-flows (calling another automation) | 🟡 |
| A/B variants (50/50 split, compare outcomes) | 🔵 |

---

## 4. Schedule + recurrence

| Pattern | Tag |
|---|---|
| Every N minutes / hours / days / weeks / months | ✅ |
| Specific time of day (HH:MM) | ✅ |
| Day-of-week filter | ✅ |
| Day-of-month / nth weekday-of-month | ✅ |
| Custom cron expression | ✅ |
| One-time run at specific datetime | ✅ |
| Time zone (user default + per-job override) | ✅ |
| Start date / end date | ✅ |
| Pause / resume (no config loss) | ✅ |
| Backoff after consecutive failures (exponential, default max 4 attempts over 30 min) | ✅ |
| Quiet hours (don't run during sleep window) | ✅ |
| Calendar-aware ("not during meetings") | 🟡 |
| Holiday-aware skipping | 🟡 |

---

## 5. Communication + feedback

### 5.1 Output channels (AutoRoom → user)

| Channel | Tag | Use for |
|---|---|---|
| In-app notification (badge + banner) | ✅ | Default for all |
| Chat thread injection ("Mailroom ran, 3 items for review") | ✅ | Highest leverage — keeps everything in one surface |
| Email digest | ✅ | Daily summary / non-urgent |
| SMS via Twilio | 🟡 | Urgent only |
| Push notification (PWA + Capacitor) | 🟡 | Mobile users |
| Slack webhook | 🔵 | Users who live in Slack |
| Discord webhook | 🔵 | Same |
| Voice call (Twilio) | 🔵 | Emergencies, deeply opt-in |

### 5.2 Input channels (user → AutoRoom)

| Method | Tag |
|---|---|
| Inline approve / dismiss / edit buttons | ✅ |
| Reply in chat thread to give context | ✅ |
| Form fields for structured input | ✅ |
| Voice memo → Whisper transcribe | 🔵 |
| SMS reply | 🟡 |

### 5.3 Routing rules

| Rule | Tag |
|---|---|
| Per-job channel preference | ✅ |
| Per-urgency routing (critical → SMS; informational → in-app) | ✅ |
| Quiet hours override (no SMS 10pm–7am except critical) | ✅ |
| Channel rate limit (max N SMS/day/user) | ✅ |

---

## 6. Approval / trust tiers

(See PRD §5 for the five-tier model and §6 for action classes.)

| Capability | Tag |
|---|---|
| Set tier per automation | ✅ |
| Action-class hard limits override tier | ✅ |
| Per-action money limits (default $50/action) | ✅ |
| Trusted-contact list (auto-approve for known senders/recipients) | ✅ |
| Trust ramp (Observe 7d → prompt to promote to Propose) | ✅ |
| Per-step tier override (one approval-gated step in an auto-tier job) | ✅ |
| 2FA re-auth for high-risk approvals (money, destructive) | ✅ |
| Approval timeout + fallback action | ✅ |
| Approval audit trail (who clicked when, with what device) | ✅ |

---

## 7. Access control + scope guards

| Guard | Tag |
|---|---|
| Which integrations this job can use (Gmail yes, Calendar no) | ✅ |
| Which mailboxes / calendars / accounts (work email only) | ✅ |
| Which Gmail labels / folders | ✅ |
| Sender allowlist / blocklist | ✅ |
| Per-run cost ceiling | ✅ |
| Per-day cost ceiling | ✅ |
| Per-day action ceiling (max 20 emails sent / day) | ✅ |
| Per-recipient throttle (no more than 3 emails to same person / day) | ✅ |
| Time-of-day execution window | ✅ |
| PII redaction policy (strip names, redact account #s) | ✅ |
| HIPAA refusal at every skill boundary | ✅ |
| Geo-fence | 🔵 |

---

## 8. Templates

### 8.1 Day-one template gallery (MVP — 12 templates)

| # | Template | ICP | Phase req |
|---|---|---|---|
| 1 | Morning Briefing | All | ✅ MVP |
| 2 | End-of-day Shutdown | Founder, Polymath | ✅ MVP |
| 3 | Inbox Declutter (auto-archive newsletters) | All | ✅ MVP |
| 4 | Calendar Guard (decline agenda-less meetings) | Founder | ✅ MVP |
| 5 | VIP Sender Watcher | Founder, Creator | ✅ MVP |
| 6 | Focus Block Auto-set | Founder, Polymath | ✅ MVP |
| 7 | Weekend Mode (pause non-critical) | All | ✅ MVP |
| 8 | Substack Weekly Draft | Creator | 🟡 1.3 |
| 9 | Daily Cardology + Astro Reading | Polymath, Wellness | 🟡 1.4 |
| 10 | Bill Watcher (3d / 1d / day-of) | All | 🟡 1.5 |
| 11 | Wellness Triple (gratitude + breath + reflection) | Wellness | 🟡 1.2 (Companion) |
| 12 | Travel Mode (flight-aware focus + brief) | Founder, Creator | 🔵 1.6 |

### 8.2 Template surface features

| Feature | Tag |
|---|---|
| Template gallery with ICP filter | ✅ |
| Search templates by name / sub-agent / category | ✅ |
| "Use template" creates a draft automation (user customizes before activating) | ✅ |
| 60-second wizards for top 3 templates | ✅ |
| Curated category tags (productivity / wellness / finance / content) | ✅ |
| ICP-ranked recommendations on AutoRoom landing | ✅ |
| Community marketplace | ⚪ |
| Import from Zapier / Make blueprint | ⚪ |

---

## 9. Testing / dry-run

| Capability | Tag |
|---|---|
| Dry-run mode (real read-only data, no side effects) | ✅ |
| Step-through debugger (pause at each step, inspect variables) | 🟡 |
| Mock inputs (synthetic email / event for testing) | 🟡 |
| Schema validation at save time | ✅ |
| Output-to-input type compatibility check | ✅ |
| Cycle detection in step graph | ✅ |
| Cost estimate before first run (5 dry-runs averaged) | ✅ |
| "What if" scenarios (synthetic inputs) | 🔵 |
| Save without enabling (draft mode) | ✅ |

---

## 10. Monitoring + observability

| Surface | Tag |
|---|---|
| Run history (timestamp, duration, cost, outcome) per automation | ✅ |
| Per-step breakdown (latency, cost, attempts) | ✅ |
| Cost dashboard (per job / per day / per month) | ✅ |
| Error log with stack traces | ✅ |
| Alert on N consecutive failures (default 3) | ✅ |
| Success-rate metric per job | ✅ |
| User-agreement rate ("you accepted 8/12 proposed actions this week") | ✅ |
| OTel root span per run + child span per step | ✅ |
| Sentry tagging (automation_id, run_id, tenant_id) | ✅ |
| Per-skill p95 latency dashboard (admin cpanel) | 🟡 |
| Cost forecasting (next 30 days) | 🟡 |
| Deadletter queue + replay UI | 🟡 |

---

## 11. Versioning + rollback

| Capability | Tag |
|---|---|
| Edit history per automation (every change tracked) | ✅ |
| Rollback to previous version | ✅ |
| Draft mode (edit without affecting live job) | ✅ |
| Publish flow (review before going live) | ✅ |
| Skill version pinning per step | ✅ |
| Non-blocking notification on skill version bump | ✅ |
| A/B testing two variants | 🔵 |

---

## 12. Memory + context

| Capability | Tag |
|---|---|
| Per-job memory file (own knowledge blob, encrypted, ≤2k chars) | ✅ |
| Cross-job memory via `agent_facts` (existing) | ✅ |
| Run-to-run state (small JSON state object persisted across executions) | ✅ |
| Conversation history per AutoRoom (its own chat thread for Q&A) | 🟡 |
| Long-term learning (adapts based on user corrections) | 🔵 |

---

## 13. Safety + compliance

(See PRD §8 for the full posture.)

| Rule | Tag |
|---|---|
| HIPAA refusal at every skill boundary | ✅ |
| PHI redaction before LLM steps (any tier) | ✅ |
| Audit chain (Merkle-hashed) on every create/edit/run/approval | ✅ |
| Per-job kill switch | ✅ |
| Per-tenant emergency freeze | ✅ |
| Per-integration auto-pause on disconnect | ✅ |
| Anomaly auto-pause (N failures → pause + notify) | ✅ |
| Webhook signing secret per job | ✅ |
| 2FA re-auth for high-risk approvals | ✅ |
| Spam detection (templated content refusal) | 🟡 |
| Per-recipient anti-spam throttle | ✅ |

---

## 14. Integrations inventory

Available integrations AutoRoom can reach into:

| Integration | Available |
|---|---|
| Gmail (read + write) | ✅ MVP (write requires Phase 1.2) |
| Google Calendar (read + write) | ✅ MVP (write requires Phase 1.2) |
| Resend (outbound email) | ✅ MVP |
| Twilio (SMS) | 🟡 1.2 |
| Custom HTTP webhook (inbound + outbound) | ✅ MVP |
| Substack (email-to-publish) | 🟡 1.3 |
| X / Twitter API | 🟡 1.3 |
| LinkedIn API | 🟡 1.3 |
| Notion | 🔵 1.7 |
| Linear | 🔵 1.7 |
| GitHub | 🔵 1.7 |
| Plaid (banking) | 🟡 1.5 |
| Slack webhook | 🔵 1.6 |
| Discord webhook | 🔵 1.6 |
| Telegram bot | ⚪ |
| Whisper (audio) | 🔵 1.6 |
| ElevenLabs / voice clone TTS | 🔵 1.6 |
| Web search (Perplexity / Brave) | 🔵 1.6 |
| Web fetch (generic URL) | 🔵 1.6 |
| Outlook (Microsoft Graph) | ⚪ Q1 post-launch |
| WhatsApp Business | ⚪ Year 2 |
| Apple Health / Strava / Spotify | ⚪ Year 2 |

---

## 15. AI model selection (cost discipline)

| Capability | Tag |
|---|---|
| Per-step model picker (Haiku / Sonnet / Opus) | ✅ |
| Default routing rules (triage→Haiku, synthesize→Sonnet, complex→Opus) | ✅ |
| Auto-route ("cheapest model that meets quality bar") | 🟡 |
| Pinned model per skill | ✅ |
| Budget trigger downgrade (Sonnet → Haiku at < $X budget remaining) | ✅ |
| Cost ceiling abort (pause + approval before exceeding) | ✅ |
| Per-step cost estimate before invocation | ✅ |
| Quality feedback loop (track user satisfaction per model+skill combo) | 🔵 |

---

## 16. Mobile + voice

| Capability | Tag |
|---|---|
| Builder works on phone (responsive UI) | ✅ |
| Conversational setup via chat ("make a morning briefing at 7am") | 🟡 |
| Voice setup via Phase 1.6 voice surface | 🔵 |
| Mobile push notifications | 🟡 |
| Inline approval from mobile push | 🟡 |
| One-tap "run now" from mobile | ✅ |

---

## 17. Onboarding + discovery

| Capability | Tag |
|---|---|
| Template gallery as AutoRoom landing (not empty state) | ✅ |
| Searchable + filterable skill catalog | ✅ |
| 60-second wizards for popular jobs | ✅ |
| Tutorial mode (walk first-time user through one job) | ✅ |
| ICP-based recommendations | ✅ |
| Trust ramp (new jobs default to Observe for 7 days) | ✅ |
| Sample data dry-run for new templates | ✅ |
| Cost preview before activation | ✅ |

---

## 18. Sharing / collaboration (Phase 1.7+)

| Capability | Tag |
|---|---|
| Personal jobs (default) | ✅ |
| Tenant-shared jobs (team can view) | ⚪ 1.7 |
| Tenant-shared jobs (team can edit) | ⚪ 1.7 |
| Role-based access (owner / editor / viewer / runner) | ⚪ 1.7 |
| Approval workflows (changes require teammate review) | ⚪ 2.0 |
| Comments / discussion on a job | ⚪ 2.0 |
| Marketplace (community templates with ratings) | ⚪ 2.0+ |

---

## 19. Underlying surfaces (architecture summary)

This is reference material — full design lives in [AUTOROOM_PRD.md](./AUTOROOM_PRD.md) §11.

- **Package**: `packages/autoroom/` (new) — depends on `@autonomux/llm`, `@autonomux/db`, `@autonomux/logger`. Re-exports `SubAgentRegistry` from `@autonomux/orchestrator`.
- **Worker**: `apps/worker/src/workers/automation.ts` (new) — BullMQ `automation` queue. Self-rescheduling pattern for cron triggers.
- **Web routes**: `apps/web/app/app/autoroom/*` (new) — gallery + editor + run history.
- **API routes**: `apps/web/app/api/autoroom/*` (new) — webhook receiver, run-now POST, approval decision POST.
- **DB**: migration `0015_autoroom.sql` — 8 tables (`automations`, `automation_steps`, `automation_runs`, `automation_step_runs`, `automation_versions`, `automation_templates`, `automation_approvals`, `automation_secrets`).
- **Format**: YAML for automation definitions (GitHub Actions-style), validated against Zod schemas on load.

---

## 20. Document change log

| Date | Version | Change |
|---|---|---|
| 2026-06-02 | 0.1 | Initial draft. Phase 1.2-AR scope locked. 12 starter templates cataloged. Skill inventory across all sub-agents enumerated. |

---

*End of AutoRoom Functionalities v0.1.*
