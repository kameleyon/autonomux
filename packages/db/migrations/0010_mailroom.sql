-- ============================================================================
-- autonomux · 0010_mailroom.sql · Sprint D · §2
-- Owner: [Atlas + Forge]
-- Mailroom cache: rolling 7d of triaged Gmail messages.
--
-- Why a cache table:
--   - Avoid re-calling Haiku on every chat-thread that asks "what's in my inbox?".
--   - Surface "what changed since X" in the AlterEgo briefing without re-fetching
--     the same messages from Gmail.
--   - Single source of truth for proposed_action so the chat UI's approve/dismiss
--     buttons enqueue the right write job.
--
-- Conventions:
--   - tenant_id FK ON DELETE CASCADE (mirrors mailroom_rules 0001 §10).
--   - Soft-delete via `processed_at` going stale is the eviction signal — a sweep
--     job in a later sprint trims rows older than 7 days.
--   - importance smallint: 0 (junk) .. 5 (must-read). Mirrors engine output.
--   - proposed_action text + CHECK — same vocabulary as mailroom_rules.then.action
--     plus 'keep_inbox' (neutral default when nothing else fits).
--
-- Idempotent: every CREATE uses IF NOT EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. mailroom_messages — cache of recent triaged Gmail messages
-- ---------------------------------------------------------------------------
create table if not exists public.mailroom_messages (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references public.tenants(id) on delete cascade,
    gmail_msg_id        text not null,
    gmail_thread_id     text,
    sender              text not null,
    subject             text not null,
    snippet             text not null default '',
    received_at         timestamptz not null,
    importance          smallint not null default 0
        check (importance between 0 and 5),
    proposed_action     text not null default 'keep_inbox'
        check (proposed_action in ('reply', 'archive', 'snooze', 'keep_inbox')),
    reason              text not null default '',
    processed_at        timestamptz not null default now(),
    created_at          timestamptz not null default now(),
    unique (tenant_id, gmail_msg_id)
);

comment on table public.mailroom_messages is
    'Rolling 7d cache of Gmail messages after Mailroom triage. One row per (tenant, gmail_msg_id).';
comment on column public.mailroom_messages.importance is
    '0..5 importance score from rule eval + Haiku ranking. 0 = junk, 5 = must-read.';
comment on column public.mailroom_messages.proposed_action is
    'Action suggested to the user via the SubAgentCard. Approve enqueues a write job.';

create index if not exists mailroom_messages_tenant_received_idx
    on public.mailroom_messages(tenant_id, received_at desc);

create index if not exists mailroom_messages_tenant_processed_idx
    on public.mailroom_messages(tenant_id, processed_at desc);

-- ---------------------------------------------------------------------------
-- RLS — mirror existing tenant-scoped pattern (0002_rls.sql do$$ block).
-- 0002 hand-rolled five policies per table; we do the same statically here.
-- ---------------------------------------------------------------------------
alter table public.mailroom_messages enable row level security;
alter table public.mailroom_messages force row level security;

drop policy if exists mailroom_messages_service_all on public.mailroom_messages;
create policy mailroom_messages_service_all on public.mailroom_messages
    as permissive for all to service_role
    using (true) with check (true);

drop policy if exists mailroom_messages_tenant_select on public.mailroom_messages;
create policy mailroom_messages_tenant_select on public.mailroom_messages
    as permissive for select to authenticated
    using (tenant_id = public.current_tenant_id());

drop policy if exists mailroom_messages_tenant_insert on public.mailroom_messages;
create policy mailroom_messages_tenant_insert on public.mailroom_messages
    as permissive for insert to authenticated
    with check (tenant_id = public.current_tenant_id());

drop policy if exists mailroom_messages_tenant_update on public.mailroom_messages;
create policy mailroom_messages_tenant_update on public.mailroom_messages
    as permissive for update to authenticated
    using (tenant_id = public.current_tenant_id())
    with check (tenant_id = public.current_tenant_id());

drop policy if exists mailroom_messages_tenant_delete on public.mailroom_messages;
create policy mailroom_messages_tenant_delete on public.mailroom_messages
    as permissive for delete to authenticated
    using (tenant_id = public.current_tenant_id());

-- End 0010_mailroom.sql
