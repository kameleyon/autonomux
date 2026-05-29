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
