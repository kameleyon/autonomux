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
