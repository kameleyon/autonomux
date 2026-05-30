# Trace — Sprint C flow + logic + security

Date: 2026-05-29
Scope: Admin queries scoped via service-role only (never browser-exposed); TOTP step-up REQUIRED for deletion (no bypass paths); 30-day delayed job is cancellable via bullmq_job_id; audit-log survives deletion; decrypted data only in worker (never browser); feature flag eval precedence matches docs; admin Server Actions audit-logged.

## Findings

- **F-Trace-01 · Critical · apps/admin/app/(authed)/compliance/actions.ts:53-76 — Compliance Server Actions create a NEW BullMQ Queue + Redis connection on first call and cache it in module scope.** The user-side `enqueueGdprDeletionSoft` (apps/web/lib/gdpr-queue) presumably uses a shared connection. Two issues:
  1. Two Redis connections per Node process = duplicated heartbeats.
  2. `defaultJobOptions.attempts: 5` on the admin queue conflicts with the worker-side `attempts: 3` on the hard-delete job spec (apps/worker/src/queues/gdpr.ts:594) — the admin-initiated soft-delete will retry 5 times, but the worker config says 3 for the hard.
  Not a security hole, but operationally divergent. The two enqueue paths should share a single helper.
  - *Fix:* Reuse `apps/web/lib/gdpr-queue` (or extract a shared helper to `@autonomux/queue`) so admin + user enqueue paths use the same Queue instance and the same defaultJobOptions.

- **F-Trace-02 · Critical · apps/admin/app/(authed)/compliance/actions.ts:79-92 — `AUTONOMUX_ADMIN_OP_TOKEN` env-token gate is a placeholder for admin TOTP step-up.** The check is `if (suppliedToken !== expected) throw …`. No rate-limit, no constant-time comparison. An attacker with code-execution can brute-force this token at any rate Redis allows.
  - *Fix:* (a) Use `crypto.timingSafeEqual` for the comparison; (b) Add rate-limit (Redis sliding-window 5 attempts/15min per source IP) per existing `checkRateLimit` pattern; (c) Document explicitly in actions.ts that this MUST be swapped before public launch.
  - *Severity:* Critical because the trust page promises "mandatory TOTP" which this does not yet enforce.

- **F-Trace-03 · Critical · apps/web/app/app/settings/data/actions.ts:271-285 — `requestDeletionAction` blocks duplicate deletions in `["pending", "processing", "completed"]` states BUT not in "cancelled" or "failed" states.** A user who fails a deletion (e.g. queue enqueue failed) can immediately submit again — which is intended. BUT a user who CANCELLED a deletion can re-submit, which is also intended. Edge case: a user whose deletion is `completed` (i.e. soft-deleted, in the 30-day grace) cannot re-submit (correct), but ALSO cannot cancel from this page — the cancel flow is at `/api/gdpr/cancel-deletion`. There's no UI link to that endpoint on the settings/data page!
  - *Fix:* On the past-requests table (RequestHistoryTable), if `kind === 'deletion'` and `status === 'completed'` and `expires_at > now`, render a "Cancel deletion" button that POSTs to `/api/gdpr/cancel-deletion`. Without this UI affordance the cancel-link exists only in the email — fragile.

- **F-Trace-04 · Major · apps/worker/src/queues/gdpr.ts:726-734 — `auth.users` delete failure is silently logged but the gdpr_request row gets `failure_reason` set AND `completed_at` set.** The flow swallows the auth-delete error and still marks the request "complete". This leaves a survivor where tenant data is gone but the user can still sign in (auth.users still exists). Two possible states:
  - `tenants` row gone, `auth.users` still present → user can log in to a fresh empty tenant on next visit.
  - Audit-log says "deleted" but reality is partial.
  - *Fix:* Either retry the auth-delete (it's network-fragile), OR set status to `failed` (not `completed`) when authErr is non-null AND emit an admin alert. Current code path is honest in metadata but the status field lies.

- **F-Trace-05 · Major · apps/admin/lib/queries.ts:96-107 — `listTenantsPaged` fetches last-activity from `agent_runs` with `limit(pageSize * 4)`.** If many tenants on the page have NO recent agent runs, the limit-4-per-page heuristic silently truncates real last-activity_at values for other tenants. A tenant with last activity 6 months ago might show as "—" because a chattier neighbour exhausted the 100-row limit.
  - *Fix:* Either run a separate per-tenant `max(created_at) GROUP BY tenant_id` query (move to Postgres view/RPC), or fetch with no limit when tenant count ≤ 50 (cpanel-scale today).

- **F-Trace-06 · Major · packages/flags/src/server.ts:67-69 — `loadSnapshot` swallows DB errors and returns an empty map (fail-closed to default-off).** Fail-closed is correct behaviour, but no logging — operators won't know that flag evaluation is silently degraded. A misconfigured DB connection means EVERY flag evaluates to its default forever (until cache TTL expires + a successful read).
  - *Fix:* `process.stderr.write(JSON.stringify({level:"error", msg:"flag.snapshot.load_failed", error: error.message}))` before returning empty. Optional Sentry capture.

- **F-Trace-07 · Major · apps/admin/app/(authed)/feature-flags/actions.ts:18-22 — Comment says "actor_user_id is null in this phase — admin auth lands in a sibling slice".** Acknowledged. But the audit row written with `actor_user_id: null` and `actor_kind: "admin"` doesn't allow forensic reconstruction of who flipped a flag. Same problem as F-Compass-01.
  - *Fix:* Same — derive admin user_id from a placeholder env until Phase 1.0-B; or block flag mutations until admin-auth ships.

- **F-Trace-08 · Major · apps/web/app/app/settings/data/page.tsx:62-67, apps/web/app/app/settings/data/actions.ts:252-266 — Step-up token verification uses `verifyStepUpToken({ purpose: "step_up_account_delete" })`.** Good. BUT step-up cookie is read TWICE — once in page.tsx to decide which form to show, and once in actions.ts to gate the action. The page-side check is purely cosmetic; the action-side check is authoritative. ✓ Defense-in-depth is correct.
  - However: in `actions.ts:324`, after a successful deletion the cookie is deleted. If the deletion FAILS at insert/enqueue, the cookie is NOT cleared and the user can retry. Acceptable UX — but means a partial-success state (insert ok, enqueue failed) leaves both the gdpr_requests row in `status='failed'` AND the cookie still valid for 5 more minutes.
  - *Severity:* Minor edge case. Document or clear the cookie on partial-failure too.

- **F-Trace-09 · Minor · apps/admin/app/(authed)/feature-flags/history-action.ts:38-62 — `fetchFlagHistoryAction` is invoked from a client component (ViewHistoryButton).** Server Action: ✓ correct boundary. Validation via zod: ✓. Service-role read: ✓. Returns the metadata field — which could contain sensitive context. Audit_log metadata for feature_flag mutations contains `enabled_for_tenants_count` and `disabled_for_tenants_count` (counts only — no UUIDs). ✓ Safe.

- **F-Trace-10 · Minor · packages/flags/src/server.ts:93-101 — `rolloutBucket` parses first 8 hex chars of sha256.** Uniform distribution: ✓. Deterministic per (tenant, key): ✓. But the spec says "0-100" while the implementation does `% 100` (returns 0-99). A rollout of 100% covers buckets 0-99 inclusive — so 100% means "all" because the rule is `bucket < rollout_percentage`. ✓ Math checks out. No bug; just verify the docs match — the migration comment says `< pct` correctly.

- **F-Trace-11 · Polish · apps/web/app/api/gdpr/cancel-deletion/route.ts — Route is correctly auth-gated and re-checks ownership via `eq("user_id", userId)` on the lookup.** ✓ Service-role read with belt-and-suspenders ownership check. Cancellation triggers `tenants.status = 'active'` + `deleted_at = null` — and the SQL trigger writes `gdpr.deletion.cancelled` to audit_log. ✓ End-to-end flow is correct.

## Score
- 3 Critical × 18 = 54
- 5 Major × 7 = 35
- 2 Minor × 2 = 4
- 1 Polish × 0.5 = 0.5
- **Total deductions: 93.5** → score 6.5/100. FAIL on this slice; admin destructive-ops + auth-delete failure path are the load-bearing issues.

Summary: Service-role hygiene is solid (every admin query and the user-side GDPR actions go through service clients, never browser). Decrypted agent_facts only ever materialize in the worker. Step-up TOTP is REQUIRED for user deletion AND verified twice (page + action). The 30-day delayed-job cancel chain is correct (bullmq_job_id persisted, BullMQ remove + tenant restore + trigger-audit cancellation). The big concerns: (1) admin destructive ops use a plain env-token compare (no constant-time, no rate-limit, no admin user_id), (2) feature-flags + compliance pages don't audit their views, (3) the hard-delete path swallows auth.users delete errors and marks the request "completed" while the user could still sign in. Fix #1 + #3 before push; #2 can land in the same patch.
