-- ---------------------------------------------------------------------------
-- 0008_access_token_hook.sql
-- ---------------------------------------------------------------------------
-- Supabase Auth "Custom Access Token Hook" — inject tenant_id into the JWT.
--
-- Why this exists:
--   Our RLS policies (0002_rls.sql) read `tenant_id` from `auth.jwt()`. The
--   default Supabase JWT does NOT include tenant_id — the hook below looks
--   it up from `public.tenant_members` and stamps it onto every access
--   token Supabase Auth issues. Without this hook, every authed page that
--   calls `requireTenantId()` throws TenantMissingError (PRD §7.1).
--
-- Activation requires TWO steps:
--   1. This migration creates + grants the function (handled here).
--   2. Operator must select it in Supabase dashboard →
--      Authentication → Hooks → "Custom Access Token Hook" →
--      Postgres → `public.custom_access_token_hook`.
--   (Supabase auth hook registration is dashboard-only; no DDL surface.)
--
-- Owner: [Forge + Shield + Atlas]
-- ---------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    claims jsonb;
    tid uuid;
    uid uuid;
begin
    -- Supabase passes event = { user_id, claims, ... }
    uid := nullif(event->>'user_id', '')::uuid;
    if uid is null then
        return event;
    end if;

    claims := coalesce(event->'claims', '{}'::jsonb);

    -- Look up the user's primary tenant. A user with multiple memberships
    -- gets the most-recently-created one (deterministic + supports
    -- "switch tenant" UX later by changing this query).
    select tm.tenant_id into tid
    from public.tenant_members tm
    where tm.user_id = uid
    order by tm.created_at desc
    limit 1;

    if tid is not null then
        -- Top-level claim (used by RLS via `auth.jwt() ->> 'tenant_id'`).
        claims := jsonb_set(claims, '{tenant_id}', to_jsonb(tid::text));
        -- Also mirror into app_metadata for clients that read it there.
        if claims ? 'app_metadata' then
            claims := jsonb_set(
                claims,
                '{app_metadata,tenant_id}',
                to_jsonb(tid::text),
                true
            );
        else
            claims := jsonb_set(
                claims,
                '{app_metadata}',
                jsonb_build_object('tenant_id', tid::text),
                true
            );
        end if;
    end if;

    event := jsonb_set(event, '{claims}', claims);
    return event;
end;
$$;

-- Supabase Auth runs hooks as the `supabase_auth_admin` role.
grant execute on function public.custom_access_token_hook(jsonb)
    to supabase_auth_admin;

grant usage on schema public to supabase_auth_admin;

-- Hook needs to read tenant_members. RLS would block supabase_auth_admin
-- without an explicit grant; use a narrow grant on just the columns the
-- hook touches.
grant select (user_id, tenant_id, created_at)
    on public.tenant_members
    to supabase_auth_admin;
