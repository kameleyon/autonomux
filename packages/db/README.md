# `@autonomux/db`

Schema, RLS, audit chain, and typed Supabase clients for autonomux.
Owned by **[Atlas]**. Built in Phase 1.0-A5 (foundation).

---

## What's here

```
packages/db/
├── migrations/
│   ├── 0001_init.sql          # 20 tables, indexes, updated_at triggers
│   ├── 0002_rls.sql           # RLS on every tenant-scoped table
│   ├── 0003_audit_chain.sql   # Merkle chain triggers + verify function + checkpoints
│   └── 0004_pgvector.sql      # vector extension + HNSW index on agent_memory_episodes
├── src/
│   ├── client.ts              # createServerClient / createServiceClient / createBrowserClient
│   ├── admin.ts               # cross-tenant helpers (service-role only)
│   ├── types.ts               # Database<T> + JSONB column shapes + enum unions
│   ├── index.ts               # barrel
│   └── rls-proof.test.ts      # Vitest scaffold — runs against real Supabase in CI
├── package.json
├── tsconfig.json
└── README.md
```

---

## Running migrations

The migrations are plain SQL — apply them via the Supabase CLI:

```bash
# from packages/db/
pnpm migrate:apply     # supabase db push (applies pending migrations)
pnpm migrate:gen NAME  # supabase migration new NAME (scaffold next migration)
```

For local dev:

```bash
supabase start         # boots local Postgres + Auth + Storage
supabase db reset      # applies all migrations from scratch
```

Migrations are **idempotent** — every `CREATE` uses `IF NOT EXISTS`, every `CREATE OR REPLACE FUNCTION` is safe to re-run. RLS policies are dropped + recreated.

---

## RLS posture

Per PRD §6.7 / §7.

- **Every** tenant-scoped table has `tenant_id uuid not null` and four policies for the `authenticated` role: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, each scoped to `tenant_id = public.current_tenant_id()`.
- `public.current_tenant_id()` reads the `tenant_id` claim from `request.jwt.claims`. The claim is injected at sign-in by a Supabase Auth hook in `apps/web`.
- The `service_role` has a separate `ALL` policy on every table — but the service-role key is **never** exposed to the browser, route handler, or anything outside `packages/db/src/admin.ts` and the Railway worker. All cross-tenant queries go through `admin.ts` helpers that take an explicit `tenant_id` argument.
- The admin cpanel uses a second JWT claim `admin_role = 'admin'` plus `public.is_admin()`. Admins get **read-only** access to `audit_log`, `audit_chain_checkpoints`, and `system_log_meta`.
- Every table is also `FORCE ROW LEVEL SECURITY` — the table owner does not bypass RLS, only `service_role` does.

To prove this in CI, `src/rls-proof.test.ts` spins up two tenants and asserts a tenant-B JWT cannot read tenant A's data, cannot INSERT into tenant A, and cannot UPDATE tenant A. The test runs only when `SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY` + `SUPABASE_TEST_ANON_KEY` are set (CI sets these against a disposable Supabase project; local devs typically skip).

---

## Audit chain (Merkle)

Per PRD §7.5 / §8.3.

`audit_log` is **append-only** at three layers:

1. RLS denies `UPDATE` / `DELETE` to anyone except `service_role` (which we never expose).
2. A `BEFORE UPDATE` / `BEFORE DELETE` trigger raises `audit_log is append-only` regardless of role.
3. The `BEFORE INSERT` trigger `compute_audit_hash()` fills `prev_hash` from the most recent row and computes `this_hash = sha256(prev_hash || canonical_payload)`. The canonical payload is the pipe-joined string of all material columns at microsecond timestamp resolution — so any tampering on any field is detectable.

`verify_audit_chain(p_tenant_id uuid)` walks the chain in insertion order and returns `false` on the first mismatch. With `p_tenant_id = null` it verifies the global chain (the production check); with a specific tenant id it verifies that tenant's slice (used for tenant-export proofs).

A daily cron (Phase 1.7) will call `write_audit_checkpoint(current_date)` which captures the chain head into `audit_chain_checkpoints` and flips `signature_pending = false` once an OpenTimestamps receipt comes back. Until Phase 1.7 the rows are written with `signature_pending = true` and the OTS path is a no-op; the data shape is forward-compatible.

---

## TypeScript usage

```ts
import { createServerClient, type Database } from '@autonomux/db';

const supabase = createServerClient(cookieAdapter); // typed as SupabaseClient<Database>
const { data } = await supabase.from('agent_facts').select('*');
//      ^? Tables<'agent_facts'>[] | null
```

For admin / worker code:

```ts
import { listTenants, verifyAuditChain } from '@autonomux/db/admin';

const tenants = await listTenants({ limit: 50, status: 'active' });
const ok = await verifyAuditChain(); // global chain integrity
```

Never import `createServiceClient` from a file shipped to the browser bundle. The build step in `apps/web` will fail the bundle if `SUPABASE_SERVICE_ROLE_KEY` appears in client code.

---

## Compliance trade-offs flagged

- **`agent_memory_episodes` is HARD delete** on tenant deletion (`ON DELETE CASCADE`) — GDPR Art. 17 right-to-erasure. No soft delete on memory tables.
- **`audit_log.tenant_id` is `ON DELETE SET NULL`** — when a tenant is purged, audit rows stay with `tenant_id = null` so the 7-year compliance retention window still has the evidence (SOC 2 CC6.1, GDPR Art. 30). The chain stays verifiable because hashing uses the *value at insertion time*, not the post-purge null.
- **`scribe_voice_samples.content` is plaintext.** Voice samples are user-provided writing intended for AI mimicry; treating them like PII would prevent the use case. If a user needs a private sample, it routes via `agent_facts` (encrypted blob) instead.
- **Embeddings in `agent_memory_episodes` are not column-encrypted.** Per Phase 2 risk #10, embeddings include a per-tenant salt before write (Cipher's `embedSecure()`), and pgvector HNSW search is restricted to one tenant's rows by the RLS filter. Full column encryption of vector data would defeat the index; we accept the trade and revisit at Phase 2 if pen-test flags it.

---

## Next steps (out of A5 scope)

- Phase 1.0-B4: `packages/audit` writer wraps `writeAuditLog` with redaction + Pino bridge.
- Phase 1.0-C2: cpanel chain-verify button calls `verifyAuditChain()`.
- Phase 1.7: OpenTimestamps signer + scheduled checkpoint cron.
