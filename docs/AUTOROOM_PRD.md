# Autonomux AutoRoom — Product Requirements

**Version:** 0.1 (draft)
**Date:** 2026-06-02
**Owner:** kameleyon
**Companion docs:** [PRD.md](./PRD.md) · [ROADMAP.md](./ROADMAP.md) · [AUTOROOM_FUNCTIONALITIES.md](./AUTOROOM_FUNCTIONALITIES.md) · [AUTOROOM_ROADMAP.md](./AUTOROOM_ROADMAP.md)
**Status:** Draft for Phase 1.2 sprint planning · supersedes inline AutoRoom notes in PRD.md §7

---

## 1. Mission

AutoRoom turns AlterEgo from a chat companion into a standing operator. Where chat handles ad-hoc questions, AutoRoom holds standing instructions — recurring or triggered automations that compose sub-agent skills into multi-step jobs.

Product thesis: most of an executive assistant's value comes from things they do *every morning*, *every Sunday*, *every time an invoice arrives*. AutoRoom is the surface where the user defines those routines once and AlterEgo runs them forever.

---

## 2. The problem

Today autonomux has:
- A chat surface where the user asks AlterEgo to do things (Mailroom triage, Calendar read).
- No way to say "do this every weekday at 7am" without retyping the request.
- No way to let AlterEgo act on the user's behalf in the background.
- No standing rules ("always draft replies to my mom in a warm tone").
- No way to compose sub-agents into multi-step pipelines (triage inbox → summarize → notify).

Without AutoRoom, the user has to be present for every productive action. With AutoRoom, AlterEgo earns trust by acting reliably between user sessions.

---

## 3. ICP fit

AutoRoom serves the same four ICPs from the main PRD §3:

| ICP | Dominant automation pattern |
|---|---|
| **Polymath** | Daily oracle reading, cardology weekly digest, inbox triage, content curation |
| **Founder** | Morning briefing, calendar guard, bill watcher, VIP-sender alerts, EOD shutdown |
| **Creator** | Substack weekly draft, cross-post automation, content scheduling, audience digests |
| **Wellness practitioner** | Morning gratitude, 3pm breath timer, evening reflection, weekly mood synthesis |

The platform is the same across ICPs; the surfaced templates differ. ICP detection happens during onboarding (intake quiz from PRD §6); templates are filtered + ranked per ICP.

---

## 4. Core concepts

| Concept | Definition |
|---|---|
| **Automation (Job)** | A named, persisted configuration owned by a tenant. Has a trigger, an ordered list of steps, a scope guard, an approval tier, and a communication policy. |
| **Trigger** | What starts the run. Four kinds: schedule (cron), event (webhook/new-email/threshold), manual (chat or button). |
| **Skill** | One capability the user can invoke. Each sub-agent exposes many skills (mailroom.triage_inbox, mailroom.send_reply, etc.). Skills have typed JSON I/O schemas. |
| **Step** | One skill invocation inside a run. Carries the input template (variables resolved at runtime), model tier, retry policy, error policy, optional condition, optional approval gate. |
| **Run** | One execution of an automation. State machine: pending → running → completed / failed / cancelled / awaiting_approval. |
| **Variable resolution** | Step N's input can reference step N-1's output via `{{ prev.output.path }}` Jinja-subset syntax. Resolved deterministically by the executor, never by an LLM. |
| **Approval gate** | A step that pauses the run until the user decides via in-app, email, or SMS. Times out per the step's `approval_timeout_ms` (default 24h). |
| **Trust tier** | One of five posture levels (Observe → Full autonomy) that governs what the agent can do without confirmation. Set per-automation. |
| **Action class** | A tag on each skill (read / write_reversible / write_irreversible / money / external_comms / destructive / personal_data) that gates which trust tiers are even allowed. |

---

## 5. Trust tiers (the five-tier model)

Every automation runs at one of five trust tiers. The tier controls the default confirmation behavior. **Action-class hard limits override the tier** — a `money` skill ALWAYS requires confirmation when the amount exceeds the per-user limit, even in Full autonomy.

| Tier | Behavior | Best for |
|---|---|---|
| **Observe** | Agent runs, surfaces what it WOULD do, takes no action | Trust-building / new automations |
| **Propose** | Agent drafts the action, never executes; user must click "Send" | Email drafts, calendar replies, content drafts |
| **Confirm-each** | Agent prepares, asks confirmation per individual action | Bulk operations (archive 12 emails) |
| **Auto-with-log** | Agent executes, writes a "what happened" log, user can undo within 24h | Auto-archive marketing, label-and-file |
| **Full autonomy** | Agent executes without notification | Trusted-action rules only (e.g., "always archive sender X") |

**Trust ramp (training wheels):** All new automations default to **Observe** for the first 7 days. After 5 successful Observe runs, the user is prompted to promote to Propose. After 30 days, low-stakes jobs can be promoted to Auto-with-log. The user can always override the default.

---

## 6. Action-class taxonomy

Skills are tagged with one or more action classes. Classes constrain which trust tiers are allowed:

| Class | Definition | Max allowed tier | Hard limits |
|---|---|---|---|
| `read` | No side effects | Full autonomy | None |
| `write_reversible` | Can be undone (label, archive, draft_save) | Full autonomy | Per-day rate limit |
| `write_irreversible` | Cannot be undone (send_email, post_substack) | Full autonomy | Always requires confirmation if recipient not in trusted list |
| `money` | Touches financial systems | Auto-with-log | Always confirm if amount > user's per-action limit (default $50) |
| `external_comms` | Touches third parties (send, post, message) | Full autonomy | Per-recipient throttle (max 3/hour same person) |
| `destructive` | Explicit data loss (delete, cancel) | Confirm-each | 2-step confirmation OR 5s undo window mandatory |
| `personal_data` | Touches PII (export, share with 3rd party) | Propose | Requires user-level 2FA re-auth |

---

## 7. Cost discipline

AutoRoom respects platform-wide cost rules from PRD §11:

- **Per-step model tier**: each step declares Haiku / Sonnet / Opus. Defaults: Haiku for ranking/triage/classification; Sonnet for synthesis/drafting/reasoning; Opus only when explicitly opted in.
- **Per-run budget ceiling**: configured per-automation, default $0.50. The executor checks remaining budget before each LLM step and downgrades (Sonnet → Haiku) if the step would breach. If Haiku also breaches, the step is paused for approval.
- **Per-day tenant budget**: hard ceiling enforced via Redis token bucket. When hit, ALL automations pause until the next 00:00 UTC roll or until the user lifts the cap manually.
- **Cost tracking**: rolled up to `automation_runs.total_cost_usd_cents` per run and `automation_step_runs.cost_usd_cents` per step. Surfaced in the run history dashboard + admin cpanel.
- **Cost forecasting**: when the user enables a new automation, the system runs 5 dry-runs against historical data to estimate `expected_cost_per_run_usd_cents`. Shown in the UI before activation.

---

## 8. Compliance + safety

AutoRoom inherits the platform rules from PRD §10:

- **HIPAA refusal at every skill boundary** — not just the chat boundary. The `phi-redactor` runs before any LLM step regardless of trust tier. Any detected PHI pattern strips the offending field and writes an `activity_log` row with `action_kind='phi.redacted'`.
- **Audit chain**: every automation create / edit / delete / run-start / run-complete / approval-decision writes a Merkle-chained row to `audit_log`. Replay-verifiable per the audit_chain.md spec.
- **Kill switches**:
  - Per-job pause: toggle on `automations.status`. In-flight run finishes its current step then exits.
  - Per-tenant emergency freeze: `tenant_settings.autoroom_frozen_at` set; all workers refuse new runs within 5s.
  - Per-integration auto-pause: disconnecting Gmail auto-pauses every automation that uses Mailroom skills.
  - Anomaly auto-pause: N consecutive failures (default N=3) auto-pauses the job and notifies the user.
- **Approval gate hijacking defense**: high-risk approvals (money, destructive) require re-entering 2FA TOTP code, not just session validity.
- **Webhook trigger forgery defense**: every webhook trigger has a per-job signing secret stored in `automation_secrets`. Webhook payloads must include HMAC signature; mismatched signatures are rejected and logged.

---

## 9. Success metrics

### Phase 1.2 launch (founder dogfood)
- Founder uses Morning Briefing automation 5+ consecutive weekdays without manual intervention.
- Median per-run cost ≤ $0.10.
- Median run duration ≤ 30 seconds (excluding approval gate wait time).
- Approval acceptance rate ≥ 70% (user accepts what the agent proposed).
- Zero unintended writes (no "agent went rogue" incidents that required undo).

### Phase 1.7 launch (external paying users)
- 50% of paying users have at least one active automation within 7 days of signup.
- Average user has 3+ active automations within 30 days.
- Day-30 automation retention ≥ 70% (jobs created stay enabled).
- Per-tenant LLM cost trends below $5/user/month at scale.
- Cost-attributable churn < 5% (users canceling because automations cost too much).

### Operational (always)
- p95 worker queue depth < 50 jobs.
- p95 run duration < 60s (excluding LLM time).
- Webhook trigger latency < 2s p95.
- Audit log integrity verification passes every 24h.

---

## 10. Non-goals

- **No-code workflow builder for arbitrary 3rd-party services** (Zapier territory). AutoRoom is opinionated about autonomux sub-agents; external services come via specific Composio integrations the team has vetted.
- **Real-time / sub-second triggers**. Triggers are minutes-granularity. Use chat for instant.
- **Cross-tenant automation sharing in Phase 1.x**. Per-user only until Phase 2+ when team tier ships.
- **AutoRoom-as-API for third-party apps to invoke**. Not before Phase 2.
- **Browser-based dry-run in user's browser**. Dry-runs run on the worker against real (read-only) integrations, not in a sandbox.

---

## 11. Dependencies

| Phase 1.2 ships requires | Status |
|---|---|
| Mailroom write skills (draft_reply, archive, snooze, label) | NEEDS BUILD (Phase 1.2 Mailroom write sprint) |
| Scheduler write skills (decline, find_open_slot, block_focus) | NEEDS BUILD (Phase 1.2) |
| Companion `send_dm` / `send_notification` skill | NEEDS BUILD |
| BullMQ + Redis (Upstash) | EXISTS |
| Encrypted secret storage (Cipher) | EXISTS |
| Audit chain | EXISTS |
| Tenant isolation (RLS) | EXISTS |
| Migration 0015 (automations + automation_steps + automation_runs + ...) | NEEDS BUILD |
| `packages/autoroom` package | NEEDS BUILD |
| `apps/worker/src/workers/automation.ts` worker | NEEDS BUILD |
| `apps/web/app/app/autoroom/*` UI | NEEDS BUILD |

---

## 12. Open questions (resolve before Phase 1.2-AR build)

1. **Skill versioning policy**: do automations pin a specific skill version (`mailroom.triage_inbox v1`) or always follow latest? Recommendation: pin at create time; show non-blocking nudge on version bump.
2. **Default trust tier for new automations**: Observe (safer, more friction) vs Propose (more value, more risk). Recommendation: Observe with a 5-run prompt to promote.
3. **Sub-flows**: should one automation be able to call another? Defer to Phase 1.3+.
4. **A/B testing two automation variants**: defer to Phase 1.7+.
5. **Per-tenant concurrency limit default**: 2 parallel runs is the proposal; verify under Phase 1.7 load test.
6. **Conversational setup vs visual builder priority**: build visual first or chat first? Recommendation: visual builder is the primary surface; conversational setup is a chat-side shortcut that produces the same persisted config.

---

## 13. Out-of-scope risk register

| Risk | Mitigation |
|---|---|
| User builds an infinite-loop automation (job triggers itself) | Cycle detection in step graph validator at save time; per-run step cap = 50 |
| Anthropic API outage during a critical scheduled run | Graceful retry with exponential backoff up to 4 attempts over 30 minutes; notification on persistent failure |
| Gmail OAuth revoked mid-run | Single retry after refresh; on persistent failure, pause all Mailroom-using automations + email user to reconnect |
| User exhausts monthly budget on one runaway job | Per-day tenant ceiling stops new runs; in-flight run completes; user notification with one-click resume after they raise the cap |
| Schema migration breaks active automations | Migrations are additive only; never drop columns automations depend on without 30-day deprecation |
| Vector-memory poisoning (malicious automation writes facts that bias future automations) | Per-job memory is sandboxed; cross-job memory writes go through a curated `agent_facts` allowlist of write-paths |

---

## 14. Document change log

| Date | Version | Change |
|---|---|---|
| 2026-06-02 | 0.1 | Initial draft. Phase 1.2 scope locked. Trust tiers + action classes finalized. Cost discipline rules adopted from PRD §11. |

---

*End of AutoRoom PRD v0.1.*

*Next decisions:* resolve §12 open questions before Phase 1.2-AR sprint kickoff. Run this doc through [Compass · Penny · Comply] gate before locking the build plan.
