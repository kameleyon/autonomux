-- ============================================================================
-- autonomux · 0009_orchestrator.sql · Sprint D §1
-- Owner: [Atlas + Forge]
-- AlterEgo orchestrator persistence:
--   - agent_runs.request_id (idempotency on retry)
--   - agent_runs.parent_run_id (chat-thread linkage)
--   - agent_memory_episodes.chat_thread_id (scoped recall)
--   - chat_threads + chat_messages (durable chat surface for /app/chat)
-- All CREATEs use IF NOT EXISTS per project convention (see 0001..0008).
-- RLS posture mirrors 0002_rls.sql tenant-scoped pattern.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. agent_runs additions
-- ---------------------------------------------------------------------------
-- request_id: per-chat-turn idempotency key. Same value on retry = same row,
--             so the orchestrator can replay prior tools_called instead of
--             re-running the LLM (Sprint D §1 acceptance #3).
-- parent_run_id: optional chain link to a prior run (chat-thread context).
-- ---------------------------------------------------------------------------
alter table public.agent_runs
    add column if not exists request_id text;
alter table public.agent_runs
    add column if not exists parent_run_id uuid
        references public.agent_runs(id) on delete set null;

create unique index if not exists agent_runs_request_id_uidx
    on public.agent_runs(request_id)
    where request_id is not null;

create index if not exists agent_runs_parent_run_idx
    on public.agent_runs(parent_run_id)
    where parent_run_id is not null;

comment on column public.agent_runs.request_id is
    'Idempotency key. Same value on retry = same row (orchestrator replays prior result).';
comment on column public.agent_runs.parent_run_id is
    'Optional chain link to a prior run (chat-thread context).';

-- ---------------------------------------------------------------------------
-- 2. agent_memory_episodes — add chat_thread_id for thread-scoped recall
-- ---------------------------------------------------------------------------
-- Null = global (not bound to a thread). Foreign key to chat_threads is set
-- AFTER the chat_threads table is created (see section 3).
-- ---------------------------------------------------------------------------
alter table public.agent_memory_episodes
    add column if not exists chat_thread_id uuid;

create index if not exists agent_memory_episodes_chat_thread_idx
    on public.agent_memory_episodes(chat_thread_id, created_at desc)
    where chat_thread_id is not null;

-- ---------------------------------------------------------------------------
-- 3. chat_threads
-- ---------------------------------------------------------------------------
-- One row per persisted conversation. `last_message_at` mirrored from
-- the latest chat_messages.created_at for cheap "recent threads" ordering.
-- ---------------------------------------------------------------------------
create table if not exists public.chat_threads (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references public.tenants(id) on delete cascade,
    user_id         uuid not null references auth.users(id)     on delete cascade,
    title           text not null default 'New conversation',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    last_message_at timestamptz not null default now()
);

create index if not exists chat_threads_tenant_idx
    on public.chat_threads(tenant_id, last_message_at desc);
create index if not exists chat_threads_user_idx
    on public.chat_threads(user_id, last_message_at desc);

comment on table public.chat_threads is
    'Persisted /app/chat conversations. Tenant-scoped RLS.';

-- Now that chat_threads exists we can add the soft FK on
-- agent_memory_episodes.chat_thread_id. Soft (no cascade) because GDPR
-- delete of a thread should not orphan memory; memory is hard-deleted
-- by the tenant cascade in 0001.
alter table public.agent_memory_episodes
    drop constraint if exists agent_memory_episodes_chat_thread_id_fkey;
alter table public.agent_memory_episodes
    add constraint agent_memory_episodes_chat_thread_id_fkey
        foreign key (chat_thread_id) references public.chat_threads(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. chat_messages
-- ---------------------------------------------------------------------------
-- One row per user/assistant/tool message.
-- content_blocks: Anthropic-shaped ContentBlock[] (jsonb) so we can
--                 round-trip tool_use + tool_result + text without lossy
--                 conversion.
-- agent_run_id:   optional link to the agent_runs row that produced
--                 this message (null for user-authored messages).
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
    id              uuid primary key default gen_random_uuid(),
    thread_id       uuid not null references public.chat_threads(id) on delete cascade,
    tenant_id       uuid not null references public.tenants(id)      on delete cascade,
    role            text not null
        check (role in ('user', 'assistant', 'system', 'tool')),
    content_blocks  jsonb not null default '[]'::jsonb,
    agent_run_id    uuid references public.agent_runs(id) on delete set null,
    created_at      timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx
    on public.chat_messages(thread_id, created_at);
create index if not exists chat_messages_tenant_idx
    on public.chat_messages(tenant_id, created_at desc);
create index if not exists chat_messages_agent_run_idx
    on public.chat_messages(agent_run_id) where agent_run_id is not null;

comment on table public.chat_messages is
    'Chat-turn messages. Tenant-scoped RLS. Anthropic-shaped content_blocks jsonb.';

-- ---------------------------------------------------------------------------
-- 5. updated_at trigger on chat_threads
-- ---------------------------------------------------------------------------
-- Mirror the 0001 pattern: drop-then-create so re-runs are idempotent.
-- public.touch_updated_at() is defined in 0001_init.sql.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_chat_threads_touch_updated_at on public.chat_threads;
create trigger trg_chat_threads_touch_updated_at
    before update on public.chat_threads
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. RLS on chat_threads + chat_messages
-- ---------------------------------------------------------------------------
-- Mirror the tenant-scoped pattern from 0002_rls.sql:
--   <table>_service_all       — service_role bypass (all ops)
--   <table>_tenant_select     — authenticated, tenant_id = current_tenant_id()
--   <table>_tenant_insert     — with-check tenant match
--   <table>_tenant_update
--   <table>_tenant_delete
-- ---------------------------------------------------------------------------
alter table public.chat_threads  enable row level security;
alter table public.chat_threads  force  row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_messages force  row level security;

do $$
declare
    t text;
    tables text[] := array['chat_threads', 'chat_messages'];
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
-- 7. pgvector RPC for episodic recall
-- ---------------------------------------------------------------------------
-- The orchestrator's `recallEpisodes()` calls this RPC. Cosine distance via
-- pgvector's `<=>` operator (returns distance in [0,2]; similarity = 1 - d/2
-- for unit-norm vectors, but for ranking only the distance is needed — we
-- return `1 - (embedding <=> query)` clipped to [0,1] for ergonomic scoring).
-- Optional `p_chat_thread_id` filters to a single thread (null = all).
-- ---------------------------------------------------------------------------
create or replace function public.match_agent_memory_episodes(
    p_tenant_id uuid,
    p_query vector(1536),
    p_k integer default 5,
    p_chat_thread_id uuid default null
)
returns table (
    id uuid,
    content_summary text,
    metadata jsonb,
    created_at timestamptz,
    similarity double precision
)
language sql
stable
security definer
set search_path = public
as $$
    select
        e.id,
        e.content_summary,
        e.metadata,
        e.created_at,
        greatest(0.0::double precision,
                 1.0::double precision - (e.embedding <=> p_query))::double precision as similarity
    from public.agent_memory_episodes e
    where e.tenant_id = p_tenant_id
      and e.embedding is not null
      and (p_chat_thread_id is null or e.chat_thread_id = p_chat_thread_id)
    order by e.embedding <=> p_query
    limit greatest(1, least(coalesce(p_k, 5), 50));
$$;

grant execute on function public.match_agent_memory_episodes(uuid, vector, integer, uuid)
    to authenticated, service_role;

-- End 0009_orchestrator.sql
