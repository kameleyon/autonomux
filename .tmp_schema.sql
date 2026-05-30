-- ============================================================================
-- autonomux · 0001_init.sql · Phase 1.0-A5
-- Owner: [Atlas]
-- Foundation schema: tenants, AlterEgo state, sub-agents, logging, billing.
-- Conventions:
--   - All ids: uuid (pgcrypto gen_random_uuid()).
--   - All timestamps: timestamptz, default now().
--   - All money: integer _cents (never numeric for money).
--   - Soft delete (deleted_at) only on `tenants` per PRD §10 retention rules;
--     agent_memory_episodes is hard-delete (GDPR Art. 17).
--   - JSONB columns are documented inline.
-- Idempotent: every CREATE uses IF NOT EXISTS.
-- ============================================================================

create extension if not exists "pgcrypto";
-- Jury F-Trace-01 fix 2026-05-29: vector extension must load BEFORE
-- agent_memory_episodes (which uses vector(1536) column). 0004_pgvector.sql
-- re-asserts + adds the HNSW index — both `if not exists` so duplicate is a no-op.
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- 1. tenants — one row per billing entity
-- ---------------------------------------------------------------------------
-- A tenant is the data-isolation unit. v1 = 1 user per tenant.
-- v1.7+ shared AlterEgos = multi-user tenants (see tenant_members).
-- master_key_ref is a non-secret pointer to AWS KMS / Cipher key namespace.
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
    id              uuid primary key default gen_random_uuid(),
    plan            text not null default 'free'
        check (plan in ('free', 'personal', 'pro', 'founder')),
    status          text not null default 'active'
        check (status in ('active', 'suspended', 'past_due', 'cancelled', 'pending_deletion')),
    master_key_ref  text not null,                       -- KMS / Cipher key namespace (non-secret)
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    deleted_at      timestamptz                           -- soft delete; final purge by retention job
);

comment on table  public.tenants is 'One row per billing entity. Soft-delete only table per PRD §10.';
comment on column public.tenants.master_key_ref is 'KMS key namespace identifier for envelope encryption (not a secret).';

-- ---------------------------------------------------------------------------
-- 2. tenant_members — m:m between Supabase auth.users and tenants
-- ---------------------------------------------------------------------------
-- v1: one user per tenant (role = 'owner').
-- v1.7+: shared AlterEgos may add roles 'member' or 'viewer'.
-- ON DELETE CASCADE on tenant: removing the tenant removes the membership.
-- ON DELETE CASCADE on user: removing the auth user removes the membership row.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_members (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references public.tenants(id) on delete cascade,
    user_id     uuid not null references auth.users(id)    on delete cascade,
    role        text not null default 'owner'
        check (role in ('owner', 'member', 'viewer')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (tenant_id, user_id)
);

create index if not exists tenant_members_user_idx   on public.tenant_members(user_id);
create index if not exists tenant_members_tenant_idx on public.tenant_members(tenant_id);

-- ---------------------------------------------------------------------------
-- 3. alterego_settings — per-tenant AlterEgo configuration
-- ---------------------------------------------------------------------------
-- Single row per tenant.
-- personality: { tone: 'calm'|'warm'|'precise', verbosity: 'concise'|'rich', ... }
-- briefing: { time_local: 'HH:MM', timezone: 'America/Los_Angeles', email_enabled: bool }
-- notifications: { push: bool, email: bool, quiet_hours: {start, end} }
-- trusted_actions: array of rules { action_kind, conditions{}, expires_at? }
--                  PRD §4.2 confirmation gate auto-approval list.
-- ---------------------------------------------------------------------------
create table if not exists public.alterego_settings (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null unique references public.tenants(id) on delete cascade,
    personality     jsonb not null default '{}'::jsonb,
    briefing        jsonb not null default '{}'::jsonb,
    notifications   jsonb not null default '{}'::jsonb,
    trusted_actions jsonb not null default '[]'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists alterego_settings_tenant_idx on public.alterego_settings(tenant_id);

-- ---------------------------------------------------------------------------
-- 4. agent_facts — structured profile facts (encrypted blob)
-- ---------------------------------------------------------------------------
-- Single row per tenant.
-- encrypted_blob: ciphertext (base64) produced by packages/cipher envelope scheme.
-- nonce, key_version: AEAD bookkeeping for the row.
-- schema_version: bump when fact-blob shape changes.
-- ---------------------------------------------------------------------------
create table if not exists public.agent_facts (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null unique references public.tenants(id) on delete cascade,
    encrypted_blob  bytea not null,                       -- libsodium AEAD ciphertext
    nonce           bytea not null,
    key_version     integer not null default 1,
    schema_version  integer not null default 1,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists agent_facts_tenant_idx on public.agent_facts(tenant_id);

-- ---------------------------------------------------------------------------
-- 5. agent_memory_episodes — episodic memory (pgvector)
-- ---------------------------------------------------------------------------
-- See 0004_pgvector.sql for `vector` extension + HNSW index on `embedding`.
-- HARD DELETE on tenant per GDPR Art. 17 (memory leaves no soft trace).
-- per-tenant salt is applied to the embedding input before write (Cipher).
-- content_summary is intentionally short, encrypted-blob carries full text.
-- ---------------------------------------------------------------------------
create table if not exists public.agent_memory_episodes (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references public.tenants(id) on delete cascade,
    content_summary     text not null,
    encrypted_payload   bytea,                            -- optional encrypted full text
    payload_nonce       bytea,
    key_version         integer not null default 1,
    embedding           vector(1536),                     -- requires pgvector (see 0004)
    metadata            jsonb not null default '{}'::jsonb, -- {source: 'briefing'|'chat'|'sub_agent_run', tags[]}
    created_at          timestamptz not null default now()
);

create index if not exists agent_memory_episodes_tenant_idx     on public.agent_memory_episodes(tenant_id);
create index if not exists agent_memory_episodes_created_at_idx on public.agent_memory_episodes(created_at desc);

-- ---------------------------------------------------------------------------
-- 6. agent_runs — every orchestrator invocation
-- ---------------------------------------------------------------------------
-- chain_of_thought_encrypted: encrypted JSONB so cpanel impersonate can read,
-- background queries cannot (Cipher unwraps).
-- tools_called: [{ name, sub_agent, duration_ms, status, request_id }]
-- ---------------------------------------------------------------------------
create table if not exists public.agent_runs (
    id                          uuid primary key default gen_random_uuid(),
    tenant_id                   uuid not null references public.tenants(id) on delete cascade,
    trigger_kind                text not null
        check (trigger_kind in ('briefing_cron', 'user_chat', 'sub_agent_surface', 'webhook', 'manual', 'system')),
    status                      text not null default 'pending'
        check (status in ('pending', 'running', 'success', 'partial', 'failed', 'cancelled')),
    model                       text not null,            -- e.g. 'anthropic/claude-sonnet-4.6'
    input_tokens                integer not null default 0,
    output_tokens               integer not null default 0,
    cost_usd_cents              integer not null default 0,
    duration_ms                 integer,
    tools_called                jsonb not null default '[]'::jsonb,
    chain_of_thought_encrypted  jsonb not null default '{}'::jsonb,
    error                       text,
    created_at                  timestamptz not null default now(),
    finished_at                 timestamptz
);

create index if not exists agent_runs_tenant_idx        on public.agent_runs(tenant_id);
create index if not exists agent_runs_created_at_idx    on public.agent_runs(created_at desc);
create index if not exists agent_runs_status_idx        on public.agent_runs(status) where status in ('pending', 'running', 'failed');

-- ---------------------------------------------------------------------------
-- 7. sub_agent_runs — per-sub-agent invocation log
-- ---------------------------------------------------------------------------
-- FK to agent_runs cascades: deleting the parent run deletes its sub-runs.
-- input/output: structured JSON for replay + audit.
-- ---------------------------------------------------------------------------
create table if not exists public.sub_agent_runs (
    id              uuid primary key default gen_random_uuid(),
    agent_run_id    uuid not null references public.agent_runs(id) on delete cascade,
    tenant_id       uuid not null references public.tenants(id)    on delete cascade,
    sub_agent_name  text not null
        check (sub_agent_name in ('mailroom', 'scheduler', 'scribe', 'oracle', 'treasurer', 'voice', 'companion')),
    status          text not null default 'pending'
        check (status in ('pending', 'running', 'success', 'failed', 'skipped')),
    input           jsonb not null default '{}'::jsonb,
    output          jsonb not null default '{}'::jsonb,
    duration_ms     integer,
    error           text,
    created_at      timestamptz not null default now(),
    finished_at     timestamptz
);

create index if not exists sub_agent_runs_run_idx     on public.sub_agent_runs(agent_run_id);
create index if not exists sub_agent_runs_tenant_idx  on public.sub_agent_runs(tenant_id);
create index if not exists sub_agent_runs_name_idx    on public.sub_agent_runs(sub_agent_name, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. connected_accounts — one row per (tenant, integration)
-- ---------------------------------------------------------------------------
-- Composio holds OAuth tokens; we only hold the reference id.
-- For Plaid we hold an encrypted access_token elsewhere (Cipher namespace).
-- scope_grants: snapshot of granted scopes at last refresh.
-- ---------------------------------------------------------------------------
create table if not exists public.connected_accounts (
    id                      uuid primary key default gen_random_uuid(),
    tenant_id               uuid not null references public.tenants(id) on delete cascade,
    integration             text not null
        check (integration in (
            'gmail', 'outlook', 'google_calendar', 'substack',
            'x', 'linkedin', 'youtube', 'plaid', 'astrology'
        )),
    composio_account_id     text,                          -- null for plaid + astrology (non-Composio)
    oauth_status            text not null default 'pending'
        check (oauth_status in ('pending', 'active', 'expired', 'revoked', 'error')),
    scope_grants            jsonb not null default '[]'::jsonb,
    last_refresh_at         timestamptz,
    last_error              text,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    unique (tenant_id, integration)
);

create index if not exists connected_accounts_tenant_idx       on public.connected_accounts(tenant_id);
create index if not exists connected_accounts_integration_idx  on public.connected_accounts(integration, oauth_status);

-- ---------------------------------------------------------------------------
-- 9. connected_account_events — token refresh / scope change / disconnect log
-- ---------------------------------------------------------------------------
create table if not exists public.connected_account_events (
    id                      uuid primary key default gen_random_uuid(),
    connected_account_id    uuid not null references public.connected_accounts(id) on delete cascade,
    tenant_id               uuid not null references public.tenants(id)            on delete cascade,
    event_kind              text not null
        check (event_kind in (
            'oauth_granted', 'oauth_refreshed', 'oauth_expired',
            'oauth_revoked', 'scope_changed', 'error'
        )),
    payload                 jsonb not null default '{}'::jsonb,
    created_at              timestamptz not null default now()
);

create index if not exists connected_account_events_account_idx on public.connected_account_events(connected_account_id, created_at desc);
create index if not exists connected_account_events_tenant_idx  on public.connected_account_events(tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 10. mailroom_rules — user-defined Mailroom rules (auto-delete/draft/escalate)
-- ---------------------------------------------------------------------------
-- rule_dsl: { when: { sender|subject|label }, then: { action, params } }
-- Evaluated server-side, audited per match.
-- ---------------------------------------------------------------------------
create table if not exists public.mailroom_rules (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references public.tenants(id) on delete cascade,
    name        text not null,
    rule_dsl    jsonb not null,
    active      boolean not null default true,
    priority    integer not null default 100,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists mailroom_rules_tenant_idx on public.mailroom_rules(tenant_id) where active;

-- ---------------------------------------------------------------------------
-- 11. treasurer_bills — detected + confirmed recurring bills
-- ---------------------------------------------------------------------------
create table if not exists public.treasurer_bills (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references public.tenants(id) on delete cascade,
    name                text not null,
    amount_cents        integer not null,
    currency            text not null default 'USD' check (char_length(currency) = 3),
    due_day_of_month    integer not null check (due_day_of_month between 1 and 31),
    source              text not null
        check (source in ('plaid_detected', 'user_added', 'rule_inferred')),
    last_seen_at        timestamptz,
    confirmed           boolean not null default false,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists treasurer_bills_tenant_idx on public.treasurer_bills(tenant_id);

-- ---------------------------------------------------------------------------
-- 12. scribe_voice_samples — user's writing samples (voice mimicry)
-- ---------------------------------------------------------------------------
-- content stored as plaintext here (it's user's intentionally-public writing).
-- If users want private samples, route via agent_facts encrypted blob instead.
-- ---------------------------------------------------------------------------
create table if not exists public.scribe_voice_samples (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references public.tenants(id) on delete cascade,
    label       text not null,
    content     text not null,
    -- Maintained by trigger below — Postgres rejects generated columns whose
    -- expression depends on STABLE functions like regexp_split_to_array.
    word_count  integer not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists scribe_voice_samples_tenant_idx on public.scribe_voice_samples(tenant_id);

create or replace function public.scribe_voice_samples_set_word_count()
returns trigger
language plpgsql
as $$
begin
    new.word_count := coalesce(array_length(regexp_split_to_array(new.content, '\s+'), 1), 0);
    return new;
end;
$$;

drop trigger if exists scribe_voice_samples_word_count on public.scribe_voice_samples;
create trigger scribe_voice_samples_word_count
    before insert or update of content on public.scribe_voice_samples
    for each row
    execute function public.scribe_voice_samples_set_word_count();

-- ---------------------------------------------------------------------------
-- 13. oracle_readings — saved daily oracle pulls (cardology/astrology/tarot)
-- ---------------------------------------------------------------------------
-- payload_encrypted: includes natal-derived data; encrypt per Cipher scheme.
-- user_feedback: -1 / 0 / +1 trinary; null = not yet rated.
-- ---------------------------------------------------------------------------
create table if not exists public.oracle_readings (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references public.tenants(id) on delete cascade,
    reading_date        date not null,
    payload_encrypted   jsonb not null default '{}'::jsonb,
    user_feedback       smallint check (user_feedback in (-1, 0, 1)),
    created_at          timestamptz not null default now(),
    unique (tenant_id, reading_date)
);

create index if not exists oracle_readings_tenant_date_idx on public.oracle_readings(tenant_id, reading_date desc);

-- ---------------------------------------------------------------------------
-- 14. companion_nudges — wellness nudges + dismissal/completion history
-- ---------------------------------------------------------------------------
-- schedule: cron-like spec { rrule, timezone, channels: ['push'|'email'|'inapp'] }
-- ---------------------------------------------------------------------------
create table if not exists public.companion_nudges (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references public.tenants(id) on delete cascade,
    kind            text not null
        check (kind in ('stretch', 'reading', 'breath', 'journal', 'gratitude', 'custom')),
    schedule        jsonb not null,
    dismissed_at    timestamptz,
    completed_at    timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists companion_nudges_tenant_idx on public.companion_nudges(tenant_id);

-- ---------------------------------------------------------------------------
-- 15. activity_log — user-facing action log (PRD §8.1)
-- ---------------------------------------------------------------------------
-- summary + chain_of_thought_summary written by [Herald] copy.
-- Retention: 90d hot here, 2yr cold S3 (job in Phase 1.0-C).
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
    id                          uuid primary key default gen_random_uuid(),
    tenant_id                   uuid not null references public.tenants(id) on delete cascade,
    agent_run_id                uuid references public.agent_runs(id) on delete set null,
    summary                     text not null,
    chain_of_thought_summary    text,
    action_kind                 text not null,
    resource_type               text,
    resource_id                 text,
    created_at                  timestamptz not null default now()
);

create index if not exists activity_log_tenant_idx     on public.activity_log(tenant_id, created_at desc);
create index if not exists activity_log_action_idx     on public.activity_log(action_kind);

-- ---------------------------------------------------------------------------
-- 16. audit_log — compliance Merkle chain (PRD §7.5 / §8.3)
-- ---------------------------------------------------------------------------
-- Append-only — UPDATE + DELETE blocked at RLS in 0002_rls.sql.
-- prev_hash + this_hash computed by trigger in 0003_audit_chain.sql.
-- tenant_id nullable for cross-tenant admin / system events.
-- Retention: 7 years (PRD §8.3).
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid references public.tenants(id) on delete set null,  -- preserve audit after tenant purge
    actor_user_id   uuid references auth.users(id)    on delete set null,
    actor_kind      text not null default 'user'
        check (actor_kind in ('user', 'service', 'admin', 'system', 'webhook')),
    action          text not null,                        -- e.g. 'agent_facts.update', 'oauth.grant'
    resource_type   text not null,
    resource_id     text,
    metadata        jsonb not null default '{}'::jsonb,
    prev_hash       bytea,                                -- null only for the very first row
    this_hash       bytea not null,                       -- always set by trigger
    created_at      timestamptz not null default now()
);

create index if not exists audit_log_tenant_idx     on public.audit_log(tenant_id, created_at desc);
create index if not exists audit_log_action_idx     on public.audit_log(action, created_at desc);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);

comment on table public.audit_log is 'Append-only Merkle-chained audit log. 7-year retention per PRD §8.3.';

-- ---------------------------------------------------------------------------
-- 17. system_log_meta — pointers to Axiom log streams (logs not stored in DB)
-- ---------------------------------------------------------------------------
create table if not exists public.system_log_meta (
    id              uuid primary key default gen_random_uuid(),
    axiom_stream    text not null,
    query_url       text not null,
    description     text,
    created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 18. billing_subscriptions — Stripe subscription mirror
-- ---------------------------------------------------------------------------
create table if not exists public.billing_subscriptions (
    id                          uuid primary key default gen_random_uuid(),
    tenant_id                   uuid not null references public.tenants(id) on delete cascade,
    stripe_subscription_id      text not null unique,
    stripe_customer_id          text not null,
    plan                        text not null
        check (plan in ('free', 'personal', 'pro', 'founder')),
    status                      text not null
        check (status in (
            'trialing', 'active', 'past_due', 'canceled', 'unpaid',
            'incomplete', 'incomplete_expired', 'paused'
        )),
    mrr_cents                   integer not null default 0,
    current_period_start        timestamptz,
    current_period_end          timestamptz,
    cancel_at                   timestamptz,
    canceled_at                 timestamptz,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);

create index if not exists billing_subscriptions_tenant_idx on public.billing_subscriptions(tenant_id);
create index if not exists billing_subscriptions_status_idx on public.billing_subscriptions(status);

-- ---------------------------------------------------------------------------
-- 19. billing_events — Stripe webhook event log
-- ---------------------------------------------------------------------------
-- stripe_event_id unique = idempotency: same webhook delivered twice is a no-op.
-- signature: raw Stripe-Signature header value at receive time (for replay defense).
-- ---------------------------------------------------------------------------
create table if not exists public.billing_events (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid references public.tenants(id) on delete set null,
    stripe_event_id     text not null unique,
    kind                text not null,                     -- e.g. 'invoice.payment_succeeded'
    payload             jsonb not null,
    signature           text,
    processed_at        timestamptz,
    processing_error    text,
    created_at          timestamptz not null default now()
);

create index if not exists billing_events_tenant_idx     on public.billing_events(tenant_id, created_at desc);
create index if not exists billing_events_kind_idx       on public.billing_events(kind, created_at desc);
create index if not exists billing_events_unprocessed_idx on public.billing_events(created_at) where processed_at is null;

-- ---------------------------------------------------------------------------
-- 20. usage_meters — per-tenant per-month usage roll-up (cost + tokens)
-- ---------------------------------------------------------------------------
-- period: 'YYYY-MM' string; one row per (tenant, period).
-- ---------------------------------------------------------------------------
create table if not exists public.usage_meters (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references public.tenants(id) on delete cascade,
    period              text not null
        check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    llm_tokens_in       bigint not null default 0,
    llm_tokens_out      bigint not null default 0,
    composio_calls      integer not null default 0,
    plaid_calls         integer not null default 0,
    cost_usd_cents      integer not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (tenant_id, period)
);

create index if not exists usage_meters_tenant_period_idx on public.usage_meters(tenant_id, period desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger (shared)
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

do $$
declare
    t text;
    tables text[] := array[
        'tenants',
        'tenant_members',
        'alterego_settings',
        'agent_facts',
        'connected_accounts',
        'mailroom_rules',
        'treasurer_bills',
        'scribe_voice_samples',
        'companion_nudges',
        'billing_subscriptions',
        'usage_meters'
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

-- End 0001_init.sql
-- ============================================================================
-- autonomux · 0002_rls.sql · Phase 1.0-A5
-- Owner: [Atlas]
-- Row Level Security across every tenant-scoped table.
-- Posture (per PRD §6.7):
--   - Every tenant-scoped table: USING (tenant_id = auth.jwt() ->> 'tenant_id'::uuid)
--   - Service role: separate bypass policy so workers + cron can cross tenants
--     safely (used only inside packages/db/src/admin.ts).
--   - Admin role (JWT claim 'admin_role' = 'admin'): read-only access to audit_log
--     for the admin cpanel; no write access.
--   - audit_log UPDATE/DELETE blocked unconditionally (append-only).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: current_tenant_id() — robust tenant extraction from JWT
-- ---------------------------------------------------------------------------
-- Returns null for service-role / unauthenticated paths (no tenant claim).
-- Stable inside a transaction; safe to use in policies.
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
    select nullif(
        coalesce(
            current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id',
            ''
        ),
        ''
    )::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Helper: is_admin() — JWT claim 'admin_role' = 'admin' from the admin cpanel
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
    select coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'admin_role',
        ''
    ) = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every public table that holds tenant data
-- ---------------------------------------------------------------------------
alter table public.tenants                  enable row level security;
alter table public.tenant_members           enable row level security;
alter table public.alterego_settings        enable row level security;
alter table public.agent_facts              enable row level security;
alter table public.agent_memory_episodes    enable row level security;
alter table public.agent_runs               enable row level security;
alter table public.sub_agent_runs           enable row level security;
alter table public.connected_accounts       enable row level security;
alter table public.connected_account_events enable row level security;
alter table public.mailroom_rules           enable row level security;
alter table public.treasurer_bills          enable row level security;
alter table public.scribe_voice_samples     enable row level security;
alter table public.oracle_readings          enable row level security;
alter table public.companion_nudges         enable row level security;
alter table public.activity_log             enable row level security;
alter table public.audit_log                enable row level security;
alter table public.system_log_meta          enable row level security;
alter table public.billing_subscriptions    enable row level security;
alter table public.billing_events           enable row level security;
alter table public.usage_meters             enable row level security;

-- Also force RLS on table owners so superuser doesn't accidentally bypass
-- (Postgres default: owner bypasses RLS unless FORCE is set).
alter table public.tenants                  force row level security;
alter table public.tenant_members           force row level security;
alter table public.alterego_settings        force row level security;
alter table public.agent_facts              force row level security;
alter table public.agent_memory_episodes    force row level security;
alter table public.agent_runs               force row level security;
alter table public.sub_agent_runs           force row level security;
alter table public.connected_accounts       force row level security;
alter table public.connected_account_events force row level security;
alter table public.mailroom_rules           force row level security;
alter table public.treasurer_bills          force row level security;
alter table public.scribe_voice_samples     force row level security;
alter table public.oracle_readings          force row level security;
alter table public.companion_nudges         force row level security;
alter table public.activity_log             force row level security;
alter table public.audit_log                force row level security;
alter table public.system_log_meta          force row level security;
alter table public.billing_subscriptions    force row level security;
alter table public.billing_events           force row level security;
alter table public.usage_meters             force row level security;

-- ---------------------------------------------------------------------------
-- Service-role bypass policies (each table)
-- ---------------------------------------------------------------------------
-- Supabase ships a service_role with bypassrls=true on the role, but we still
-- express the intent as policies so an audit can confirm presence. The role
-- bypass is for ops; the policies document "yes, this is intentional".
-- ---------------------------------------------------------------------------

-- 1. tenants — users can read their own tenant via tenant_members
drop policy if exists tenants_service_all on public.tenants;
create policy tenants_service_all on public.tenants
    as permissive for all to service_role using (true) with check (true);

drop policy if exists tenants_member_select on public.tenants;
create policy tenants_member_select on public.tenants
    as permissive for select to authenticated
    using (
        id in (
            select tm.tenant_id from public.tenant_members tm
            where tm.user_id = auth.uid()
        )
    );

drop policy if exists tenants_member_update on public.tenants;
create policy tenants_member_update on public.tenants
    as permissive for update to authenticated
    using (
        id in (
            select tm.tenant_id from public.tenant_members tm
            where tm.user_id = auth.uid() and tm.role = 'owner'
        )
    )
    with check (
        id in (
            select tm.tenant_id from public.tenant_members tm
            where tm.user_id = auth.uid() and tm.role = 'owner'
        )
    );

-- INSERT/DELETE on tenants: service-role only (signup + GDPR delete).

-- 2. tenant_members
drop policy if exists tenant_members_service_all on public.tenant_members;
create policy tenant_members_service_all on public.tenant_members
    as permissive for all to service_role using (true) with check (true);

drop policy if exists tenant_members_self_select on public.tenant_members;
create policy tenant_members_self_select on public.tenant_members
    as permissive for select to authenticated
    using (user_id = auth.uid() or tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- Tenant-scoped policy macro
-- Every table below gets 5 policies:
--   <table>_service_all       (service_role bypass, ALL)
--   <table>_tenant_select     (authenticated, tenant_id match)
--   <table>_tenant_insert
--   <table>_tenant_update
--   <table>_tenant_delete
-- ---------------------------------------------------------------------------

do $$
declare
    t text;
    tables text[] := array[
        'alterego_settings',
        'agent_facts',
        'agent_memory_episodes',
        'agent_runs',
        'sub_agent_runs',
        'connected_accounts',
        'connected_account_events',
        'mailroom_rules',
        'treasurer_bills',
        'scribe_voice_samples',
        'oracle_readings',
        'companion_nudges',
        'activity_log',
        'billing_subscriptions',
        'usage_meters'
    ];
begin
    foreach t in array tables loop
        -- service-role bypass
        execute format('drop policy if exists %I_service_all on public.%I;', t, t);
        execute format(
            'create policy %I_service_all on public.%I
                as permissive for all to service_role
                using (true) with check (true);',
            t, t
        );

        -- SELECT
        execute format('drop policy if exists %I_tenant_select on public.%I;', t, t);
        execute format(
            'create policy %I_tenant_select on public.%I
                as permissive for select to authenticated
                using (tenant_id = public.current_tenant_id());',
            t, t
        );

        -- INSERT
        execute format('drop policy if exists %I_tenant_insert on public.%I;', t, t);
        execute format(
            'create policy %I_tenant_insert on public.%I
                as permissive for insert to authenticated
                with check (tenant_id = public.current_tenant_id());',
            t, t
        );

        -- UPDATE
        execute format('drop policy if exists %I_tenant_update on public.%I;', t, t);
        execute format(
            'create policy %I_tenant_update on public.%I
                as permissive for update to authenticated
                using (tenant_id = public.current_tenant_id())
                with check (tenant_id = public.current_tenant_id());',
            t, t
        );

        -- DELETE
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
-- billing_events — special case
-- ---------------------------------------------------------------------------
-- Webhooks arrive via service_role; users may SELECT their own tenant's events
-- (for the billing settings page). Writes only by service_role.
-- ---------------------------------------------------------------------------
drop policy if exists billing_events_service_all on public.billing_events;
create policy billing_events_service_all on public.billing_events
    as permissive for all to service_role using (true) with check (true);

drop policy if exists billing_events_tenant_select on public.billing_events;
create policy billing_events_tenant_select on public.billing_events
    as permissive for select to authenticated
    using (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- system_log_meta — admin-readable only
-- ---------------------------------------------------------------------------
drop policy if exists system_log_meta_service_all on public.system_log_meta;
create policy system_log_meta_service_all on public.system_log_meta
    as permissive for all to service_role using (true) with check (true);

drop policy if exists system_log_meta_admin_select on public.system_log_meta;
create policy system_log_meta_admin_select on public.system_log_meta
    as permissive for select to authenticated
    using (public.is_admin());

-- ---------------------------------------------------------------------------
-- audit_log — APPEND-ONLY
-- ---------------------------------------------------------------------------
-- Writes: service_role only (the audit writer in packages/audit).
-- Reads: tenant SELECT for own rows (Settings → Activity history can show
--        the audit-level rows that pertain to the user) + admin SELECT (read-only).
-- UPDATE/DELETE: no policy granted to anyone except service_role; the trigger
--        in 0003_audit_chain.sql additionally raises on UPDATE/DELETE attempts.
-- ---------------------------------------------------------------------------
drop policy if exists audit_log_service_all on public.audit_log;
create policy audit_log_service_all on public.audit_log
    as permissive for all to service_role using (true) with check (true);

drop policy if exists audit_log_tenant_select on public.audit_log;
create policy audit_log_tenant_select on public.audit_log
    as permissive for select to authenticated
    using (tenant_id = public.current_tenant_id());

drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
    as permissive for select to authenticated
    using (public.is_admin());

-- No INSERT/UPDATE/DELETE policy for authenticated → only service_role can write.

-- End 0002_rls.sql
-- ============================================================================
-- autonomux · 0003_audit_chain.sql · Phase 1.0-A5
-- Owner: [Atlas + Cipher]
-- Merkle-style hash chain over `audit_log`. Append-only at the trigger level.
-- Daily checkpoint posts chain head to OpenTimestamps in Phase 1.7 (not yet).
-- Per PRD §7.5.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- audit_chain_checkpoints — daily chain head snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.audit_chain_checkpoints (
    id                  uuid primary key default gen_random_uuid(),
    checkpoint_date     date not null unique,
    chain_head_hash     bytea not null,
    row_count           bigint not null,
    signature_pending   boolean not null default true, -- flipped false when OTS receipt received
    ots_receipt         bytea,                          -- OpenTimestamps proof (Phase 1.7)
    created_at          timestamptz not null default now(),
    signed_at           timestamptz
);

alter table public.audit_chain_checkpoints enable row level security;
alter table public.audit_chain_checkpoints force row level security;

drop policy if exists audit_chain_checkpoints_service_all on public.audit_chain_checkpoints;
create policy audit_chain_checkpoints_service_all on public.audit_chain_checkpoints
    as permissive for all to service_role using (true) with check (true);

drop policy if exists audit_chain_checkpoints_admin_select on public.audit_chain_checkpoints;
create policy audit_chain_checkpoints_admin_select on public.audit_chain_checkpoints
    as permissive for select to authenticated
    using (public.is_admin());

-- ---------------------------------------------------------------------------
-- compute_audit_hash() — BEFORE INSERT trigger
-- ---------------------------------------------------------------------------
-- Fills prev_hash from the latest existing row (global chain — single chain
-- across all tenants; tenant isolation is enforced via RLS at read time).
-- Computes this_hash = sha256(prev_hash_or_zero || canonical_payload).
-- canonical_payload concatenates all material fields in fixed order.
-- ---------------------------------------------------------------------------
create or replace function public.compute_audit_hash()
returns trigger
language plpgsql
security definer            -- needs to read last row regardless of RLS
set search_path = public, pg_catalog
as $$
declare
    last_hash bytea;
    payload   bytea;
begin
    -- Block UPDATE / DELETE at the trigger level even if RLS allowed it.
    if tg_op <> 'INSERT' then
        raise exception 'audit_log is append-only (operation % rejected)', tg_op
            using errcode = 'P0001';
    end if;

    -- Pull last hash. Order by created_at + id for total order (handles same-tx ties).
    select this_hash
      into last_hash
      from public.audit_log
     order by created_at desc, id desc
     limit 1;

    new.prev_hash := last_hash;  -- null only for genesis row

    -- Canonical payload: fixed-order concatenation of byte-stable fields.
    -- jsonb_build_object → text → convert_to bytea for deterministic encoding.
    payload := convert_to(
        coalesce(encode(coalesce(last_hash, '\x00'::bytea), 'hex'), '') || '|' ||
        new.id::text || '|' ||
        coalesce(new.tenant_id::text, '')   || '|' ||
        coalesce(new.actor_user_id::text, '') || '|' ||
        new.actor_kind                       || '|' ||
        new.action                           || '|' ||
        new.resource_type                    || '|' ||
        coalesce(new.resource_id, '')        || '|' ||
        coalesce(new.metadata::text, '{}')   || '|' ||
        (extract(epoch from coalesce(new.created_at, now()))::numeric * 1000000)::bigint::text,
        'UTF8'
    );

    new.this_hash := digest(payload, 'sha256');

    return new;
end;
$$;

drop trigger if exists trg_audit_log_compute_hash on public.audit_log;
create trigger trg_audit_log_compute_hash
    before insert on public.audit_log
    for each row execute function public.compute_audit_hash();

-- Hard block on UPDATE / DELETE (belt + suspenders: RLS denies, trigger raises).
create or replace function public.audit_log_reject_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'audit_log is append-only (operation % rejected)', tg_op
        using errcode = 'P0001';
    return null;
end;
$$;

drop trigger if exists trg_audit_log_reject_update on public.audit_log;
create trigger trg_audit_log_reject_update
    before update on public.audit_log
    for each row execute function public.audit_log_reject_mutation();

drop trigger if exists trg_audit_log_reject_delete on public.audit_log;
create trigger trg_audit_log_reject_delete
    before delete on public.audit_log
    for each row execute function public.audit_log_reject_mutation();

-- ---------------------------------------------------------------------------
-- verify_audit_chain(p_tenant_id uuid)
-- ---------------------------------------------------------------------------
-- Walks the chain — if p_tenant_id is null, verifies the global chain;
-- otherwise filters and re-verifies only that tenant's slice using
-- per-row stored prev_hash links (we keep the global chain whole; the
-- per-tenant filter is for admin-cpanel proof of inclusion, not
-- independent chain integrity).
-- Returns true if every recomputed hash matches stored this_hash.
-- ---------------------------------------------------------------------------
create or replace function public.verify_audit_chain(p_tenant_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    r           record;
    prev        bytea := null;
    recomputed  bytea;
    payload     bytea;
begin
    for r in
        select id, tenant_id, actor_user_id, actor_kind, action,
               resource_type, resource_id, metadata, prev_hash, this_hash, created_at
          from public.audit_log
         where p_tenant_id is null or tenant_id = p_tenant_id
         order by created_at asc, id asc
    loop
        -- For global verification, prev should equal r.prev_hash.
        if p_tenant_id is null then
            if (prev is null and r.prev_hash is not null)
                or (prev is not null and r.prev_hash is null)
                or (prev is distinct from r.prev_hash)
            then
                return false;
            end if;
        end if;

        payload := convert_to(
            coalesce(encode(coalesce(r.prev_hash, '\x00'::bytea), 'hex'), '') || '|' ||
            r.id::text || '|' ||
            coalesce(r.tenant_id::text, '')   || '|' ||
            coalesce(r.actor_user_id::text, '') || '|' ||
            r.actor_kind                       || '|' ||
            r.action                           || '|' ||
            r.resource_type                    || '|' ||
            coalesce(r.resource_id, '')        || '|' ||
            coalesce(r.metadata::text, '{}')   || '|' ||
            (extract(epoch from r.created_at)::numeric * 1000000)::bigint::text,
            'UTF8'
        );

        recomputed := digest(payload, 'sha256');

        if recomputed is distinct from r.this_hash then
            return false;
        end if;

        prev := r.this_hash;
    end loop;

    return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- write_audit_checkpoint(p_date date) — captures chain head for the day
-- ---------------------------------------------------------------------------
-- Called by a Phase 1.7 cron job; for now we ship the function so the schema
-- is forward-compatible.
-- ---------------------------------------------------------------------------
create or replace function public.write_audit_checkpoint(p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    head_hash       bytea;
    n_rows          bigint;
    checkpoint_id   uuid;
begin
    select this_hash, (select count(*) from public.audit_log)
      into head_hash, n_rows
      from public.audit_log
     order by created_at desc, id desc
     limit 1;

    if head_hash is null then
        return null; -- nothing to checkpoint
    end if;

    insert into public.audit_chain_checkpoints (
        checkpoint_date, chain_head_hash, row_count, signature_pending
    )
    values (p_date, head_hash, n_rows, true)
    on conflict (checkpoint_date)
    do update set
        chain_head_hash = excluded.chain_head_hash,
        row_count       = excluded.row_count,
        signature_pending = true,
        signed_at         = null
    returning id into checkpoint_id;

    return checkpoint_id;
end;
$$;

-- End 0003_audit_chain.sql
-- ============================================================================
-- autonomux · 0004_pgvector.sql · Phase 1.0-A5
-- Owner: [Atlas]
-- Enables pgvector and indexes agent_memory_episodes.embedding.
--
-- Index choice: HNSW (Hierarchical Navigable Small World).
--   Why HNSW over IVFFlat:
--     - Better recall at low query latency for our expected scale
--       (≤ 100k episodes per tenant; ~1M across all tenants at Phase 2).
--     - No "training" / re-index step required — IVFFlat needs periodic
--       re-cluster as the dataset grows.
--     - Cosine distance is the right metric for OpenAI/Voyage 1536-dim
--       embeddings used by [Cipher]'s embedding pipeline.
--   Trade-off: HNSW build is slower + uses more memory at write time. Acceptable
--   here because episodes are appended at conversational pace, not bulk-loaded.
--
-- The pre-filter on tenant_id is enforced by RLS at query time; we additionally
-- include tenant_id in a B-tree to make the planner happy when combining a
-- vector search with the tenancy predicate.
-- ============================================================================

create extension if not exists "vector";

-- HNSW index on the embedding column.
-- Cosine distance ('vector_cosine_ops') matches the embedding model output.
-- m = 16, ef_construction = 64 are pgvector defaults; tune per Phase 2 perf review.
create index if not exists agent_memory_episodes_embedding_hnsw_idx
    on public.agent_memory_episodes
    using hnsw (embedding vector_cosine_ops)
    with (m = 16, ef_construction = 64);

-- Composite predicate index: tenant_id + created_at for filtered recent queries.
-- (Already created in 0001_init.sql; here only as a defensive idempotent re-check.)
create index if not exists agent_memory_episodes_tenant_created_idx
    on public.agent_memory_episodes(tenant_id, created_at desc);

-- End 0004_pgvector.sql
-- ============================================================================
-- autonomux · 0005_2fa.sql · Phase 1.0-B2+B3
-- Owner: [Cipher + Shield]
-- TOTP enrollment + WebAuthn/Passkey credentials.
-- Per PRD §7.1 — TOTP mandatory at signup; WebAuthn optional 2nd factor.
--
-- Design:
--   - Single `user_2fa_factors` table holds both factor kinds. `kind` discriminator.
--   - TOTP secret stored ONLY as Cipher envelope ciphertext (JSONB shape).
--     `purpose='totp_secret'` bound into the envelope AAD + KMS context.
--   - Backup codes (TOTP only) stored as SHA-256 hashes — one-way; even we
--     cannot read them post-display. Stored as a JSONB array of hex strings.
--   - WebAuthn `credential_public_key` is plaintext: it is public by design.
--   - WebAuthn `credential_id` is a base64url string, unique across the table.
--   - One TOTP per user; many WebAuthn allowed → enforced by partial unique.
--   - Every enroll / revoke fires a trigger → audit_log row (service-role write
--     via security definer; survives RLS without granting users insert on
--     audit_log).
--   - RLS: users see only their own factors; service-role bypass; admins blind
--     (their cpanel cannot read secret material).
-- Idempotent: every CREATE / ALTER uses IF NOT EXISTS / OR REPLACE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- user_2fa_factors — one row per enrolled factor (TOTP OR WebAuthn credential)
-- ---------------------------------------------------------------------------
-- secret_encrypted: TOTP only — `EncryptedEnvelope` JSON shape from
--   packages/cipher (v, dek_ciphertext, dek_aad, ct, nonce, aad). NEVER plaintext.
-- credential_id: WebAuthn only — base64url credentialId from authenticator.
-- credential_public_key: WebAuthn only — COSE public key bytes, base64url.
-- credential_counter: WebAuthn only — signature counter for clone-detection.
-- credential_transports: WebAuthn only — ['usb','nfc','ble','internal','hybrid'].
-- credential_device_type: WebAuthn only — 'singleDevice' | 'multiDevice'.
-- credential_backed_up: WebAuthn only — true if the credential is in the cloud.
-- credential_nickname: WebAuthn only — user-set label ("YubiKey", "iPhone").
-- backup_codes_encrypted: TOTP only — JSONB array of sha256 hex hashes; each
--   code is consumed exactly once (we strike it from the array on use).
-- backup_codes_displayed_at: TOTP only — set when user confirms "I've saved these".
-- ---------------------------------------------------------------------------
create table if not exists public.user_2fa_factors (
    id                          uuid primary key default gen_random_uuid(),
    user_id                     uuid not null references auth.users(id) on delete cascade,
    tenant_id                   uuid not null references public.tenants(id) on delete cascade,
    kind                        text not null
        check (kind in ('totp', 'webauthn')),

    -- TOTP-only columns ------------------------------------------------------
    secret_encrypted            jsonb,                -- Cipher envelope; null for webauthn
    backup_codes_encrypted      jsonb,                -- JSONB string[] of sha256 hex
    backup_codes_displayed_at   timestamptz,          -- "I've saved them" gate

    -- WebAuthn-only columns --------------------------------------------------
    credential_id               text,                 -- base64url, unique
    credential_public_key       text,                 -- COSE pubkey, base64url (PUBLIC)
    credential_counter          bigint default 0,
    credential_transports       text[] default '{}',
    credential_device_type      text
        check (credential_device_type in ('singleDevice', 'multiDevice') or credential_device_type is null),
    credential_backed_up        boolean,
    credential_nickname         text,

    -- Shared bookkeeping -----------------------------------------------------
    enrolled_at                 timestamptz not null default now(),
    last_used_at                timestamptz,
    revoked_at                  timestamptz,          -- soft-revoke; row stays for audit

    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now(),

    -- Shape invariants -------------------------------------------------------
    constraint user_2fa_factors_totp_shape check (
        kind <> 'totp' or (
            secret_encrypted is not null
            and credential_id is null
            and credential_public_key is null
        )
    ),
    constraint user_2fa_factors_webauthn_shape check (
        kind <> 'webauthn' or (
            credential_id is not null
            and credential_public_key is not null
            and secret_encrypted is null
            and backup_codes_encrypted is null
        )
    )
);

comment on table  public.user_2fa_factors is
    'Per-user 2FA factors. TOTP secrets are Cipher envelope ciphertext. WebAuthn pubkeys are plaintext by design.';
comment on column public.user_2fa_factors.secret_encrypted is
    'Cipher envelope JSON (v, dek_ciphertext, dek_aad, ct, nonce, aad). purpose=totp_secret.';
comment on column public.user_2fa_factors.backup_codes_encrypted is
    'JSONB array of sha256 hex strings — one-way. Strike on use.';
comment on column public.user_2fa_factors.credential_public_key is
    'Public by design (FIDO2/WebAuthn spec). Plaintext storage is correct.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists user_2fa_factors_user_idx
    on public.user_2fa_factors(user_id) where revoked_at is null;
create index if not exists user_2fa_factors_tenant_idx
    on public.user_2fa_factors(tenant_id) where revoked_at is null;
create index if not exists user_2fa_factors_kind_idx
    on public.user_2fa_factors(user_id, kind) where revoked_at is null;

-- One TOTP per user (active rows only); many WebAuthn allowed.
create unique index if not exists user_2fa_factors_totp_unique
    on public.user_2fa_factors(user_id)
    where kind = 'totp' and revoked_at is null;

-- credential_id globally unique among active WebAuthn rows (matches the spec).
create unique index if not exists user_2fa_factors_webauthn_credential_id_unique
    on public.user_2fa_factors(credential_id)
    where kind = 'webauthn' and revoked_at is null;

-- ---------------------------------------------------------------------------
-- updated_at touch trigger (re-uses public.touch_updated_at from 0001).
-- ---------------------------------------------------------------------------
drop trigger if exists trg_user_2fa_factors_touch_updated_at on public.user_2fa_factors;
create trigger trg_user_2fa_factors_touch_updated_at
    before update on public.user_2fa_factors
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_2fa_factors enable row level security;
alter table public.user_2fa_factors force row level security;

-- service_role bypass (web Server Actions write via service client during
-- enrollment because the audit insert must succeed regardless of caller RLS).
drop policy if exists user_2fa_factors_service_all on public.user_2fa_factors;
create policy user_2fa_factors_service_all on public.user_2fa_factors
    as permissive for all to service_role using (true) with check (true);

-- User can read ONLY their own factors. They cannot read other users'
-- factors even within the same tenant (shared-tenant world, Phase 1.7+).
drop policy if exists user_2fa_factors_self_select on public.user_2fa_factors;
create policy user_2fa_factors_self_select on public.user_2fa_factors
    as permissive for select to authenticated
    using (user_id = auth.uid());

-- User can soft-revoke (UPDATE revoked_at) their OWN active factor IF the
-- step-up window is open. The step-up window is enforced in application code
-- (JWT claim or short-lived cookie); RLS only checks ownership here — we do
-- NOT trust client-supplied flags for the step-up window.
drop policy if exists user_2fa_factors_self_update on public.user_2fa_factors;
create policy user_2fa_factors_self_update on public.user_2fa_factors
    as permissive for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- No INSERT / DELETE policy for authenticated — service_role only.
-- (Server Action runs as service_role to atomically insert factor + audit row.)

-- Admins are BLIND to factor secrets. We deliberately do not grant any admin
-- read policy here — even read-only admin cpanel cannot see secret material.

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------
-- Every enroll (INSERT) and every revoke (UPDATE setting revoked_at) writes
-- an `audit_log` row. We use security definer so the trigger can write to
-- audit_log regardless of the calling role's RLS posture, and we explicitly
-- set search_path to avoid CVE-2018-1058 style hijacks.
--
-- We do NOT log the secret_encrypted value or the backup_codes_encrypted
-- array. Only kind + factor id + nickname (if any) + actor.
-- ---------------------------------------------------------------------------
create or replace function public.audit_2fa_factor_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    actor_user uuid;
    actor_kind_resolved text;
    action_label text;
    meta jsonb;
begin
    -- Resolve actor: prefer auth.uid() when present, else service.
    begin
        actor_user := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
    exception when others then
        actor_user := null;
    end;
    actor_kind_resolved := case when actor_user is not null then 'user' else 'service' end;

    if tg_op = 'INSERT' then
        action_label := '2fa.enroll';
        meta := jsonb_build_object(
            'kind', new.kind,
            'factor_id', new.id,
            'nickname', coalesce(new.credential_nickname, null)
        );
        insert into public.audit_log (
            tenant_id, actor_user_id, actor_kind,
            action, resource_type, resource_id, metadata
        ) values (
            new.tenant_id, coalesce(actor_user, new.user_id), actor_kind_resolved,
            action_label, 'user_2fa_factor', new.id::text, meta
        );
        return new;
    end if;

    if tg_op = 'UPDATE' then
        -- Revocation: revoked_at transitions from null -> not-null.
        if (old.revoked_at is null and new.revoked_at is not null) then
            action_label := '2fa.revoke';
            meta := jsonb_build_object(
                'kind', new.kind,
                'factor_id', new.id,
                'nickname', coalesce(new.credential_nickname, null)
            );
            insert into public.audit_log (
                tenant_id, actor_user_id, actor_kind,
                action, resource_type, resource_id, metadata
            ) values (
                new.tenant_id, coalesce(actor_user, new.user_id), actor_kind_resolved,
                action_label, 'user_2fa_factor', new.id::text, meta
            );
        end if;
        -- Backup-code display confirmation also worth auditing.
        if (old.backup_codes_displayed_at is null
            and new.backup_codes_displayed_at is not null) then
            insert into public.audit_log (
                tenant_id, actor_user_id, actor_kind,
                action, resource_type, resource_id, metadata
            ) values (
                new.tenant_id, coalesce(actor_user, new.user_id), actor_kind_resolved,
                '2fa.backup_codes_displayed', 'user_2fa_factor', new.id::text,
                jsonb_build_object('factor_id', new.id)
            );
        end if;
        return new;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_user_2fa_factors_audit_insert on public.user_2fa_factors;
create trigger trg_user_2fa_factors_audit_insert
    after insert on public.user_2fa_factors
    for each row execute function public.audit_2fa_factor_change();

drop trigger if exists trg_user_2fa_factors_audit_update on public.user_2fa_factors;
create trigger trg_user_2fa_factors_audit_update
    after update on public.user_2fa_factors
    for each row execute function public.audit_2fa_factor_change();

-- ---------------------------------------------------------------------------
-- user_2fa_verify_attempts — sliding-window brute-force counter
-- ---------------------------------------------------------------------------
-- Append-only log of TOTP/backup-code/WebAuthn verify attempts. Rate limit:
-- "max 5 attempts per minute per user" enforced in application code by
-- counting rows in the last 60 seconds. We keep the table small via cleanup
-- (rows older than 24h purged by a Phase 1.0-C cron). For now it's small
-- enough to live forever.
-- ---------------------------------------------------------------------------
create table if not exists public.user_2fa_verify_attempts (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    kind        text not null check (kind in ('totp', 'backup_code', 'webauthn')),
    success     boolean not null,
    ip_address  text,
    user_agent  text,
    created_at  timestamptz not null default now()
);

create index if not exists user_2fa_verify_attempts_recent_idx
    on public.user_2fa_verify_attempts(user_id, created_at desc);

alter table public.user_2fa_verify_attempts enable row level security;
alter table public.user_2fa_verify_attempts force row level security;

drop policy if exists user_2fa_verify_attempts_service_all on public.user_2fa_verify_attempts;
create policy user_2fa_verify_attempts_service_all on public.user_2fa_verify_attempts
    as permissive for all to service_role using (true) with check (true);

drop policy if exists user_2fa_verify_attempts_self_select on public.user_2fa_verify_attempts;
create policy user_2fa_verify_attempts_self_select on public.user_2fa_verify_attempts
    as permissive for select to authenticated
    using (user_id = auth.uid());

-- End 0005_2fa.sql
-- ============================================================================
-- autonomux · 0006_feature_flags.sql · Phase 1.0-C6
-- Owner: [Lens + Forge]
-- Self-hosted minimum feature flags store. PRD §3.2 admin cpanel row
-- "Feature flags · GrowthBook console · % rollouts · per-tenant overrides".
--
-- Design:
--   - One row per flag, keyed by stable string `key` (matches the
--     evaluator's `evaluateFlag(key)` argument).
--   - Rule precedence (enforced in evaluator, NOT in SQL):
--       1. disabled_for_tenants  → false (denylist wins)
--       2. enabled_for_tenants   → true  (explicit allow)
--       3. rollout_percentage    → true iff hash(tenant_id||key) % 100 < pct
--       4. enabled_globally      → true
--       5. default               → false
--   - Storage is the rules; evaluation is application-side so the same
--     row can drive every runtime (Next.js Server Components, workers,
--     edge middleware). Swapping to GrowthBook later replaces the
--     evaluator import, not the storage.
--   - RLS: service-role only. Admin cpanel writes via Server Actions
--     that run with the service client + step-up gate; web app reads
--     via a single batched SDK call also using the service client
--     (Phase 1.0-C6 — RLS-aware reads land Phase 1.1+ when we move
--     evaluation to an edge function).
--   - Audit-trail: every mutation logs to `audit_log` with
--     resource_type='feature_flag' and action in
--     {feature_flag.created, feature_flag.updated, feature_flag.deleted}.
--     We do NOT write a trigger for this because the Server Action
--     already calls `logAuditEvent()` with the right actor identity
--     (the trigger would only see service-role and lose the admin
--     user_id).
-- Idempotent: every CREATE / ALTER uses IF NOT EXISTS / OR REPLACE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- feature_flags — one row per flag key
-- ---------------------------------------------------------------------------
-- key:                    stable identifier; what the evaluator looks up.
-- enabled_globally:       master kill / launch switch (overridden by rollout
--                         when rollout_percentage > 0).
-- rollout_percentage:     0-100; deterministic per-tenant bucket via
--                         sha256(tenant_id || ':' || key) % 100.
-- enabled_for_tenants:    explicit allowlist of tenant uuids (takes
--                         precedence over rollout + global).
-- disabled_for_tenants:   explicit denylist (HIGHEST precedence — used for
--                         emergency carve-outs when a flag misbehaves for
--                         a single tenant).
-- description:            human-readable purpose (renders in admin cpanel).
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flags (
    key                     text primary key
        check (
            length(key) between 1 and 128
            and key ~ '^[a-z][a-z0-9_]*$'
        ),
    description             text,
    enabled_globally        boolean not null default false,
    rollout_percentage      integer not null default 0
        check (rollout_percentage between 0 and 100),
    enabled_for_tenants     uuid[] not null default '{}',
    disabled_for_tenants    uuid[] not null default '{}',
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

comment on table  public.feature_flags is
    'Self-hosted feature flag store. PRD §3.2 / Phase 1.0-C6. Evaluator in @autonomux/flags.';
comment on column public.feature_flags.key is
    'Stable flag identifier — lowercase snake_case. Matches evaluateFlag(key) arg.';
comment on column public.feature_flags.rollout_percentage is
    '0-100. Deterministic per-tenant bucket: sha256(tenant_id||":"||key) %% 100 < pct.';
comment on column public.feature_flags.enabled_for_tenants is
    'Explicit allowlist; overrides rollout + global. Use for closed beta cohorts.';
comment on column public.feature_flags.disabled_for_tenants is
    'Explicit denylist; HIGHEST precedence. Use for emergency per-tenant carve-outs.';

-- ---------------------------------------------------------------------------
-- updated_at touch trigger (re-uses public.touch_updated_at from 0001).
-- ---------------------------------------------------------------------------
drop trigger if exists trg_feature_flags_touch_updated_at on public.feature_flags;
create trigger trg_feature_flags_touch_updated_at
    before update on public.feature_flags
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — service-role only.
-- ---------------------------------------------------------------------------
-- Admin Server Actions call via the service client (the admin cpanel sits
-- behind the admin-only gate + step-up). The web app reads via the same
-- service client because (a) flag rows carry no PII, (b) the evaluator
-- needs to see the denylist/allowlist arrays for ALL tenants in one query,
-- (c) we want the read path to be a single round-trip + an in-process
-- LRU cache. There is no `authenticated` policy on this table.
-- ---------------------------------------------------------------------------
alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;

drop policy if exists feature_flags_service_all on public.feature_flags;
create policy feature_flags_service_all on public.feature_flags
    as permissive for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Seed (dev-only, commented). Uncomment in local dev to bootstrap the
-- console; production seeds via the admin "Create flag" dialog.
-- ---------------------------------------------------------------------------
-- insert into public.feature_flags (key, description, enabled_globally, rollout_percentage)
-- values
--     ('experimental_oracle_v2',     'Oracle sub-agent v2 — astrology + market signals fused', false, 0),
--     ('morning_briefing_v2_layout', 'Morning briefing layout v2 — split cards + voice CTA',   false, 0),
--     ('companion_voice_picker',     'Companion nudge voice-picker drawer (TTS preview)',      false, 0),
--     ('scribe_substack_publish',    'Scribe → Substack publish flow (vs draft-only)',         false, 0)
-- on conflict (key) do nothing;

-- End 0006_feature_flags.sql
-- ============================================================================
-- autonomux · 0007_gdpr.sql · Phase 1.0-C7 + C8
-- Owner: [Atlas + Comply]
-- GDPR Article 20 (data portability) + Article 17 (right to erasure).
--
-- Surfaces:
--   - User: Settings → Data (Export my data, Delete my account)
--   - Admin: cpanel → Compliance (initiate on behalf of tenant for support)
--
-- Design:
--   - One row per GDPR request in `gdpr_requests`.
--   - `kind` discriminator: 'export' | 'deletion'.
--   - State machine: pending → processing → (completed|failed|cancelled|expired).
--   - Export downloads expire 30d after completion. Signed Supabase Storage URL
--     in `download_url`; bucket `gdpr-exports` is private (RLS off the bucket).
--   - Deletion is a 30-day soft-delete grace period; a delayed BullMQ job does
--     the hard delete at T+30d. Cancellation within the window clears
--     `tenants.deleted_at` and removes the delayed job.
--   - Admin-initiated requests record `admin_actor_user_id` so the audit log
--     is unambiguous about who pulled the trigger.
--   - tenant_id NULLABLE: after a deletion completes, the tenants row is gone
--     but the gdpr_requests row (and its audit_log siblings) survive to satisfy
--     PRD §8.3 7-year retention — required for subpoena response.
--
-- Audit:
--   - Trigger writes audit_log rows on insert + status transitions.
--   - Status transitions audit: pending → processing → completed/failed/cancelled.
--   - Audit trigger is security definer to bypass RLS for the audit insert.
--
-- RLS:
--   - User reads own requests (gdpr_requests.user_id = auth.uid()).
--   - Service-role bypass for the worker.
--   - Admin SELECT to read all (compliance cpanel).
--   - No client-side INSERT/UPDATE/DELETE — all writes via service-role
--     (Server Actions + worker).
--
-- Idempotent: every CREATE uses IF NOT EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. gdpr_requests — one row per export or deletion request
-- ---------------------------------------------------------------------------
-- bullmq_job_id: BullMQ jobId of the (delayed) follow-up job. For deletion
--                requests this is the T+30d hard-delete job so we can cancel
--                it by id from /api/gdpr/cancel-deletion.
-- ---------------------------------------------------------------------------
create table if not exists public.gdpr_requests (
    id                      uuid primary key default gen_random_uuid(),
    tenant_id               uuid references public.tenants(id) on delete set null,
    user_id                 uuid not null references auth.users(id) on delete set null,
    kind                    text not null
        check (kind in ('export', 'deletion')),
    status                  text not null default 'pending'
        check (status in (
            'pending', 'processing', 'completed', 'failed', 'expired', 'cancelled'
        )),
    admin_actor_user_id     uuid references auth.users(id) on delete set null,
    bullmq_job_id           text,
    download_url            text,
    download_storage_path   text,
    failure_reason          text,
    requested_at            timestamptz not null default now(),
    started_at              timestamptz,
    completed_at            timestamptz,
    expires_at              timestamptz,
    cancelled_at            timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

comment on table public.gdpr_requests is
    'GDPR Art. 20 export + Art. 17 deletion requests. tenant_id NULLABLE — survives hard-delete to satisfy 7yr audit retention (PRD §8.3).';
comment on column public.gdpr_requests.bullmq_job_id is
    'BullMQ jobId of the delayed hard-delete job (deletion kind). Used to cancel during 30-day grace.';
comment on column public.gdpr_requests.download_url is
    'Signed Supabase Storage URL. Null until status=completed. Expires per expires_at (30d).';

create index if not exists gdpr_requests_user_idx        on public.gdpr_requests(user_id, requested_at desc);
create index if not exists gdpr_requests_tenant_idx      on public.gdpr_requests(tenant_id, requested_at desc);
create index if not exists gdpr_requests_status_idx      on public.gdpr_requests(status) where status in ('pending', 'processing');
create index if not exists gdpr_requests_kind_status_idx on public.gdpr_requests(kind, status);

-- ---------------------------------------------------------------------------
-- updated_at touch trigger (re-uses public.touch_updated_at from 0001)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_gdpr_requests_touch_updated_at on public.gdpr_requests;
create trigger trg_gdpr_requests_touch_updated_at
    before update on public.gdpr_requests
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — users see own requests; service-role bypass; admin SELECT
-- ---------------------------------------------------------------------------
alter table public.gdpr_requests enable row level security;
alter table public.gdpr_requests force row level security;

drop policy if exists gdpr_requests_service_all on public.gdpr_requests;
create policy gdpr_requests_service_all on public.gdpr_requests
    as permissive for all to service_role using (true) with check (true);

drop policy if exists gdpr_requests_user_select on public.gdpr_requests;
create policy gdpr_requests_user_select on public.gdpr_requests
    as permissive for select to authenticated
    using (user_id = auth.uid());

drop policy if exists gdpr_requests_admin_select on public.gdpr_requests;
create policy gdpr_requests_admin_select on public.gdpr_requests
    as permissive for select to authenticated
    using (public.is_admin());

-- No INSERT/UPDATE/DELETE policy for authenticated — service-role only.

-- ---------------------------------------------------------------------------
-- Audit trigger — INSERT + status transitions write to audit_log
-- ---------------------------------------------------------------------------
-- Action labels (stable strings the worker + cpanel filter on):
--   gdpr.export.requested   — INSERT, kind=export
--   gdpr.export.started     — UPDATE, status pending->processing
--   gdpr.export.completed   — UPDATE, status processing->completed
--   gdpr.export.failed      — UPDATE, status processing->failed
--   gdpr.deletion.requested — INSERT, kind=deletion
--   gdpr.deletion.soft_deleted — UPDATE, status processing->completed (soft-delete done)
--   gdpr.deletion.hard_deleted — emitted by worker directly (the row may be
--                                  gone by the time we hard-delete the tenant;
--                                  we write a survivor row before purging).
--   gdpr.deletion.cancelled — UPDATE, status pending|processing->cancelled
-- ---------------------------------------------------------------------------
create or replace function public.audit_gdpr_request_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    actor_user uuid;
    actor_kind_resolved text;
    action_label text;
    meta jsonb;
begin
    begin
        actor_user := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
    exception when others then
        actor_user := null;
    end;
    actor_kind_resolved := case
        when new.admin_actor_user_id is not null then 'admin'
        when actor_user is not null then 'user'
        else 'service'
    end;

    if tg_op = 'INSERT' then
        action_label := case new.kind
            when 'export' then 'gdpr.export.requested'
            when 'deletion' then 'gdpr.deletion.requested'
        end;
        meta := jsonb_build_object(
            'request_id', new.id,
            'kind', new.kind,
            'admin_initiated', new.admin_actor_user_id is not null
        );
        insert into public.audit_log (
            tenant_id, actor_user_id, actor_kind,
            action, resource_type, resource_id, metadata
        ) values (
            new.tenant_id,
            coalesce(new.admin_actor_user_id, actor_user, new.user_id),
            actor_kind_resolved,
            action_label, 'gdpr_request', new.id::text, meta
        );
        return new;
    end if;

    if tg_op = 'UPDATE' then
        -- Only audit on status transitions.
        if old.status is distinct from new.status then
            action_label := case
                when new.kind = 'export' and new.status = 'processing'  then 'gdpr.export.started'
                when new.kind = 'export' and new.status = 'completed'   then 'gdpr.export.completed'
                when new.kind = 'export' and new.status = 'failed'      then 'gdpr.export.failed'
                when new.kind = 'export' and new.status = 'cancelled'   then 'gdpr.export.cancelled'
                when new.kind = 'export' and new.status = 'expired'     then 'gdpr.export.expired'
                when new.kind = 'deletion' and new.status = 'processing' then 'gdpr.deletion.started'
                when new.kind = 'deletion' and new.status = 'completed'  then 'gdpr.deletion.soft_deleted'
                when new.kind = 'deletion' and new.status = 'failed'     then 'gdpr.deletion.failed'
                when new.kind = 'deletion' and new.status = 'cancelled'  then 'gdpr.deletion.cancelled'
                else 'gdpr.request.status_change'
            end;
            meta := jsonb_build_object(
                'request_id', new.id,
                'kind', new.kind,
                'from_status', old.status,
                'to_status', new.status,
                'failure_reason', coalesce(new.failure_reason, null)
            );
            insert into public.audit_log (
                tenant_id, actor_user_id, actor_kind,
                action, resource_type, resource_id, metadata
            ) values (
                new.tenant_id,
                coalesce(new.admin_actor_user_id, actor_user, new.user_id),
                actor_kind_resolved,
                action_label, 'gdpr_request', new.id::text, meta
            );
        end if;
        return new;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_gdpr_requests_audit_insert on public.gdpr_requests;
create trigger trg_gdpr_requests_audit_insert
    after insert on public.gdpr_requests
    for each row execute function public.audit_gdpr_request_change();

drop trigger if exists trg_gdpr_requests_audit_update on public.gdpr_requests;
create trigger trg_gdpr_requests_audit_update
    after update on public.gdpr_requests
    for each row execute function public.audit_gdpr_request_change();

-- End 0007_gdpr.sql
