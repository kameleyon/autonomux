-- ============================================================================
-- autonomux · 0013_scheduler.sql · Phase 1.1-C
-- Owner: [Atlas + Forge]
-- Scheduler cache: rolling window of triaged Google Calendar events.
--
-- Why a cache table:
--   - Avoid re-calling the Calendar API on every chat-thread that asks
--     "what's on my schedule?".
--   - Surface "what changed since X" in the AlterEgo briefing without
--     re-fetching the same events.
--   - Single source of truth for conflict detection so the chat UI's
--     approve/dismiss buttons enqueue the right write job.
--
-- Conventions:
--   - tenant_id FK ON DELETE CASCADE (mirrors mailroom_messages 0010 §1).
--   - Soft-delete via `processed_at` going stale is the eviction signal — a
--     sweep job trims rows older than the working window.
--   - status text + CHECK — Google's three terminal states.
--   - conflict_with: jsonb array of overlapping gcal_event_id strings, so the
--     UI can render "conflicts with X and Y" without a self-join.
--
-- sub_agent_runs.sub_agent_name CHECK already includes 'scheduler'
-- (see 0001_init.sql §7) — no constraint extension required there.
--
-- connected_accounts.integration CHECK in 0001_init.sql §8 lists
-- 'google_calendar' but the Scheduler contract uses the short alias 'gcal'
-- (matches Cipher purpose 'oauth.gcal' and the /auth/oauth/gcal/* routes).
-- We extend the CHECK below to additionally allow 'gcal'.
--
-- Idempotent: every CREATE uses IF NOT EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. connected_accounts.integration CHECK — add 'gcal'
-- ---------------------------------------------------------------------------
-- The original CHECK was defined inline at table-creation time in 0001 and
-- therefore got the auto-generated name `connected_accounts_integration_check`.
-- We drop-if-exists then re-add so this migration is re-runnable.
-- ---------------------------------------------------------------------------
alter table public.connected_accounts
    drop constraint if exists connected_accounts_integration_check;
alter table public.connected_accounts
    add constraint connected_accounts_integration_check
        check (integration in (
            'gmail', 'outlook', 'google_calendar', 'gcal', 'substack',
            'x', 'linkedin', 'youtube', 'plaid', 'astrology'
        ));

-- ---------------------------------------------------------------------------
-- 1. scheduler_events — cache of recent triaged Google Calendar events
-- ---------------------------------------------------------------------------
create table if not exists public.scheduler_events (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references public.tenants(id) on delete cascade,
    gcal_event_id       text not null,
    gcal_calendar_id    text not null default 'primary',
    summary             text not null default '',
    description         text,
    location            text,
    start_at            timestamptz not null,
    end_at              timestamptz not null,
    is_all_day          boolean not null default false,
    status              text not null default 'confirmed'
        check (status in ('confirmed','tentative','cancelled')),
    organizer_email     text,
    is_self_organizer   boolean not null default false,
    attendee_count      smallint not null default 0,
    has_conflict        boolean not null default false,
    conflict_with       jsonb not null default '[]'::jsonb,
    html_link           text,
    processed_at        timestamptz not null default now(),
    created_at          timestamptz not null default now(),
    unique (tenant_id, gcal_calendar_id, gcal_event_id)
);

comment on table public.scheduler_events is
    'Rolling cache of Google Calendar events after Scheduler triage. One row per (tenant, gcal_calendar_id, gcal_event_id).';
comment on column public.scheduler_events.gcal_event_id is
    'Google Calendar event id. Stable across updates from the same calendar.';
comment on column public.scheduler_events.gcal_calendar_id is
    'Source calendar id (defaults to ''primary''). Part of the uniqueness key so multi-calendar tenants do not collide.';
comment on column public.scheduler_events.status is
    'Google event status: confirmed | tentative | cancelled.';
comment on column public.scheduler_events.has_conflict is
    'True if this event overlaps another event for the same tenant. Set by the Scheduler worker on triage.';
comment on column public.scheduler_events.conflict_with is
    'JSON array of gcal_event_id strings this event overlaps. Empty array when has_conflict = false.';

create index if not exists scheduler_events_tenant_start_idx
    on public.scheduler_events(tenant_id, start_at desc);

create index if not exists scheduler_events_tenant_conflict_idx
    on public.scheduler_events(tenant_id, has_conflict)
    where has_conflict = true;

-- ---------------------------------------------------------------------------
-- RLS — mirror existing tenant-scoped pattern (0002_rls.sql do$$ block).
-- 0010 hand-rolled five policies per table; we do the same statically here.
-- ---------------------------------------------------------------------------
alter table public.scheduler_events enable row level security;
alter table public.scheduler_events force row level security;

drop policy if exists scheduler_events_service_all on public.scheduler_events;
create policy scheduler_events_service_all on public.scheduler_events
    as permissive for all to service_role
    using (true) with check (true);

drop policy if exists scheduler_events_tenant_select on public.scheduler_events;
create policy scheduler_events_tenant_select on public.scheduler_events
    as permissive for select to authenticated
    using (tenant_id = public.current_tenant_id());

drop policy if exists scheduler_events_tenant_insert on public.scheduler_events;
create policy scheduler_events_tenant_insert on public.scheduler_events
    as permissive for insert to authenticated
    with check (tenant_id = public.current_tenant_id());

drop policy if exists scheduler_events_tenant_update on public.scheduler_events;
create policy scheduler_events_tenant_update on public.scheduler_events
    as permissive for update to authenticated
    using (tenant_id = public.current_tenant_id())
    with check (tenant_id = public.current_tenant_id());

drop policy if exists scheduler_events_tenant_delete on public.scheduler_events;
create policy scheduler_events_tenant_delete on public.scheduler_events
    as permissive for delete to authenticated
    using (tenant_id = public.current_tenant_id());

-- End 0013_scheduler.sql
