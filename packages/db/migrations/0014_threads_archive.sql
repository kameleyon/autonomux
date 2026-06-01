-- ============================================================================
-- autonomux · 0014_threads_archive.sql · Phase 1.1-D follow-up
-- Owner: [Atlas]
-- Soft-archive for chat_threads so users can declutter without losing history.
-- archived_at = NULL means active; non-NULL = archived (hidden by default).
-- Cascade unaffected — deleting a thread still removes its messages via the
-- existing FK from 0009_orchestrator.sql.
-- ============================================================================

alter table public.chat_threads
    add column if not exists archived_at timestamptz;

create index if not exists chat_threads_tenant_active_idx
    on public.chat_threads(tenant_id, last_message_at desc nulls last)
    where archived_at is null;

create index if not exists chat_threads_tenant_archived_idx
    on public.chat_threads(tenant_id, archived_at desc)
    where archived_at is not null;

comment on column public.chat_threads.archived_at is
    'When the thread was archived. NULL = active (default). Archived threads are hidden from the main list but remain readable + can be unarchived.';

-- End 0014_threads_archive.sql
