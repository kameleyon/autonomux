-- ============================================================================
-- autonomux · 0012_cardology_and_astro.sql · Sprint E §1
-- Owner: [Atlas + Oracle]
--
-- Cardology reference tables (global, read-only) + per-tenant astrology
-- birth-chart storage (PII, RLS-protected).
--
-- Two halves:
--   A) Cardology — six tables holding the canonical 53-card system used
--      by @autonomux/cardology. Same data for every tenant; we grant
--      SELECT to authenticated + anon and skip RLS entirely so the
--      worker can query without minting tenant JWTs.
--
--   B) Astrology — three tenant-scoped tables for user birth charts:
--      `astro_birth_charts` (the header row, with PII like place + time)
--      `astro_planet_positions` (10 rows per chart)
--      `astro_aspects` (0..N rows per chart)
--      All three carry RLS via tenant_id (direct or via parent FK), same
--      shape as the do$$ block in 0002_rls.sql.
--
-- Idempotent: every CREATE uses IF NOT EXISTS. Seed lives in
-- scripts/seed-cardology.ts (must be re-runnable; on conflict do update).
-- ============================================================================

-- ============================================================================
-- A. CARDOLOGY REFERENCE TABLES (global, read-only)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A.1 cardology_cards — the 53 cards (52 standard + Joker)
-- ---------------------------------------------------------------------------
-- `id` is the solar value (1..52) for the standard deck and 53 for the
-- Joker. Keeping a small integer key (rather than the text card name)
-- makes the foreign keys + score table joins half the row width.
--
-- `ppps` is the PRIMARY classification. Dual-classification cards
-- (e.g. Ace of Clubs = PITCH + PUSH) carry the secondary in the
-- `cardology_card_dual_ppps` side table; the engine's Step-1 expansion
-- iterates both.
--
-- `planets` is the human-readable planetary pairing string (e.g.
-- "Sun/Saturn"). We don't enum or normalise it — the source format is
-- the canonical form and the engine treats it as a presentation label.
-- ---------------------------------------------------------------------------
create table if not exists public.cardology_cards (
    id              smallint primary key,
    name            text not null unique,
    suit            text not null
        check (suit in ('Hearts', 'Clubs', 'Diamonds', 'Spades', 'Joker')),
    rank            text not null,
    ppps            text not null
        check (ppps in ('PUSH', 'PITCH', 'PAUSE', 'SAVE')),
    intensity       text not null
        check (intensity in ('L', 'M', 'H')),
    planets         text not null,
    solar_value     smallint not null
        check (solar_value between 1 and 53)
);

comment on table  public.cardology_cards is
    'Canonical 53-card Sacred-Symbols deck. id = solar value (1..52); Joker = 53.';
comment on column public.cardology_cards.ppps is
    'Primary PUSH/PITCH/PAUSE/SAVE classification. Secondary (if any) in cardology_card_dual_ppps.';

-- ---------------------------------------------------------------------------
-- A.2 cardology_card_dual_ppps — secondary PPPS for dual-classified cards
-- ---------------------------------------------------------------------------
-- The engine's Step-1 expansion (engine.ts L214-L235) walks BOTH PPPS
-- values when a card carries a dual classification. Store the primary
-- on `cardology_cards.ppps` AND duplicate it here, so the seed script
-- can just dump `step1_dual_ppps` verbatim and a query
--   select ppps from cardology_card_dual_ppps where card_id = $1
-- returns the full list (primary + secondary) for that card.
-- ---------------------------------------------------------------------------
create table if not exists public.cardology_card_dual_ppps (
    card_id     smallint not null references public.cardology_cards(id) on delete cascade,
    ppps        text not null
        check (ppps in ('PUSH', 'PITCH', 'PAUSE', 'SAVE')),
    primary key (card_id, ppps)
);

-- ---------------------------------------------------------------------------
-- A.3 cardology_day_cards — one row per calendar day (MM-DD)
-- ---------------------------------------------------------------------------
-- 366 rows (leap-year complete). The MM-DD key is intentionally
-- year-agnostic — day cards repeat annually.
-- ---------------------------------------------------------------------------
create table if not exists public.cardology_day_cards (
    mmdd        text primary key
        check (mmdd ~ '^\d{2}-\d{2}$'),
    card_id     smallint not null references public.cardology_cards(id)
);

-- ---------------------------------------------------------------------------
-- A.4 cardology_weekly_calendar — Sunday-opening week → card
-- ---------------------------------------------------------------------------
-- One row per (year, week_number). 2026 ships 52 rows; later years are
-- seeded as we go.
-- ---------------------------------------------------------------------------
create table if not exists public.cardology_weekly_calendar (
    id              serial primary key,
    year            smallint not null,
    week_number     smallint not null,
    start_date      date not null,
    end_date        date not null,
    card_id         smallint not null references public.cardology_cards(id),
    unique (year, week_number)
);

create index if not exists cardology_weekly_calendar_start_idx
    on public.cardology_weekly_calendar(start_date);

-- ---------------------------------------------------------------------------
-- A.5 cardology_monthly_cards — monthly card per (year, month)
-- ---------------------------------------------------------------------------
-- The canonical autonomux2 data only has month-of-year mapping (no per-
-- year variation), so we use year=0 as the "all years" bucket. When a
-- future calendar surfaces with year-specific monthly cards, insert a
-- non-zero year row and the engine should prefer the year-specific row.
-- ---------------------------------------------------------------------------
create table if not exists public.cardology_monthly_cards (
    year        smallint not null,
    month       smallint not null
        check (month between 1 and 12),
    card_id     smallint not null references public.cardology_cards(id),
    primary key (year, month)
);

comment on column public.cardology_monthly_cards.year is
    '0 = applies to all years (default seed). Non-zero = year-specific override.';

-- ---------------------------------------------------------------------------
-- A.6 cardology_score_table — intensity-pair scoring lookup
-- ---------------------------------------------------------------------------
-- 9 rows: every (Intensity, Intensity) combination.
-- ---------------------------------------------------------------------------
create table if not exists public.cardology_score_table (
    a       text not null check (a in ('L', 'M', 'H')),
    b       text not null check (b in ('L', 'M', 'H')),
    score   smallint not null,
    primary key (a, b)
);

-- ---------------------------------------------------------------------------
-- Cardology grants — public reference data, NOT tenant-scoped, NO RLS
-- ---------------------------------------------------------------------------
-- Read access for both anon (signed-out marketing pages can render
-- "Today's card") and authenticated (in-app cardology surfaces).
-- Writes via service_role only — no INSERT/UPDATE/DELETE grant to
-- anon or authenticated.
-- ---------------------------------------------------------------------------
grant select on public.cardology_cards            to authenticated, anon;
grant select on public.cardology_card_dual_ppps   to authenticated, anon;
grant select on public.cardology_day_cards        to authenticated, anon;
grant select on public.cardology_weekly_calendar  to authenticated, anon;
grant select on public.cardology_monthly_cards    to authenticated, anon;
grant select on public.cardology_score_table      to authenticated, anon;

-- ============================================================================
-- B. ASTROLOGY TABLES (per-tenant, PII, RLS-protected)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- B.1 astro_birth_charts — header row, one per chart per user
-- ---------------------------------------------------------------------------
-- Multi-chart support per tenant (label = "self", "partner", etc.).
-- `dob_time` nullable because users with unknown birth time get a
-- noon-default chart (Moon position uncertain by up to ~6°, everything
-- else unaffected — engine handles this in birth-chart.ts).
--
-- PII surface: birth date + time + place + lat/lng all sit here. RLS
-- gates SELECT/INSERT/UPDATE/DELETE on tenant_id, matching the standard
-- pattern from 0002_rls.sql.
-- ---------------------------------------------------------------------------
create table if not exists public.astro_birth_charts (
    id                      uuid primary key default gen_random_uuid(),
    tenant_id               uuid not null references public.tenants(id) on delete cascade,
    user_id                 uuid references auth.users(id) on delete set null,
    label                   text,
    dob                     date not null,
    dob_time                time,
    dob_lat                 double precision,
    dob_lng                 double precision,
    dob_tz_offset_minutes   integer,
    birth_place             text,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create index if not exists astro_birth_charts_tenant_idx
    on public.astro_birth_charts(tenant_id);
create index if not exists astro_birth_charts_user_idx
    on public.astro_birth_charts(user_id);

comment on table public.astro_birth_charts is
    'One row per birth chart per user. PII: dob + dob_time + lat/lng + birth_place. RLS by tenant_id.';

-- ---------------------------------------------------------------------------
-- B.2 astro_planet_positions — 10 rows per chart (Sun..Pluto)
-- ---------------------------------------------------------------------------
-- Composite PK (birth_chart_id, planet) — exactly one row per planet
-- per chart. ON DELETE CASCADE on the parent chart.
--
-- RLS via exists() against the parent chart's tenant_id (no tenant_id
-- column on this table to keep it narrow; same pattern is used by
-- sub_agent_runs in 0001).
-- ---------------------------------------------------------------------------
create table if not exists public.astro_planet_positions (
    birth_chart_id  uuid not null references public.astro_birth_charts(id) on delete cascade,
    planet          text not null
        check (planet in (
            'sun', 'moon', 'mercury', 'venus', 'mars',
            'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'
        )),
    longitude_deg   double precision not null
        check (longitude_deg >= 0 and longitude_deg < 360),
    sign            text not null
        check (sign in (
            'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
            'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
        )),
    sign_degree     double precision not null
        check (sign_degree >= 0 and sign_degree < 30),
    house           smallint
        check (house is null or house between 1 and 12),
    retrograde      boolean not null default false,
    primary key (birth_chart_id, planet)
);

-- ---------------------------------------------------------------------------
-- B.3 astro_aspects — 0..N rows per chart, one per detected aspect pair
-- ---------------------------------------------------------------------------
create table if not exists public.astro_aspects (
    id              uuid primary key default gen_random_uuid(),
    birth_chart_id  uuid not null references public.astro_birth_charts(id) on delete cascade,
    planet_a        text not null,
    planet_b        text not null,
    aspect_type     text not null
        check (aspect_type in ('conjunction', 'sextile', 'square', 'trine', 'opposition')),
    orb_deg         double precision not null
);

create index if not exists astro_aspects_chart_idx
    on public.astro_aspects(birth_chart_id);

-- ---------------------------------------------------------------------------
-- RLS — astro_birth_charts: standard 5-policy tenant pattern
-- ---------------------------------------------------------------------------
alter table public.astro_birth_charts enable row level security;
alter table public.astro_birth_charts force row level security;

drop policy if exists astro_birth_charts_service_all on public.astro_birth_charts;
create policy astro_birth_charts_service_all on public.astro_birth_charts
    as permissive for all to service_role
    using (true) with check (true);

drop policy if exists astro_birth_charts_tenant_select on public.astro_birth_charts;
create policy astro_birth_charts_tenant_select on public.astro_birth_charts
    as permissive for select to authenticated
    using (tenant_id = public.current_tenant_id());

drop policy if exists astro_birth_charts_tenant_insert on public.astro_birth_charts;
create policy astro_birth_charts_tenant_insert on public.astro_birth_charts
    as permissive for insert to authenticated
    with check (tenant_id = public.current_tenant_id());

drop policy if exists astro_birth_charts_tenant_update on public.astro_birth_charts;
create policy astro_birth_charts_tenant_update on public.astro_birth_charts
    as permissive for update to authenticated
    using (tenant_id = public.current_tenant_id())
    with check (tenant_id = public.current_tenant_id());

drop policy if exists astro_birth_charts_tenant_delete on public.astro_birth_charts;
create policy astro_birth_charts_tenant_delete on public.astro_birth_charts
    as permissive for delete to authenticated
    using (tenant_id = public.current_tenant_id());

-- updated_at maintenance trigger (matches the do$$ block in 0001)
drop trigger if exists trg_astro_birth_charts_touch_updated_at on public.astro_birth_charts;
create trigger trg_astro_birth_charts_touch_updated_at
    before update on public.astro_birth_charts
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — astro_planet_positions: parent-chart's tenant_id (exists pattern)
-- ---------------------------------------------------------------------------
alter table public.astro_planet_positions enable row level security;
alter table public.astro_planet_positions force row level security;

drop policy if exists astro_planet_positions_service_all on public.astro_planet_positions;
create policy astro_planet_positions_service_all on public.astro_planet_positions
    as permissive for all to service_role
    using (true) with check (true);

drop policy if exists astro_planet_positions_tenant_select on public.astro_planet_positions;
create policy astro_planet_positions_tenant_select on public.astro_planet_positions
    as permissive for select to authenticated
    using (
        exists (
            select 1 from public.astro_birth_charts c
            where c.id = astro_planet_positions.birth_chart_id
              and c.tenant_id = public.current_tenant_id()
        )
    );

drop policy if exists astro_planet_positions_tenant_insert on public.astro_planet_positions;
create policy astro_planet_positions_tenant_insert on public.astro_planet_positions
    as permissive for insert to authenticated
    with check (
        exists (
            select 1 from public.astro_birth_charts c
            where c.id = astro_planet_positions.birth_chart_id
              and c.tenant_id = public.current_tenant_id()
        )
    );

drop policy if exists astro_planet_positions_tenant_update on public.astro_planet_positions;
create policy astro_planet_positions_tenant_update on public.astro_planet_positions
    as permissive for update to authenticated
    using (
        exists (
            select 1 from public.astro_birth_charts c
            where c.id = astro_planet_positions.birth_chart_id
              and c.tenant_id = public.current_tenant_id()
        )
    )
    with check (
        exists (
            select 1 from public.astro_birth_charts c
            where c.id = astro_planet_positions.birth_chart_id
              and c.tenant_id = public.current_tenant_id()
        )
    );

drop policy if exists astro_planet_positions_tenant_delete on public.astro_planet_positions;
create policy astro_planet_positions_tenant_delete on public.astro_planet_positions
    as permissive for delete to authenticated
    using (
        exists (
            select 1 from public.astro_birth_charts c
            where c.id = astro_planet_positions.birth_chart_id
              and c.tenant_id = public.current_tenant_id()
        )
    );

-- ---------------------------------------------------------------------------
-- RLS — astro_aspects: parent-chart's tenant_id (exists pattern)
-- ---------------------------------------------------------------------------
alter table public.astro_aspects enable row level security;
alter table public.astro_aspects force row level security;

drop policy if exists astro_aspects_service_all on public.astro_aspects;
create policy astro_aspects_service_all on public.astro_aspects
    as permissive for all to service_role
    using (true) with check (true);

drop policy if exists astro_aspects_tenant_select on public.astro_aspects;
create policy astro_aspects_tenant_select on public.astro_aspects
    as permissive for select to authenticated
    using (
        exists (
            select 1 from public.astro_birth_charts c
            where c.id = astro_aspects.birth_chart_id
              and c.tenant_id = public.current_tenant_id()
        )
    );

drop policy if exists astro_aspects_tenant_insert on public.astro_aspects;
create policy astro_aspects_tenant_insert on public.astro_aspects
    as permissive for insert to authenticated
    with check (
        exists (
            select 1 from public.astro_birth_charts c
            where c.id = astro_aspects.birth_chart_id
              and c.tenant_id = public.current_tenant_id()
        )
    );

drop policy if exists astro_aspects_tenant_update on public.astro_aspects;
create policy astro_aspects_tenant_update on public.astro_aspects
    as permissive for update to authenticated
    using (
        exists (
            select 1 from public.astro_birth_charts c
            where c.id = astro_aspects.birth_chart_id
              and c.tenant_id = public.current_tenant_id()
        )
    )
    with check (
        exists (
            select 1 from public.astro_birth_charts c
            where c.id = astro_aspects.birth_chart_id
              and c.tenant_id = public.current_tenant_id()
        )
    );

drop policy if exists astro_aspects_tenant_delete on public.astro_aspects;
create policy astro_aspects_tenant_delete on public.astro_aspects
    as permissive for delete to authenticated
    using (
        exists (
            select 1 from public.astro_birth_charts c
            where c.id = astro_aspects.birth_chart_id
              and c.tenant_id = public.current_tenant_id()
        )
    );

-- End 0012_cardology_and_astro.sql
