-- ============================================================================
-- autonomux · 0015_autoroom.sql · Phase 1.2 · AutoRoom workspace
-- Owner: [Atlas]
-- AutoRoom: user-authored automations (chained sub-agent skills) with versioning,
-- run history, per-step execution log, approval gates and per-job encrypted
-- secrets.
--
-- Conventions (inherited from 0001..0014):
--   - All ids: uuid (pgcrypto gen_random_uuid()).
--   - All timestamps: timestamptz, default now().
--   - All money: integer _cents (never numeric).
--   - JSONB columns documented inline.
--   - RLS posture mirrors the 0010_mailroom.sql tenant-scoped pattern:
--     five hand-rolled policies per tenant table:
--       <table>_service_all       (service_role, all ops)
--       <table>_tenant_select     (authenticated, tenant_id match)
--       <table>_tenant_insert
--       <table>_tenant_update
--       <table>_tenant_delete
--   - automation_templates is NOT tenant-scoped — it is a global read-only
--     catalog (one row per built-in template). Public select via authenticated.
--   - Idempotent: every CREATE uses IF NOT EXISTS.
--
-- Audit-log hooks (see "Audit hooks" section at the bottom):
--   - automations            → INSERT / UPDATE / DELETE
--   - automation_versions    → INSERT (every edit produces a new version row)
--   - automation_runs        → INSERT only when trigger_kind = 'manual'
--                              (cron + webhook runs are noisy → log at parent
--                              level only)
--   - automation_approvals   → UPDATE that sets decided_at (the decision event)
--   - automation_secrets     → INSERT / UPDATE / DELETE (always sensitive)
--
-- The actual audit_log inserts are performed by the runtime in
-- packages/audit (service_role context). This migration documents WHICH writes
-- must be logged; it does not install per-table triggers because the audit
-- writer needs the actor_user_id / actor_kind that only the runtime knows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. automations — the job definition (one row per saved automation)
-- ---------------------------------------------------------------------------
-- status:
--   draft     — user is editing; never scheduled or run by cron
--   active    — eligible to run on its schedule / trigger
--   paused    — temporarily disabled (cron skips, manual run still allowed)
--   archived  — read-only history; excluded from default lists
--
-- approval_tier (PRD §4.2 trust ladder):
--   observe         — runs read-only; never writes
--   propose         — proposes actions, awaits user confirmation
--   confirm_each    — runs each step but each write needs confirmation
--   auto_log        — runs autonomously; every write logged to activity_log
--   full_autonomy   — runs autonomously with batched activity log
--
-- trigger_config (jsonb) shape — owned by agent (1) backend runtime:
--   { kind: 'cron'|'webhook'|'manual'|'event',
--     cron: '0 7 * * *', timezone: 'America/Los_Angeles',
--     event: { source: 'mailroom', filter: {...} },
--     webhook_token_ref: 'autoroom.<id>.webhook' }
--
-- scope_config (jsonb): freeform per-skill scopes (label sets, calendar ids…).
-- next_run_at: maintained by the scheduler when status = 'active' and trigger
--              kind = 'cron'. Used by the scheduler scan — partial index below.
-- ---------------------------------------------------------------------------
create table if not exists public.automations (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references public.tenants(id) on delete cascade,
    user_id         uuid not null references auth.users(id)    on delete cascade,
    name            text not null
        check (char_length(name) between 1 and 140),
    description     text,
    status          text not null default 'draft'
        check (status in ('draft', 'active', 'paused', 'archived')),
    trigger_config  jsonb not null default '{}'::jsonb,
    scope_config    jsonb not null default '{}'::jsonb,
    approval_tier   text not null default 'propose'
        check (approval_tier in (
            'observe', 'propose', 'confirm_each', 'auto_log', 'full_autonomy'
        )),
    version         integer not null default 1
        check (version >= 1),
    created_by      uuid references auth.users(id) on delete set null,
    last_run_at     timestamptz,
    next_run_at     timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table  public.automations is
    'User-authored automation jobs (chained sub-agent skills). One row per saved automation. AUDIT: INSERT/UPDATE/DELETE.';
comment on column public.automations.trigger_config is
    'jsonb: {kind, cron, timezone, event, webhook_token_ref} — owned by backend runtime agent.';
comment on column public.automations.approval_tier is
    'PRD §4.2 trust ladder. Determines how the runtime gates writes (observe→full_autonomy).';
comment on column public.automations.next_run_at is
    'Set by scheduler for active cron-kind automations. Partial index below drives the scan.';
comment on column public.automations.version is
    'Monotonically increasing version number. Bumped by every edit (writes a row to automation_versions).';

-- Scheduler scan: cheap "what runs next?" across all tenants.
-- service_role only — RLS allows the cross-tenant scan.
create index if not exists automations_next_run_idx
    on public.automations(next_run_at)
    where status = 'active' and next_run_at is not null;

-- UI: "my automations" list ordered by last_run_at desc, status filter common.
create index if not exists automations_tenant_last_run_idx
    on public.automations(tenant_id, last_run_at desc nulls last);

create index if not exists automations_tenant_status_idx
    on public.automations(tenant_id, status);

-- ---------------------------------------------------------------------------
-- 2. automation_steps — the chained skills (ordered)
-- ---------------------------------------------------------------------------
-- One row per step in the automation pipeline. Position is 0-indexed.
-- skill_name uses dotted notation matching the orchestrator's skill registry,
-- e.g. 'mailroom.triage_inbox', 'scribe.draft_substack', 'scheduler.propose_block'.
--
-- input_template (jsonb): variable-resolution template. Owned by AI orchestration
-- agent (2). Example shape: { "labels": "$.scope.labels", "body": "$prev.draft" }.
--
-- model_tier null = inherit from the skill default (orchestration agent decides).
-- on_error_policy:
--   fail      — abort the run
--   continue  — log error, jump to next step
--   fallback  — jump to fallback_step_position (must be set)
--
-- condition_expr: optional `when` clause; the runtime evaluates against
-- variables (e.g. "$prev.importance >= 4"). Null = always run.
--
-- is_approval_gate / approval_config: makes this step a hold-point that
-- materialises an automation_approvals row. approval_config shape:
--   { summary_template, option_kinds: ['approve'|'edit'|'cancel'], expires_minutes }
-- ---------------------------------------------------------------------------
create table if not exists public.automation_steps (
    id                      uuid primary key default gen_random_uuid(),
    automation_id           uuid not null references public.automations(id) on delete cascade,
    position                smallint not null
        check (position >= 0),
    name                    text not null
        check (char_length(name) between 1 and 140),
    skill_name              text not null,
    skill_version           integer not null default 1
        check (skill_version >= 1),
    input_template          jsonb not null default '{}'::jsonb,
    model_tier              text
        check (model_tier is null or model_tier in ('haiku', 'sonnet', 'opus')),
    max_attempts            smallint not null default 2
        check (max_attempts between 1 and 10),
    on_error_policy         text not null default 'fail'
        check (on_error_policy in ('fail', 'continue', 'fallback')),
    fallback_step_position  smallint
        check (fallback_step_position is null or fallback_step_position >= 0),
    condition_expr          text,
    is_approval_gate        boolean not null default false,
    approval_config         jsonb,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    unique (automation_id, position)
);

comment on table  public.automation_steps is
    'Ordered chained skills inside an automation. One row per step. (automation_id, position) unique.';
comment on column public.automation_steps.input_template is
    'Variable-resolution template (jsonb). Resolved against `variables` at run time. Owned by orchestration agent (2).';
comment on column public.automation_steps.condition_expr is
    'Optional `when` clause. Null = always run. Runtime evaluates against `variables`.';
comment on column public.automation_steps.is_approval_gate is
    'When true, the runtime materialises an automation_approvals row and pauses until decided.';

-- Steps are always fetched per-automation in position order.
create index if not exists automation_steps_automation_idx
    on public.automation_steps(automation_id, position);

-- ---------------------------------------------------------------------------
-- 3. automation_runs — execution history (one row per invocation)
-- ---------------------------------------------------------------------------
-- status flow: pending → running → (awaiting_approval ↔ running)* →
--              completed | failed | cancelled.
--
-- trigger_kind documents how this run started; trigger_payload is the input
-- envelope (e.g. for webhook runs it's the request body; for cron it's
-- '{ cron_at: <iso> }'; for manual it's '{ user_id: <uuid> }').
--
-- variables (jsonb): the running orchestrator context. Includes $prev,
-- per-step outputs and any scope_config merged at run start. Truncated /
-- cipher-wrapped by the runtime if the payload contains PII (the runtime
-- owns that decision).
--
-- total_cost_usd_cents is summed from per-step costs at run completion.
-- ---------------------------------------------------------------------------
create table if not exists public.automation_runs (
    id                      uuid primary key default gen_random_uuid(),
    automation_id           uuid not null references public.automations(id) on delete cascade,
    tenant_id               uuid not null references public.tenants(id)     on delete cascade,
    trigger_kind            text not null
        check (trigger_kind in ('manual', 'cron', 'webhook', 'event', 'replay', 'system')),
    trigger_payload         jsonb not null default '{}'::jsonb,
    status                  text not null default 'pending'
        check (status in (
            'pending', 'running', 'awaiting_approval',
            'completed', 'failed', 'cancelled'
        )),
    started_at              timestamptz,
    finished_at             timestamptz,
    total_cost_usd_cents    integer not null default 0,
    total_steps             smallint not null default 0
        check (total_steps >= 0),
    steps_completed         smallint not null default 0
        check (steps_completed >= 0),
    current_step_position   smallint
        check (current_step_position is null or current_step_position >= 0),
    variables               jsonb not null default '{}'::jsonb,
    error_summary           text,
    created_at              timestamptz not null default now()
);

comment on table  public.automation_runs is
    'One row per automation invocation. Status flows pending→running→(awaiting_approval)→completed/failed/cancelled.';
comment on column public.automation_runs.variables is
    'Running orchestrator context: $prev, per-step outputs, merged scope_config. Runtime cipher-wraps PII before persisting.';
comment on column public.automation_runs.current_step_position is
    'Which automation_steps.position is currently running (for awaiting_approval pause + replay).';

-- "Show me run history for THIS automation" — most common UI query.
create index if not exists automation_runs_automation_idx
    on public.automation_runs(automation_id, created_at desc);

-- Tenant-scoped recent-runs list (dashboard widget).
create index if not exists automation_runs_tenant_idx
    on public.automation_runs(tenant_id, created_at desc);

-- Active runs for the runtime to resume / observe.
create index if not exists automation_runs_active_idx
    on public.automation_runs(tenant_id, status)
    where status in ('pending', 'running', 'awaiting_approval');

-- ---------------------------------------------------------------------------
-- 4. automation_step_runs — per-step execution log
-- ---------------------------------------------------------------------------
-- One row per step attempt inside an automation_run.
-- input/output: structured JSON for replay + audit.
-- attempts: incremented when the step retries within the same run.
-- ---------------------------------------------------------------------------
create table if not exists public.automation_step_runs (
    id              uuid primary key default gen_random_uuid(),
    run_id          uuid not null references public.automation_runs(id) on delete cascade,
    tenant_id       uuid not null references public.tenants(id)         on delete cascade,
    step_position   smallint not null
        check (step_position >= 0),
    step_name       text not null,
    skill_name      text not null,
    status          text not null default 'pending'
        check (status in (
            'pending', 'running', 'completed',
            'failed', 'skipped', 'awaiting_approval'
        )),
    input           jsonb not null default '{}'::jsonb,
    output          jsonb,
    started_at      timestamptz,
    finished_at     timestamptz,
    duration_ms     integer,
    cost_usd_cents  integer not null default 0,
    attempts        smallint not null default 1
        check (attempts >= 1),
    error_kind      text,
    error_message   text,
    created_at      timestamptz not null default now()
);

comment on table  public.automation_step_runs is
    'Per-step execution log. One row per step attempt inside a run. tenant_id duplicated for RLS without join.';
comment on column public.automation_step_runs.attempts is
    'Incremented on retry within the same run. 1 on first attempt.';

-- Step log queried per run in position order (replay + UI timeline).
create index if not exists automation_step_runs_run_idx
    on public.automation_step_runs(run_id, step_position, attempts);

-- Tenant-scoped recent step failures (observability surfaces).
create index if not exists automation_step_runs_tenant_failed_idx
    on public.automation_step_runs(tenant_id, created_at desc)
    where status = 'failed';

-- ---------------------------------------------------------------------------
-- 5. automation_versions — edit history (immutable snapshots)
-- ---------------------------------------------------------------------------
-- One row per edit. config_snapshot is the full automation + steps as JSON
-- so we can show diffs, roll back, and audit "what config was running on date X".
-- Append-only at the app layer (no triggers — the audit_log hook is sufficient,
-- and snapshots are immutable by convention).
-- ---------------------------------------------------------------------------
create table if not exists public.automation_versions (
    id              uuid primary key default gen_random_uuid(),
    automation_id   uuid not null references public.automations(id) on delete cascade,
    tenant_id       uuid not null references public.tenants(id)     on delete cascade,
    version         integer not null
        check (version >= 1),
    config_snapshot jsonb not null,
    edited_by       uuid references auth.users(id) on delete set null,
    edit_summary    text,
    created_at      timestamptz not null default now(),
    unique (automation_id, version)
);

comment on table  public.automation_versions is
    'Immutable edit-history snapshots. One row per saved edit. AUDIT: INSERT.';
comment on column public.automation_versions.config_snapshot is
    'Full automation + steps as jsonb at this version. Used for diff / rollback / audit replay.';

-- Versions queried per automation in descending order.
create index if not exists automation_versions_automation_idx
    on public.automation_versions(automation_id, version desc);

-- ---------------------------------------------------------------------------
-- 6. automation_templates — built-in starter templates (NOT tenant-scoped)
-- ---------------------------------------------------------------------------
-- Global catalog read by all authenticated users. No tenant_id column.
-- icp_tag groups templates by ideal-customer-profile for the onboarding agent.
-- config_template (jsonb) shape mirrors a full automation + steps payload that
-- the runtime can instantiate into per-tenant `automations` rows.
-- Writes restricted to service_role (the templates agent (6) seeds via migrations).
-- ---------------------------------------------------------------------------
create table if not exists public.automation_templates (
    id              uuid primary key default gen_random_uuid(),
    slug            text not null unique,
    name            text not null,
    description     text not null default '',
    icp_tag         text not null default 'all'
        check (icp_tag in ('polymath', 'founder', 'creator', 'wellness', 'all')),
    category        text not null default 'general',
    config_template jsonb not null default '{}'::jsonb,
    is_built_in     boolean not null default true,
    created_at      timestamptz not null default now()
);

comment on table  public.automation_templates is
    'Global catalog of built-in starter templates. NOT tenant-scoped — read by all authenticated users. Writes service_role only.';
comment on column public.automation_templates.slug is
    'Stable identifier (e.g. ''morning-briefing''). Used by the templates agent for upsert and by the onboarding wizard for deep links.';
comment on column public.automation_templates.config_template is
    'Full {automation, steps[]} payload the runtime instantiates into a per-tenant automation. Templates agent (6) owns the shape.';

create index if not exists automation_templates_icp_idx
    on public.automation_templates(icp_tag, category);

-- ---------------------------------------------------------------------------
-- 7. automation_approvals — pending user decisions for approval gates
-- ---------------------------------------------------------------------------
-- Materialised when a step with is_approval_gate=true runs.
-- options (jsonb): the choices presented to the user, e.g.
--   [{ kind: 'approve' }, { kind: 'edit', editable_fields: [...] }, { kind: 'cancel' }]
-- decision (jsonb): user's choice + any edits, e.g.
--   { chosen: 'edit', edits: { subject: '...' } }
-- expires_at: after which the runtime auto-cancels the gate (defaults set by
--             the runtime based on approval_config.expires_minutes).
-- ---------------------------------------------------------------------------
create table if not exists public.automation_approvals (
    id              uuid primary key default gen_random_uuid(),
    run_id          uuid not null references public.automation_runs(id)      on delete cascade,
    step_run_id     uuid not null references public.automation_step_runs(id) on delete cascade,
    tenant_id       uuid not null references public.tenants(id)              on delete cascade,
    action_summary  text not null,
    options         jsonb not null default '[]'::jsonb,
    expires_at      timestamptz not null,
    decided_at      timestamptz,
    decision        jsonb,
    decided_by      uuid references auth.users(id) on delete set null,
    created_at      timestamptz not null default now()
);

comment on table  public.automation_approvals is
    'Pending user decisions for approval-gate steps. AUDIT: UPDATE that sets decided_at.';
comment on column public.automation_approvals.options is
    'Choices presented to the user. Shape owned by orchestration agent (2).';
comment on column public.automation_approvals.expires_at is
    'After which the runtime auto-cancels the gate. Defaults set from approval_config.expires_minutes.';

-- Inbox query: "what's waiting on me, not yet decided, not expired".
create index if not exists automation_approvals_pending_idx
    on public.automation_approvals(tenant_id, expires_at)
    where decided_at is null;

-- Step run join for the runtime resume path.
create index if not exists automation_approvals_step_run_idx
    on public.automation_approvals(step_run_id)
    where decided_at is null;

-- ---------------------------------------------------------------------------
-- 8. automation_secrets — per-job encrypted credentials
-- ---------------------------------------------------------------------------
-- One row per (automation, purpose). E.g. purpose='substack_token' for a
-- Substack-publishing automation. encrypted_blob is a Cipher envelope (jsonb)
-- with shape: { ciphertext, nonce, key_version, kms_key_ref, alg }.
-- Cipher purpose namespace convention: `autoroom.${automation_id}.${purpose}`.
--
-- We keep this in a dedicated table (rather than reusing connected_accounts)
-- because these are per-AUTOMATION secrets — they outlive the user's
-- platform-wide OAuth connection and may be revoked independently.
-- ---------------------------------------------------------------------------
create table if not exists public.automation_secrets (
    id              uuid primary key default gen_random_uuid(),
    automation_id   uuid not null references public.automations(id) on delete cascade,
    tenant_id       uuid not null references public.tenants(id)     on delete cascade,
    purpose         text not null,
    encrypted_blob  jsonb not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (automation_id, purpose)
);

comment on table  public.automation_secrets is
    'Per-job encrypted credentials. One row per (automation, purpose). AUDIT: INSERT/UPDATE/DELETE — always sensitive.';
comment on column public.automation_secrets.purpose is
    'Logical credential name (e.g. ''substack_token''). Cipher key namespace: autoroom.<automation_id>.<purpose>.';
comment on column public.automation_secrets.encrypted_blob is
    'Cipher envelope: { ciphertext, nonce, key_version, kms_key_ref, alg }. Service-role read only.';

create index if not exists automation_secrets_automation_idx
    on public.automation_secrets(automation_id);

create index if not exists automation_secrets_tenant_idx
    on public.automation_secrets(tenant_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (use public.touch_updated_at from 0001)
-- ---------------------------------------------------------------------------
do $$
declare
    t text;
    tables text[] := array[
        'automations',
        'automation_steps',
        'automation_secrets'
    ];
begin
    foreach t in array tables loop
        execute format(
            'drop trigger if exists trg_%I_touch_updated_at on public.%I;',
            t, t
        );
        execute format(
            'create trigger trg_%I_touch_updated_at
                before update on public.%I
                for each row execute function public.touch_updated_at();',
            t, t
        );
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS — enable + force on every new table
-- ---------------------------------------------------------------------------
alter table public.automations           enable row level security;
alter table public.automation_steps      enable row level security;
alter table public.automation_runs       enable row level security;
alter table public.automation_step_runs  enable row level security;
alter table public.automation_versions   enable row level security;
alter table public.automation_templates  enable row level security;
alter table public.automation_approvals  enable row level security;
alter table public.automation_secrets    enable row level security;

alter table public.automations           force row level security;
alter table public.automation_steps      force row level security;
alter table public.automation_runs       force row level security;
alter table public.automation_step_runs  force row level security;
alter table public.automation_versions   force row level security;
alter table public.automation_templates  force row level security;
alter table public.automation_approvals  force row level security;
alter table public.automation_secrets    force row level security;

-- ---------------------------------------------------------------------------
-- Tenant-scoped tables: 5-policy macro (mirrors 0002 / 0010 / 0013).
-- automation_steps has no tenant_id column, so it uses a parent-join policy
-- and is handled separately below.
-- automation_templates is a global catalog and is also handled separately.
-- ---------------------------------------------------------------------------
do $$
declare
    t text;
    tables text[] := array[
        'automations',
        'automation_runs',
        'automation_step_runs',
        'automation_versions',
        'automation_approvals',
        'automation_secrets'
    ];
begin
    foreach t in array tables loop
        execute format('drop policy if exists %I_service_all on public.%I;', t, t);
        execute format(
            'create policy %I_service_all on public.%I
                as permissive for all to service_role
                using (true) with check (true);',
            t, t
        );

        execute format('drop policy if exists %I_tenant_select on public.%I;', t, t);
        execute format(
            'create policy %I_tenant_select on public.%I
                as permissive for select to authenticated
                using (tenant_id = public.current_tenant_id());',
            t, t
        );

        execute format('drop policy if exists %I_tenant_insert on public.%I;', t, t);
        execute format(
            'create policy %I_tenant_insert on public.%I
                as permissive for insert to authenticated
                with check (tenant_id = public.current_tenant_id());',
            t, t
        );

        execute format('drop policy if exists %I_tenant_update on public.%I;', t, t);
        execute format(
            'create policy %I_tenant_update on public.%I
                as permissive for update to authenticated
                using (tenant_id = public.current_tenant_id())
                with check (tenant_id = public.current_tenant_id());',
            t, t
        );

        execute format('drop policy if exists %I_tenant_delete on public.%I;', t, t);
        execute format(
            'create policy %I_tenant_delete on public.%I
                as permissive for delete to authenticated
                using (tenant_id = public.current_tenant_id());',
            t, t
        );
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- automation_secrets — TIGHTEN: authenticated SELECT/UPDATE/DELETE removed.
-- Plaintext secret material must never round-trip through PostgREST. Reads,
-- writes and rotations all go through the runtime / Cipher service which uses
-- the service_role. We KEEP only the service_role bypass (already created
-- above) and DROP the four authenticated policies so this table is
-- service_role-only by RLS even though it is enabled.
-- ---------------------------------------------------------------------------
drop policy if exists automation_secrets_tenant_select on public.automation_secrets;
drop policy if exists automation_secrets_tenant_insert on public.automation_secrets;
drop policy if exists automation_secrets_tenant_update on public.automation_secrets;
drop policy if exists automation_secrets_tenant_delete on public.automation_secrets;

-- ---------------------------------------------------------------------------
-- automation_steps — RLS via parent automation
-- ---------------------------------------------------------------------------
-- No tenant_id column (steps belong to a single automation). We enforce
-- tenant isolation by joining to the parent row.
-- ---------------------------------------------------------------------------
drop policy if exists automation_steps_service_all on public.automation_steps;
create policy automation_steps_service_all on public.automation_steps
    as permissive for all to service_role
    using (true) with check (true);

drop policy if exists automation_steps_tenant_select on public.automation_steps;
create policy automation_steps_tenant_select on public.automation_steps
    as permissive for select to authenticated
    using (
        automation_id in (
            select a.id from public.automations a
            where a.tenant_id = public.current_tenant_id()
        )
    );

drop policy if exists automation_steps_tenant_insert on public.automation_steps;
create policy automation_steps_tenant_insert on public.automation_steps
    as permissive for insert to authenticated
    with check (
        automation_id in (
            select a.id from public.automations a
            where a.tenant_id = public.current_tenant_id()
        )
    );

drop policy if exists automation_steps_tenant_update on public.automation_steps;
create policy automation_steps_tenant_update on public.automation_steps
    as permissive for update to authenticated
    using (
        automation_id in (
            select a.id from public.automations a
            where a.tenant_id = public.current_tenant_id()
        )
    )
    with check (
        automation_id in (
            select a.id from public.automations a
            where a.tenant_id = public.current_tenant_id()
        )
    );

drop policy if exists automation_steps_tenant_delete on public.automation_steps;
create policy automation_steps_tenant_delete on public.automation_steps
    as permissive for delete to authenticated
    using (
        automation_id in (
            select a.id from public.automations a
            where a.tenant_id = public.current_tenant_id()
        )
    );

-- ---------------------------------------------------------------------------
-- automation_templates — public read, service-role write
-- ---------------------------------------------------------------------------
-- Global catalog: any authenticated user may SELECT. Writes restricted to
-- service_role (the templates agent (6) seeds via migrations / admin RPCs).
-- ---------------------------------------------------------------------------
drop policy if exists automation_templates_service_all on public.automation_templates;
create policy automation_templates_service_all on public.automation_templates
    as permissive for all to service_role
    using (true) with check (true);

drop policy if exists automation_templates_public_select on public.automation_templates;
create policy automation_templates_public_select on public.automation_templates
    as permissive for select to authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- Seed: 6 day-one templates (placeholders — templates agent (6) replaces
-- config_template later). Idempotent via slug.
-- ---------------------------------------------------------------------------
insert into public.automation_templates
    (slug, name, description, icp_tag, category, config_template)
values
    ('morning-briefing',
     'Morning Briefing',
     'Daily summary of inbox, calendar and priorities — delivered with your coffee.',
     'all', 'briefing',
     jsonb_build_object(
         'automation', jsonb_build_object(
             'name', 'Morning Briefing',
             'approval_tier', 'auto_log',
             'trigger_config', jsonb_build_object('kind','cron','cron','0 7 * * *')
         ),
         'steps', jsonb_build_array(
             jsonb_build_object('position',0,'name','Inbox snapshot','skill_name','mailroom.triage_inbox'),
             jsonb_build_object('position',1,'name','Today on calendar','skill_name','scheduler.day_view'),
             jsonb_build_object('position',2,'name','Compose brief','skill_name','scribe.compose_briefing')
         )
     )),
    ('inbox-declutter',
     'Inbox Declutter',
     'Triage low-importance mail and propose archives/labels you can approve in one tap.',
     'polymath', 'mailroom',
     jsonb_build_object(
         'automation', jsonb_build_object(
             'name', 'Inbox Declutter',
             'approval_tier', 'propose',
             'trigger_config', jsonb_build_object('kind','cron','cron','0 */3 * * *')
         ),
         'steps', jsonb_build_array(
             jsonb_build_object('position',0,'name','Triage inbox','skill_name','mailroom.triage_inbox'),
             jsonb_build_object('position',1,'name','Propose archives','skill_name','mailroom.propose_archives','is_approval_gate', true)
         )
     )),
    ('calendar-guard',
     'Calendar Guard',
     'Detect conflicts and protect deep-work blocks. Surfaces a heads-up before each clash.',
     'founder', 'scheduler',
     jsonb_build_object(
         'automation', jsonb_build_object(
             'name', 'Calendar Guard',
             'approval_tier', 'propose',
             'trigger_config', jsonb_build_object('kind','event','event', jsonb_build_object('source','scheduler','filter', jsonb_build_object('has_conflict', true)))
         ),
         'steps', jsonb_build_array(
             jsonb_build_object('position',0,'name','Detect conflicts','skill_name','scheduler.detect_conflicts'),
             jsonb_build_object('position',1,'name','Propose resolution','skill_name','scheduler.propose_resolution','is_approval_gate', true)
         )
     )),
    ('substack-weekly',
     'Substack Weekly',
     'Draft and schedule a weekly Substack post in your voice. You approve before publish.',
     'creator', 'scribe',
     jsonb_build_object(
         'automation', jsonb_build_object(
             'name', 'Substack Weekly',
             'approval_tier', 'confirm_each',
             'trigger_config', jsonb_build_object('kind','cron','cron','0 9 * * MON')
         ),
         'steps', jsonb_build_array(
             jsonb_build_object('position',0,'name','Gather notes','skill_name','scribe.gather_notes'),
             jsonb_build_object('position',1,'name','Draft post','skill_name','scribe.draft_substack'),
             jsonb_build_object('position',2,'name','Review + publish','skill_name','scribe.publish_substack','is_approval_gate', true)
         )
     )),
    ('daily-wellness',
     'Daily Wellness',
     'Sends a gentle stretch / breath / journal nudge timed around your meetings.',
     'wellness', 'companion',
     jsonb_build_object(
         'automation', jsonb_build_object(
             'name', 'Daily Wellness',
             'approval_tier', 'full_autonomy',
             'trigger_config', jsonb_build_object('kind','cron','cron','0 10,14,17 * * *')
         ),
         'steps', jsonb_build_array(
             jsonb_build_object('position',0,'name','Read calendar','skill_name','scheduler.day_view'),
             jsonb_build_object('position',1,'name','Pick nudge','skill_name','companion.pick_nudge'),
             jsonb_build_object('position',2,'name','Send nudge','skill_name','companion.send_nudge')
         )
     )),
    ('vip-watcher',
     'VIP Watcher',
     'Watches for mail from your VIPs and surfaces an urgent draft reply for one-tap approval.',
     'founder', 'mailroom',
     jsonb_build_object(
         'automation', jsonb_build_object(
             'name', 'VIP Watcher',
             'approval_tier', 'propose',
             'trigger_config', jsonb_build_object('kind','event','event', jsonb_build_object('source','mailroom','filter', jsonb_build_object('importance_gte',4)))
         ),
         'steps', jsonb_build_array(
             jsonb_build_object('position',0,'name','Match VIP','skill_name','mailroom.match_vip'),
             jsonb_build_object('position',1,'name','Draft reply','skill_name','scribe.draft_reply'),
             jsonb_build_object('position',2,'name','Surface draft','skill_name','mailroom.surface_draft','is_approval_gate', true)
         )
     ))
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Audit hooks — documented contract for packages/audit
-- ---------------------------------------------------------------------------
-- The runtime must call the audit writer with the following (action, resource_type)
-- pairs at the listed points:
--
--   action                               resource_type           when
--   --------------------------------------------------------------------------
--   autoroom.automation.create           automation              INSERT into automations
--   autoroom.automation.update           automation              UPDATE of automations status / trigger_config / approval_tier
--   autoroom.automation.delete           automation              DELETE / archive of automations
--   autoroom.automation.version          automation              INSERT into automation_versions
--   autoroom.run.start_manual            automation_run          INSERT automation_runs WHERE trigger_kind='manual'
--   autoroom.approval.decide             automation_approval     UPDATE automation_approvals SET decided_at = now()
--   autoroom.secret.create               automation_secret       INSERT into automation_secrets
--   autoroom.secret.update               automation_secret       UPDATE of automation_secrets.encrypted_blob
--   autoroom.secret.delete               automation_secret       DELETE of automation_secrets
--
-- Why no per-table triggers: audit_log requires actor_user_id and actor_kind,
-- which DB triggers cannot reliably infer (the service_role connection looks
-- the same for cron-scheduled writes and impersonated admin writes). The
-- audit writer in packages/audit owns this metadata and is the single point
-- of truth.
-- ---------------------------------------------------------------------------

-- End 0015_autoroom.sql
