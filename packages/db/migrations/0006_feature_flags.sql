-- ============================================================================
-- autonomux · 0006_feature_flags.sql · Phase 1.0-C6
-- Owner: [Lens + Forge]
-- Self-hosted minimum feature flags store. PRD §3.2 admin cpanel row
-- "Feature flags · GrowthBook console · % rollouts · per-tenant overrides".
--
-- Design:
--   - One row per flag, keyed by stable string `key` (matches the
--     evaluator's `evaluateFlag(key)` argument).
--   - Rule precedence (enforced in evaluator, NOT in SQL):
--       1. disabled_for_tenants  → false (denylist wins)
--       2. enabled_for_tenants   → true  (explicit allow)
--       3. rollout_percentage    → true iff hash(tenant_id||key) % 100 < pct
--       4. enabled_globally      → true
--       5. default               → false
--   - Storage is the rules; evaluation is application-side so the same
--     row can drive every runtime (Next.js Server Components, workers,
--     edge middleware). Swapping to GrowthBook later replaces the
--     evaluator import, not the storage.
--   - RLS: service-role only. Admin cpanel writes via Server Actions
--     that run with the service client + step-up gate; web app reads
--     via a single batched SDK call also using the service client
--     (Phase 1.0-C6 — RLS-aware reads land Phase 1.1+ when we move
--     evaluation to an edge function).
--   - Audit-trail: every mutation logs to `audit_log` with
--     resource_type='feature_flag' and action in
--     {feature_flag.created, feature_flag.updated, feature_flag.deleted}.
--     We do NOT write a trigger for this because the Server Action
--     already calls `logAuditEvent()` with the right actor identity
--     (the trigger would only see service-role and lose the admin
--     user_id).
-- Idempotent: every CREATE / ALTER uses IF NOT EXISTS / OR REPLACE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- feature_flags — one row per flag key
-- ---------------------------------------------------------------------------
-- key:                    stable identifier; what the evaluator looks up.
-- enabled_globally:       master kill / launch switch (overridden by rollout
--                         when rollout_percentage > 0).
-- rollout_percentage:     0-100; deterministic per-tenant bucket via
--                         sha256(tenant_id || ':' || key) % 100.
-- enabled_for_tenants:    explicit allowlist of tenant uuids (takes
--                         precedence over rollout + global).
-- disabled_for_tenants:   explicit denylist (HIGHEST precedence — used for
--                         emergency carve-outs when a flag misbehaves for
--                         a single tenant).
-- description:            human-readable purpose (renders in admin cpanel).
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flags (
    key                     text primary key
        check (
            length(key) between 1 and 128
            and key ~ '^[a-z][a-z0-9_]*$'
        ),
    description             text,
    enabled_globally        boolean not null default false,
    rollout_percentage      integer not null default 0
        check (rollout_percentage between 0 and 100),
    enabled_for_tenants     uuid[] not null default '{}',
    disabled_for_tenants    uuid[] not null default '{}',
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

comment on table  public.feature_flags is
    'Self-hosted feature flag store. PRD §3.2 / Phase 1.0-C6. Evaluator in @autonomux/flags.';
comment on column public.feature_flags.key is
    'Stable flag identifier — lowercase snake_case. Matches evaluateFlag(key) arg.';
comment on column public.feature_flags.rollout_percentage is
    '0-100. Deterministic per-tenant bucket: sha256(tenant_id||":"||key) %% 100 < pct.';
comment on column public.feature_flags.enabled_for_tenants is
    'Explicit allowlist; overrides rollout + global. Use for closed beta cohorts.';
comment on column public.feature_flags.disabled_for_tenants is
    'Explicit denylist; HIGHEST precedence. Use for emergency per-tenant carve-outs.';

-- ---------------------------------------------------------------------------
-- updated_at touch trigger (re-uses public.touch_updated_at from 0001).
-- ---------------------------------------------------------------------------
drop trigger if exists trg_feature_flags_touch_updated_at on public.feature_flags;
create trigger trg_feature_flags_touch_updated_at
    before update on public.feature_flags
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — service-role only.
-- ---------------------------------------------------------------------------
-- Admin Server Actions call via the service client (the admin cpanel sits
-- behind the admin-only gate + step-up). The web app reads via the same
-- service client because (a) flag rows carry no PII, (b) the evaluator
-- needs to see the denylist/allowlist arrays for ALL tenants in one query,
-- (c) we want the read path to be a single round-trip + an in-process
-- LRU cache. There is no `authenticated` policy on this table.
-- ---------------------------------------------------------------------------
alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;

drop policy if exists feature_flags_service_all on public.feature_flags;
create policy feature_flags_service_all on public.feature_flags
    as permissive for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Seed (dev-only, commented). Uncomment in local dev to bootstrap the
-- console; production seeds via the admin "Create flag" dialog.
-- ---------------------------------------------------------------------------
-- insert into public.feature_flags (key, description, enabled_globally, rollout_percentage)
-- values
--     ('experimental_oracle_v2',     'Oracle sub-agent v2 — astrology + market signals fused', false, 0),
--     ('morning_briefing_v2_layout', 'Morning briefing layout v2 — split cards + voice CTA',   false, 0),
--     ('companion_voice_picker',     'Companion nudge voice-picker drawer (TTS preview)',      false, 0),
--     ('scribe_substack_publish',    'Scribe → Substack publish flow (vs draft-only)',         false, 0)
-- on conflict (key) do nothing;

-- End 0006_feature_flags.sql
