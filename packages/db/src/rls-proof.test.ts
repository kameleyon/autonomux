/**
 * autonomux/packages/db/src/rls-proof.test.ts
 *
 * RLS proof test scaffolding. These tests run in CI against a real Supabase
 * project (envs: SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY,
 * SUPABASE_TEST_ANON_KEY) — they are skipped locally unless those envs exist.
 *
 * Pattern (per Phase 1.7 RLS audit, also runs as a regression gate from
 * Phase 1.0-B6 onward):
 *
 *   1. service-role client creates tenant A + tenant B with one row each.
 *   2. mint two anon-client JWTs, one carrying tenant_id=A, one tenant_id=B.
 *   3. client A reads a tenant-scoped table → must see only A's row.
 *   4. client A attempts to write to tenant B's row → must fail with RLS error.
 *   5. service-role cleanup.
 *
 * Owner: [Atlas + Probe]
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types';

const SHOULD_RUN =
    Boolean(process.env['SUPABASE_TEST_URL']) &&
    Boolean(process.env['SUPABASE_TEST_SERVICE_ROLE_KEY']) &&
    Boolean(process.env['SUPABASE_TEST_ANON_KEY']);

const describeIfConfigured = SHOULD_RUN ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function service(): SupabaseClient<Database> {
    return createClient<Database>(
        process.env['SUPABASE_TEST_URL']!,
        process.env['SUPABASE_TEST_SERVICE_ROLE_KEY']!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
}

/**
 * Returns an anon-key client with a custom JWT in the Authorization header.
 * In production we mint these via Supabase Auth signInWithPassword; here we
 * use a pre-minted test JWT (issued in CI by a setup step that hits
 * supabase auth admin create-user → then signIn).
 */
function asTenant(jwt: string): SupabaseClient<Database> {
    return createClient<Database>(
        process.env['SUPABASE_TEST_URL']!,
        process.env['SUPABASE_TEST_ANON_KEY']!,
        {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${jwt}` } },
        },
    );
}

// ---------------------------------------------------------------------------
// Test fixtures (populated by beforeAll when SHOULD_RUN)
// ---------------------------------------------------------------------------

let tenantAId = '';
let tenantBId = '';
let tenantAJwt = '';
let tenantBJwt = '';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describeIfConfigured('RLS proof — tenant isolation', () => {
    beforeAll(async () => {
        // TODO(Phase 1.0-B6): provision tenants + users + JWTs via setupCi.ts.
        // For now this is a scaffolding placeholder. CI populates these envs.
        tenantAId = process.env['TEST_TENANT_A_ID'] ?? '';
        tenantBId = process.env['TEST_TENANT_B_ID'] ?? '';
        tenantAJwt = process.env['TEST_TENANT_A_JWT'] ?? '';
        tenantBJwt = process.env['TEST_TENANT_B_JWT'] ?? '';
    });

    it('service role can seed a row in tenant A', async () => {
        const sb = service();
        const { error } = await sb.from('mailroom_rules').insert({
            tenant_id: tenantAId,
            name: 'rls-proof seed A',
            rule_dsl: { when: { sender: 'noreply@example.com' }, then: { action: 'delete' } },
        });
        expect(error).toBeNull();
    });

    it('tenant A client sees its own rules', async () => {
        const sb = asTenant(tenantAJwt);
        const { data, error } = await sb.from('mailroom_rules').select('*');
        expect(error).toBeNull();
        expect(data ?? []).toEqual(
            expect.arrayContaining([expect.objectContaining({ tenant_id: tenantAId })]),
        );
    });

    it('tenant B client sees ZERO rows from tenant A', async () => {
        const sb = asTenant(tenantBJwt);
        const { data } = await sb.from('mailroom_rules').select('*').eq('tenant_id', tenantAId);
        // RLS filters server-side: query returns empty rather than erroring.
        expect(data ?? []).toEqual([]);
    });

    it('tenant B client cannot INSERT into tenant A', async () => {
        const sb = asTenant(tenantBJwt);
        const { error } = await sb.from('mailroom_rules').insert({
            tenant_id: tenantAId,
            name: 'malicious cross-tenant insert',
            rule_dsl: { when: {}, then: { action: 'delete' } },
        });
        expect(error).not.toBeNull();
        // Postgres returns 42501 / "new row violates row-level security policy".
        expect(error?.message ?? '').toMatch(/row-level security|permission denied/i);
    });

    it('tenant B client cannot UPDATE tenant A rows', async () => {
        const sb = asTenant(tenantBJwt);
        const { data, error } = await sb
            .from('mailroom_rules')
            .update({ active: false })
            .eq('tenant_id', tenantAId)
            .select();
        // Update returns 0 rows (filtered) rather than erroring.
        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);
    });

    it('audit_log is append-only (UPDATE forbidden)', async () => {
        const sb = service();
        const { data: row, error: insertErr } = await sb
            .from('audit_log')
            .insert({
                tenant_id: tenantAId,
                action: 'rls_proof.test',
                resource_type: 'test',
                actor_kind: 'system',
            } as never)
            .select()
            .single();
        expect(insertErr).toBeNull();
        expect(row?.this_hash).toBeTruthy();

        const { error: updateErr } = await sb
            .from('audit_log')
            // @ts-expect-error — Update type is `never` by design
            .update({ action: 'tampered' })
            .eq('id', row!.id);
        expect(updateErr).not.toBeNull();
    });

    it('audit chain verifies', async () => {
        const sb = service();
        const { data, error } = await sb.rpc('verify_audit_chain', { p_tenant_id: null });
        expect(error).toBeNull();
        expect(data).toBe(true);
    });
});
