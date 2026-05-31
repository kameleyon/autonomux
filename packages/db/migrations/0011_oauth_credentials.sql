-- ============================================================================
-- autonomux · 0011_oauth_credentials.sql · Sprint D §4 (Cluster D)
-- Owner: [Atlas + Cipher + Shield]
--
-- Direct OAuth token storage on `connected_accounts`.
--
-- Background:
--   0001_init.sql shipped `connected_accounts` with only a `composio_account_id`
--   reference (we were going to delegate OAuth to Composio). Sprint D ships
--   Gmail "direct" because Composio Gmail still requires Google CASA approval —
--   we'd rather hold the tokens ourselves once than route through a vendor
--   that needs the same security review.
--
--   Tokens are stored as `EncryptedEnvelope` JSON (packages/cipher) bound to
--   { tenantId, purpose: 'oauth.gmail' }. The plaintext access_token /
--   refresh_token NEVER hit Postgres in cleartext. Even SELECT … LIMIT 1
--   returns ciphertext.
--
--   `token_expires_at` is a plaintext timestamp because we need to query it
--   (the Mailroom worker's refresh path filters WHERE token_expires_at <= now()).
--   Knowing "this token expires soon" is not sensitive.
--
-- Why JSONB not BYTEA: the EncryptedEnvelope is a JSON object with five
-- base64 fields (v, dek_ciphertext, dek_aad, ct, nonce, aad). Storing it as
-- jsonb keeps the round-trip readable in psql + lets us inspect cipher
-- metadata (envelope version, KMS key id binding) without writing a decoder.
--
-- RLS: already enabled + forced on connected_accounts by 0002_rls.sql. The
-- tenant-scoped policies cover SELECT/INSERT/UPDATE/DELETE — no change needed
-- here.
--
-- Idempotent: every ADD/CREATE uses IF NOT EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. encrypted_credentials column
-- ---------------------------------------------------------------------------
-- Format: EncryptedEnvelope JSON (see packages/cipher/src/types.ts).
-- {
--   v: 1,
--   dek_ciphertext: base64,
--   dek_aad: base64,
--   ct: base64,                       -- ciphertext of canonical JSON:
--                                     --   { access_token, refresh_token, scope, token_type }
--   nonce: base64,
--   aad: base64
-- }
--
-- After disconnect we OVERWRITE this column with an "empty envelope" (still
-- valid EncryptedEnvelope shape, but plaintext = "{}"), not NULL. Keeps the
-- audit-chain invariant "row existed → grant happened at some point".
-- ---------------------------------------------------------------------------
alter table public.connected_accounts
    add column if not exists encrypted_credentials jsonb;

comment on column public.connected_accounts.encrypted_credentials is
    'EncryptedEnvelope (packages/cipher) of {access_token,refresh_token,scope,token_type}. Bound to (tenant_id, purpose=oauth.<integration>). Overwritten with empty envelope on revoke, never NULLed.';

-- ---------------------------------------------------------------------------
-- 2. token_expires_at column (plaintext — needed for refresh-due queries)
-- ---------------------------------------------------------------------------
alter table public.connected_accounts
    add column if not exists token_expires_at timestamptz;

comment on column public.connected_accounts.token_expires_at is
    'Plaintext expiry of the encrypted access_token. Worker refreshes when now() >= token_expires_at - 60s. Refresh_token expiry is open-ended for Google.';

-- ---------------------------------------------------------------------------
-- 3. Index for refresh-scanning + integrations-page queries
-- ---------------------------------------------------------------------------
-- The integrations settings page filters
--   WHERE tenant_id = current AND oauth_status IN ('active','expired')
-- and the worker scans
--   WHERE integration = 'gmail' AND oauth_status = 'active' AND token_expires_at <= now()
-- so a composite covers both.
-- ---------------------------------------------------------------------------
create index if not exists connected_accounts_tenant_integration_status_idx
    on public.connected_accounts (tenant_id, integration, oauth_status);

-- End 0011_oauth_credentials.sql
