-- ============================================================================
-- autonomux · 0016_plaid_webhook_events.sql · Phase 0 · CR9 Plaid webhook
-- Owner: [Shield · Forge]
-- Idempotency ledger for the Plaid webhook receiver
-- (apps/web/app/api/plaid/webhook/route.ts).
--
-- Design:
--   - TENANT-AGNOSTIC: a Plaid webhook arrives with no user session and often
--     before we've resolved which tenant/item it maps to. The receiver only
--     needs an at-most-once guard, so there is NO tenant_id column here.
--     (Once business logic lands, per-item processing writes go to the
--     tenant-scoped tables — connected_accounts / connected_account_events /
--     treasurer_bills — not to this ledger.)
--   - SERVICE-ROLE-ONLY: RLS is enabled + FORCED, and the ONLY policy is the
--     service_role bypass. No authenticated/anon role can read or write.
--     PostgREST with an anon/authenticated JWT sees zero rows and cannot insert.
--     (System ledger, not tenant-scoped user data — only the webhook receiver,
--     running as service_role, ever touches it.)
--   - IDEMPOTENCY KEY: plaid_event_id is UNIQUE. The receiver claims an event
--     by INSERT; a 23505 unique_violation means "already processed" → ack only.
--
-- Conventions (inherited from 0001..0015):
--   - id: uuid (pgcrypto gen_random_uuid()).
--   - timestamps: timestamptz, default now().
--   - Idempotent: every CREATE uses IF NOT EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- plaid_webhook_events — at-most-once ledger for inbound Plaid webhooks
-- ---------------------------------------------------------------------------
-- plaid_event_id: stable per-delivery id. The receiver derives it from the
--   sha256 of the exact signed request body (Plaid re-delivers identical bytes,
--   so identical body ⇒ identical id). UNIQUE = the idempotency guard.
-- webhook_type / webhook_code: denormalised from the (verified) payload for
--   observability + future routing (e.g. 'TRANSACTIONS' / 'SYNC_UPDATES_AVAILABLE').
-- received_at: when the receiver accepted + recorded the event.
-- processed_at / processing_error: reserved for the follow-up business logic
--   (skeleton handler leaves them null; a processor stamps them on completion).
-- ---------------------------------------------------------------------------
create table if not exists public.plaid_webhook_events (
    id                  uuid primary key default gen_random_uuid(),
    plaid_event_id      text not null unique,
    webhook_type        text,
    webhook_code        text,
    received_at         timestamptz not null default now(),
    processed_at        timestamptz,
    processing_error    text,
    created_at          timestamptz not null default now()
);

comment on table  public.plaid_webhook_events is
    'At-most-once idempotency ledger for inbound Plaid webhooks. Tenant-agnostic, service_role-only (RLS). plaid_event_id UNIQUE is the idempotency guard.';
comment on column public.plaid_webhook_events.plaid_event_id is
    'Stable per-delivery id = sha256(exact signed request body). UNIQUE enforces process-at-most-once.';
comment on column public.plaid_webhook_events.processed_at is
    'Stamped by the (follow-up) business-logic processor. Null while only the skeleton receiver has acked.';

-- Observability: recent events, and unprocessed-event backlog.
create index if not exists plaid_webhook_events_received_idx
    on public.plaid_webhook_events(received_at desc);

create index if not exists plaid_webhook_events_unprocessed_idx
    on public.plaid_webhook_events(created_at)
    where processed_at is null;

-- ---------------------------------------------------------------------------
-- RLS — enable + FORCE, service_role-only (no authenticated access at all).
-- Mirrors automation_secrets (0015): the single policy is the service_role
-- bypass; there are intentionally NO authenticated/anon policies, so RLS
-- denies every non-service caller by default.
-- ---------------------------------------------------------------------------
alter table public.plaid_webhook_events enable row level security;
alter table public.plaid_webhook_events force  row level security;

drop policy if exists plaid_webhook_events_service_all on public.plaid_webhook_events;
create policy plaid_webhook_events_service_all on public.plaid_webhook_events
    as permissive for all to service_role
    using (true) with check (true);

-- End 0016_plaid_webhook_events.sql
