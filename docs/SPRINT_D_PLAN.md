# Sprint D — AlterEgo orchestrator + Mailroom + Chat UI + Gmail OAuth

**Date:** 2026-05-30 · **Lead:** [Forge + Arch] · **Duration:** 5-7 working days
**Companion docs:** [PRD.md](./PRD.md) · [ROADMAP.md](./ROADMAP.md)
**Prereqs in tree:** `packages/llm` (Sprint 1.0-LLM, streaming + tools done), `packages/cipher` (envelope encrypt), `packages/db` (all Sprint 1.0 migrations applied), `apps/worker` queue registry (stubs), `apps/web` middleware + 2FA gates.

This sprint delivers the first *vertical slice* of the AlterEgo: user types in `/app/chat`, orchestrator streams reasoning, decides to call **Mailroom** sub-agent as a tool, Mailroom (worker job) pulls Gmail via OAuth tokens stored in `connected_accounts`, returns triaged inbox, orchestrator renders it back inline. Scope is intentionally Mailroom-only — Scheduler/Oracle/Scribe/Treasurer/Companion follow the same pattern in later sprints.

---

## 1 · AlterEgo orchestrator

New package: **`packages/orchestrator/`** (referenced in roadmap deliverables checklist line 127). Lives outside `apps/worker` so the web app can also import the streaming runtime for `/app/chat` SSE.

### Files to create
- `packages/orchestrator/package.json` — depends on `@autonomux/llm`, `@autonomux/db`, `@autonomux/cipher`, `@autonomux/logger`, `@autonomux/telemetry`.
- `packages/orchestrator/src/index.ts` — barrel: `createAlterEgo`, `AlterEgoRuntime`, `SubAgentRegistry`, types.
- `packages/orchestrator/src/runtime.ts` — `class AlterEgoRuntime` with `runStream({ tenantId, userId, messages, signal }): AsyncIterable<OrchestratorEvent>`. Tool-use loop: call `llm.stream` (Sonnet 4.6) → if `tool_use_start` → invoke registered sub-agent → push `tool_result` block → re-stream until `stop_reason=end_turn`. Persists every loop iteration into `agent_runs` + `sub_agent_runs`.
- `packages/orchestrator/src/sub-agents/registry.ts` — `SubAgentRegistry` map keyed by sub-agent name. Each entry: `{ tool: Tool, invoke: (input, ctx) => Promise<ContentBlock[]> }`. Tool shape matches `@autonomux/llm` `Tool` type (Anthropic JSON-schema).
- `packages/orchestrator/src/sub-agents/mailroom.tool.ts` — exports `mailroomTool: Tool` with `input_schema` `{ action: 'triage' | 'summarize_thread' | 'list_rules', max_messages?: number, since_iso?: string }` and an `invoke()` that enqueues `mailroom.triage` BullMQ job, polls completion via `agentBus` (Redis pub/sub), returns the result blocks.
- `packages/orchestrator/src/events.ts` — discriminated union: `text_delta`, `sub_agent_start`, `sub_agent_progress`, `sub_agent_result`, `final_usage`, `error`.
- `packages/orchestrator/src/system-prompt.ts` — composes the AlterEgo system prompt: persona ([Herald] voice per PRD §13.1) + tenant-scoped `agent_facts` (decrypted, ≤2k chars) + `alterego_settings.personality` dial + the HIPAA refusal contract (PRD §10.3). 4kB cap.
- `packages/orchestrator/src/memory/episodic.ts` — `recallEpisodes(tenantId, query, k=5)` does pgvector cosine search on `agent_memory_episodes`; `writeEpisode()` after each run.
- `packages/orchestrator/src/agent-bus.ts` — Redis pub/sub helpers: `publishJobEvent`, `subscribeToJob(requestId)`. Used by `mailroom.tool.ts` and by the chat SSE endpoint to bridge worker → web.
- `packages/orchestrator/src/__tests__/runtime.test.ts` — Vitest. Stubs LLM + sub-agent invoke. Asserts: tool-call loop terminates, `agent_runs` row written, cost rolled into `usage_meters`, errors don't leak ciphertext.
- `packages/orchestrator/tsconfig.json` — extends root.

### Files to modify
- `packages/db/src/index.ts` — add `recordAgentRun`, `recordSubAgentRun`, `bumpUsageMeter` admin helpers.
- `apps/worker/src/index.ts` — register Mailroom worker (next section) and wire `agent-bus` Redis subscriber.

### DB migrations
- `packages/db/migrations/0009_orchestrator.sql`:
  - `agent_runs`: add `request_id text unique` (idempotency on retry), `parent_run_id uuid references agent_runs(id)` (chat-thread linkage).
  - `agent_memory_episodes`: add `chat_thread_id uuid` indexed for fast thread recall.
  - New table `chat_threads(id, tenant_id, user_id, title, created_at, updated_at, last_message_at)` + RLS by `tenant_id`.
  - New table `chat_messages(id, thread_id, tenant_id, role, content_blocks jsonb, agent_run_id, created_at)` + RLS.

### Env vars
- `OPENROUTER_API_KEY` (already documented in `packages/llm`) — required at boot.
- `LLM_PROVIDER=openrouter` (default) — confirm in worker + web `.env.example`.
- `ORCHESTRATOR_DEFAULT_MODEL=sonnet-4.6` (config knob; haiku fallback at 110% budget per PRD §11.3).
- `ORCHESTRATOR_MAX_TOOL_HOPS=6` — safety brake.

### Parallel build tasks (spawn as agents)
- **A1 · Runtime + tool loop** ([Forge])
- **A2 · Sub-agent registry + Mailroom tool wrapper** ([Forge])
- **A3 · System prompt assembly + episodic recall** ([Forge + Herald])
- **A4 · Migration 0009 + db helpers** ([Atlas])
- **A5 · Agent-bus Redis pub/sub** ([Forge + Watch])

### Jury reviewers
- **Optic** — chat surface IA: do tool-call cards render in user flow?
- **Trace** — every agent_runs row chains into audit_log, request_id end-to-end.
- **Canon** — voice + persona consistent with PRD §13.

### Acceptance
1. `runStream({ tenantId, userId, messages: [{role:'user', content:'triage my inbox'}] })` yields ≥1 `sub_agent_start`, ≥1 `sub_agent_result`, terminates in <90s on Sonnet.
2. `agent_runs` row written with `status='success'`, `input_tokens`/`output_tokens` non-zero, `cost_usd_cents` populated.
3. Retry with same `request_id` returns the prior result (no second LLM call).
4. Cross-tenant test: invoking with tenantA's id never reads tenantB's `agent_facts` (RLS proof).

---

## 2 · Mailroom sub-agent (worker job)

### Files to create
- `apps/worker/src/workers/mailroom.ts` — `startMailroomWorker(deps)`. Consumes `mailroom` queue. Job names: `mailroom.triage`, `mailroom.summarize_thread`. Returns `MailroomResult` to caller via agent-bus + persists `sub_agent_runs`.
- `apps/worker/src/lib/gmail-client.ts` — thin Gmail API wrapper using OAuth tokens from `connected_accounts.encrypted_credentials`. Functions: `listMessagesSince(tenantId, since)`, `getMessage(tenantId, id)`, `addLabel(tenantId, msgId, label)`, `archive(tenantId, msgId)`, `createDraft(tenantId, payload)`. Uses `@autonomux/cipher` `decrypt({purpose:'oauth.gmail'})` to unwrap access token; refreshes if expired (token expiry stored alongside).
- `apps/worker/src/lib/mailroom-engine.ts` — pure logic: fetches last-N messages, applies `mailroom_rules` server-side, calls LLM (Haiku 4.5 per PRD §4.2 cost rule) to rank+classify each unmatched message, returns `[{id, sender, subject, importance, proposed_action, reason}]`.
- `apps/worker/src/lib/phi-redactor.ts` — regex sweep for PRD §10.3 HIPAA patterns (SSN, MRN-like, "patient" + name). Strips before LLM payload; logs incident to `activity_log`.
- `apps/worker/src/workers/__tests__/mailroom.test.ts` — Vitest. Mocks Gmail client, asserts ranking output shape + PHI redaction.

### Files to modify
- `apps/worker/src/queues/index.ts` — wire `mailroom` queue to `processMailroomJob` instead of stub branch (mirror the `gdpr` pattern lines 276-282).
- `apps/worker/src/index.ts` — boot Mailroom worker after queue registry.
- `apps/worker/src/lib/env.ts` — add `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET` to `REQUIRED_ENV` (worker needs them to refresh tokens).

### DB migrations
- `packages/db/migrations/0010_mailroom.sql`:
  - `mailroom_messages` cache table: `(id uuid pk, tenant_id, gmail_msg_id text, gmail_thread_id text, sender text, subject text, snippet text, received_at, importance smallint, proposed_action text, reason text, processed_at, created_at)`, unique `(tenant_id, gmail_msg_id)`, RLS on `tenant_id`. Holds last-7d rolling triage so the orchestrator doesn't re-call LLM on every read.
  - Index `mailroom_messages(tenant_id, received_at desc)`.

### Env vars
- `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET` — shared between web (start OAuth) and worker (refresh).
- `GMAIL_OAUTH_REDIRECT_URI=https://<host>/auth/oauth/gmail/callback`.
- `MAILROOM_TRIAGE_MAX_MESSAGES=25` (default).

### Parallel build tasks
- **B1 · Gmail client + token refresh** ([Forge + Cipher])
- **B2 · Mailroom engine + rule eval** ([Forge])
- **B3 · PHI redactor + activity_log incident write** ([Comply + Forge])
- **B4 · Worker registration + queue wiring** ([Forge])
- **B5 · 0010 migration + tests** ([Atlas])

### Jury reviewers
- **Proof** — ranking outputs sound like AlterEgo voice, no banned words.
- **Trace** — every triage round writes `sub_agent_runs` + `activity_log`; audit chain intact.
- **Compass** — surfaces what the polymath ICP needs (importance not just unread count).
- **Optic** — proposed actions map cleanly to UI cards.

### Acceptance
1. `mailroom.triage` job consumes Gmail OAuth, returns 5-25 ranked messages in <30s.
2. PHI test: synthetic email with "patient John Doe, MRN 12345" never appears in LLM payload (asserted in test) and writes one `activity_log` row with `action_kind='phi.redacted'`.
3. Rule evaluation: a `mailroom_rules` row with `{when:{sender:'noreply@x.com'},then:{action:'archive'}}` causes that message to bypass LLM and be auto-archived (idempotent).
4. Token refresh: expired access token triggers refresh; failure writes `connected_account_events` row with `event_kind='oauth_expired'`.

---

## 3 · Chat UI surface (`/app/chat`)

### Files to create
- `apps/web/app/app/chat/page.tsx` — Server Component. Loads thread list for tenant from `chat_threads`. Renders `<ChatLayout>` shell.
- `apps/web/app/app/chat/[threadId]/page.tsx` — Server Component. Loads thread + last 50 messages, renders `<ChatStream>`.
- `apps/web/app/app/chat/new/action.ts` — Server Action `createThread()` — inserts `chat_threads` row, redirects to `/app/chat/[threadId]`.
- `apps/web/app/api/chat/stream/route.ts` — Edge-incompatible Node route. POST `{ threadId, userMessage }`. Returns `text/event-stream`. Spawns `AlterEgoRuntime.runStream()` and pipes orchestrator events to SSE. Cancels on `request.signal.aborted`.
- `apps/web/components/chat/ChatStream.tsx` — Client Component. EventSource consumer; renders streaming text + inline `SubAgentCard` per `sub_agent_start`/`sub_agent_result` event.
- `apps/web/components/chat/SubAgentCard.tsx` — Renders e.g. Mailroom result: list of triaged messages with importance badge, proposed action, approve/dismiss buttons (approve = follow-up POST that enqueues the write job).
- `apps/web/components/chat/Composer.tsx` — Textarea + send button; submits to `/api/chat/stream`. Disables during in-flight stream.
- `apps/web/components/chat/ThreadList.tsx` — Left rail, lists prior threads.
- `apps/web/lib/chat/sse-client.ts` — typed wrapper over `fetch` + `ReadableStream` reader (browsers' `EventSource` is GET-only; we need POST body, so use fetch + manual SSE parser).
- `apps/web/app/app/chat/layout.tsx` — split-pane layout (thread list + active thread).

### Files to modify
- `apps/web/app/app/page.tsx` — replace "AlterEgo orchestrator · ships in Sprint D" placeholder card with live link to `/app/chat`.
- `apps/web/middleware.ts` — no change (already gates `/app/*` for auth + 2FA).
- `packages/ui/src/index.ts` — export new primitives if any added (likely a `<Badge>` for importance).

### Env vars
None new beyond §1's orchestrator vars (web reads `LLM_PROVIDER` + `OPENROUTER_API_KEY` server-side).

### Parallel build tasks
- **C1 · SSE route handler + orchestrator wiring** ([Forge])
- **C2 · ChatStream + Composer + sse-client** ([Vega + Forge])
- **C3 · SubAgentCard with Mailroom-shaped renderer** ([Vega + Optic])
- **C4 · ThreadList + thread CRUD actions** ([Forge])
- **C5 · A11y pass — keyboard nav, ARIA-live for stream** ([Halo])

### Jury reviewers
- **Optic** — IA: is the chat the obvious entry point post-onboarding?
- **Halo** — WCAG 2.2 AA: ARIA-live `polite` for streamed tokens, keyboard reachable composer + cards, contrast.
- **Canon** — warm palette only (PRD §13.2), no greens/blues/purples, `--r-xl` on cards.
- **Proof** — empty state + error copy substantiated.

### Acceptance
1. Authed user lands at `/app/chat`, creates a thread, types "show me my inbox," sees streaming response + an inline Mailroom card with ≥5 messages within 60s p95.
2. Refresh page → thread persists, messages reload from `chat_messages`.
3. Cancel mid-stream (close tab) → server `signal.aborted` fires, `agent_runs.status='cancelled'`, no orphan budget charge.
4. A11y: axe-core scan returns zero serious/critical.
5. Bundle: First Load JS for `/app/chat` ≤200kB (PRD §9 perf budget).

---

## 4 · Gmail OAuth wiring

### Files to create
- `apps/web/app/auth/oauth/gmail/start/route.ts` — GET. Mints PKCE verifier + state (signed JWT carrying `tenant_id` + `nonce`), redirects to Google authorize URL with scopes `https://www.googleapis.com/auth/gmail.modify` (Tier 2 restricted per PRD §5; pre-CASA we ship behind a `gmail_restricted_scope` GrowthBook flag and fall back to `gmail.metadata` when off).
- `apps/web/app/auth/oauth/gmail/callback/route.ts` — GET. Validates state JWT, exchanges code for tokens, encrypts both `access_token` + `refresh_token` via `@autonomux/cipher` `encrypt({tenantId, purpose:'oauth.gmail'})`, upserts `connected_accounts` row with `integration='gmail'`, `oauth_status='active'`, writes `connected_account_events` row with `event_kind='oauth_granted'`. Redirects to `/app/settings/integrations?connected=gmail`.
- `apps/web/app/app/settings/integrations/page.tsx` — Server Component listing `connected_accounts` rows + a "Connect Gmail" button (link to `/auth/oauth/gmail/start`) and "Disconnect" Server Action.
- `apps/web/app/app/settings/integrations/actions.ts` — `disconnectIntegration(id)` Server Action: revokes token at Google, marks `oauth_status='revoked'`, writes event row, calls `@autonomux/cipher` to overwrite encrypted blob with empty envelope.
- `apps/web/lib/oauth/gmail.ts` — pure helpers: `buildAuthorizeUrl`, `parseCallback`, `exchangeCodeForTokens`, `revokeToken`.
- `apps/web/lib/oauth/state.ts` — sign/verify state JWT (HS256, `OAUTH_STATE_SECRET`).

### Files to modify
- `packages/db/migrations/0010_mailroom.sql` (combine or new `0011_oauth_credentials.sql`): add `encrypted_credentials jsonb` + `token_expires_at timestamptz` columns to `connected_accounts`. (Current schema has `composio_account_id` but no direct-token columns — Gmail is going direct, not via Composio, since Composio Gmail still needs the same CASA approval.)
- `apps/worker/src/lib/gmail-client.ts` (§2) reads/refreshes via these columns.

### Env vars
- `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REDIRECT_URI` (shared with worker).
- `OAUTH_STATE_SECRET` (≥32 bytes, signs state JWT).
- `NEXT_PUBLIC_APP_URL` — for building the redirect URI.

### Parallel build tasks
- **D1 · /start + /callback route handlers** ([Forge + Shield])
- **D2 · 0011 migration: encrypted_credentials column** ([Atlas])
- **D3 · Integrations settings page + disconnect** ([Forge + Vega])
- **D4 · State JWT + PKCE helpers + tests** ([Cipher + Shield])
- **D5 · CASA flag + metadata-scope fallback path** ([Comply + Forge])

### Jury reviewers
- **Trace** — every grant/refresh/revoke writes `connected_account_events` + `audit_log`; chain verifies.
- **Canon** — settings UI matches design system; copy substantiated.
- **Compass** — onboarding nudge from `/app/chat` empty state ("Connect Gmail to triage your inbox") is on-ICP, not pushy.

### Acceptance
1. Click "Connect Gmail" → Google consent → callback writes `connected_accounts` row + encrypted tokens; UI shows "Gmail connected · scopes: gmail.modify".
2. Token refresh: simulate expired access token → next Mailroom job auto-refreshes, updates `token_expires_at`, succeeds.
3. Disconnect: revokes at Google (returns 200), marks row revoked, subsequent Mailroom job fails fast with `oauth.revoked` error class (not a hang).
4. Cipher round-trip: stored ciphertext is not the raw token (asserted in DB inspection test); `purpose='oauth.gmail'` bound — a swap to `purpose='oauth.outlook'` decryption fails closed.
5. CASA flag off: only `gmail.metadata` scope requested; orchestrator surfaces "limited mode" badge.

---

## Sprint exit gates

🎯 Founder opens `/app/chat`, types "triage my inbox," gets a ranked list streamed back with proposed actions within 60s p95.
🎯 `agent_runs` + `sub_agent_runs` + `activity_log` populated for every interaction; audit chain verifies.
🎯 Gmail OAuth tokens stored only as cipher envelopes; `select encrypted_credentials::text from connected_accounts` returns ciphertext, not plaintext.
🎯 Cross-tenant RLS proof test passes for `chat_threads`, `chat_messages`, `mailroom_messages`.
🎯 Cost per chat turn ≤ $0.03 average (Haiku triage + Sonnet compose) at 25-message inbox.
🎯 Jury (Optic + Trace + Canon + Halo + Proof + Compass) PASS WITH FIXES ≥75.

---

## Dependency order (within sprint)

```
A4 (migration 0009) ─┐
D2 (migration 0011) ─┤
B5 (migration 0010) ─┴─► A1,A2,A3,A5 ─► B1..B4 ─► C1..C5 ─► D1,D3..D5
                         (orchestrator   (mailroom    (chat UI    (oauth)
                          + sub-agents)   worker)      surface)
```

Migrations first (block everything). Then orchestrator + agent-bus. Then Mailroom worker (depends on orchestrator's `SubAgentRegistry` shape). Then chat UI (depends on `runStream` event types). OAuth is independent of orchestrator and can run in parallel with B/C, but blocks the §1 acceptance test (no real Gmail to triage without it).
