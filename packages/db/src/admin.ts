/**
 * autonomux/packages/db/src/admin.ts
 *
 * Cross-tenant admin helpers. Every function here uses the service-role client
 * — that is the entire point. Wrap each call in: explicit tenant_id arg →
 * filter → audit_log write. NEVER export the raw service client from here.
 *
 * Owner: [Atlas + Forge]
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceClient } from './client.js';
import type { Database, Tables, TablesInsert } from './types.js';

type Sb = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// listTenants — cpanel only. Pages results, never returns the world.
// ---------------------------------------------------------------------------
export async function listTenants(
    opts: { limit?: number; offset?: number; status?: Tables<'tenants'>['status'] } = {},
): Promise<Tables<'tenants'>[]> {
    const sb: Sb = createServiceClient();
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;

    let q = sb.from('tenants').select('*').order('created_at', { ascending: false });
    if (opts.status) {
        q = q.eq('status', opts.status);
    }
    q = q.range(offset, offset + limit - 1);

    const { data, error } = await q;
    if (error) throw new Error(`[admin.listTenants] ${error.message}`);
    return data ?? [];
}

// ---------------------------------------------------------------------------
// getTenantSnapshot — drill-down for cpanel.
// ---------------------------------------------------------------------------
export async function getTenantSnapshot(tenantId: string): Promise<{
    tenant: Tables<'tenants'> | null;
    runs: Tables<'agent_runs'>[];
    subscription: Tables<'billing_subscriptions'> | null;
    usage: Tables<'usage_meters'> | null;
}> {
    const sb: Sb = createServiceClient();
    const [tenantRes, runsRes, subRes, usageRes] = await Promise.all([
        sb.from('tenants').select('*').eq('id', tenantId).maybeSingle(),
        sb
            .from('agent_runs')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(25),
        sb.from('billing_subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle(),
        sb
            .from('usage_meters')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('period', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    return {
        tenant: tenantRes.data ?? null,
        runs: runsRes.data ?? [],
        subscription: subRes.data ?? null,
        usage: usageRes.data ?? null,
    };
}

// ---------------------------------------------------------------------------
// writeAuditLog — service-role insert. Trigger fills prev_hash + this_hash.
// ---------------------------------------------------------------------------
export async function writeAuditLog(
    entry: Omit<TablesInsert<'audit_log'>, 'prev_hash' | 'this_hash' | 'id' | 'created_at'>,
): Promise<Tables<'audit_log'>> {
    const sb: Sb = createServiceClient();
    const { data, error } = await sb
        .from('audit_log')
        .insert(entry as TablesInsert<'audit_log'>)
        .select()
        .single();
    if (error) throw new Error(`[admin.writeAuditLog] ${error.message}`);
    return data;
}

// ---------------------------------------------------------------------------
// verifyAuditChain — cpanel "Verify" button.
// ---------------------------------------------------------------------------
export async function verifyAuditChain(tenantId?: string): Promise<boolean> {
    const sb: Sb = createServiceClient();
    const { data, error } = await sb.rpc('verify_audit_chain', {
        p_tenant_id: tenantId ?? null,
    });
    if (error) throw new Error(`[admin.verifyAuditChain] ${error.message}`);
    return Boolean(data);
}

// ---------------------------------------------------------------------------
// writeDailyAuditCheckpoint — invoked by the Phase 1.7 OTS-signing cron.
// ---------------------------------------------------------------------------
export async function writeDailyAuditCheckpoint(
    date: string = new Date().toISOString().slice(0, 10),
): Promise<string | null> {
    const sb: Sb = createServiceClient();
    const { data, error } = await sb.rpc('write_audit_checkpoint', { p_date: date });
    if (error) throw new Error(`[admin.writeDailyAuditCheckpoint] ${error.message}`);
    return data ?? null;
}
