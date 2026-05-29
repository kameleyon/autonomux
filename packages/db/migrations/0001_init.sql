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
    word_count  integer generated always as (array_length(regexp_split_to_array(content, '\s+'), 1)) stored,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists scribe_voice_samples_tenant_idx on public.scribe_voice_samples(tenant_id);

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
