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
