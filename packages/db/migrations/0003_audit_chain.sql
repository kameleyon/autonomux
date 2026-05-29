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
