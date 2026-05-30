/**
 * autonomux/packages/db/src/client.ts
 *
 * Three Supabase clients, each typed against `Database`:
 *   - createServerClient(req)  — tenant-scoped, runs in App Router server code.
 *   - createServiceClient()    — service-role bypass; use ONLY in /packages/db/src/admin.ts
 *                                or cron workers. NEVER expose to the browser.
 *   - createBrowserClient()    — anon key, browser-safe.
 *
 * Owner: [Atlas + Forge]
 */

import {
    createServerClient as createSSRServerClient,
    createBrowserClient as createSSRBrowserClient,
    type CookieOptionsWithName,
} from '@supabase/ssr';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types';

// ---------------------------------------------------------------------------
// Env access — never log these, never ship to the browser bundle other than
// the public anon key + url.
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value || value.length === 0) {
        throw new Error(`[@autonomux/db] Missing required env: ${name}`);
    }
    return value;
}

function getSupabaseUrl(): string {
    return requireEnv('NEXT_PUBLIC_SUPABASE_URL');
}

function getAnonKey(): string {
    return requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

function getServiceRoleKey(): string {
    // Server-only; absence here is a programming error (called from browser?).
    return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
}

// ---------------------------------------------------------------------------
// Cookie adapter — App Router gives us a request object with `cookies()`.
// We keep this generic so it works in route handlers + middleware + RSC.
// ---------------------------------------------------------------------------

export interface CookieAdapter {
    getAll(): Array<{ name: string; value: string }>;
    setAll(
        cookies: Array<{ name: string; value: string; options?: CookieOptionsWithName }>,
    ): void;
}

// ---------------------------------------------------------------------------
// createServerClient — tenant-scoped, RLS-enforced.
// ---------------------------------------------------------------------------
// The caller passes a cookie adapter (in Next.js App Router that's the
// `cookies()` helper wrapped to match `CookieAdapter`).
// The session JWT (cookie 'sb-*') carries `tenant_id` in `app_metadata` /
// custom claim — set at sign-in via a Supabase hook in `apps/web`.
// ---------------------------------------------------------------------------
export function createServerClient(cookies: CookieAdapter): SupabaseClient<Database> {
    return createSSRServerClient<Database>(getSupabaseUrl(), getAnonKey(), {
        cookies: {
            getAll: () => cookies.getAll(),
            setAll: (cookieList) => cookies.setAll(cookieList),
        },
    });
}

// ---------------------------------------------------------------------------
// createServiceClient — admin/worker only.
// ---------------------------------------------------------------------------
// Bypasses RLS via the service role. Calls MUST be wrapped in helpers under
// packages/db/src/admin.ts that take an explicit tenant_id and constrain the
// query — never expose this client raw to route handlers.
// ---------------------------------------------------------------------------
export function createServiceClient(): SupabaseClient<Database> {
    return createSupabaseClient<Database>(getSupabaseUrl(), getServiceRoleKey(), {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        global: {
            headers: {
                'x-autonomux-client': 'service-role',
            },
        },
    });
}

// ---------------------------------------------------------------------------
// createBrowserClient — anon, runs in user agents.
// ---------------------------------------------------------------------------
// Used by client components for realtime / interactive queries. The session
// JWT travels in cookies; RLS still enforces tenant isolation.
// ---------------------------------------------------------------------------
export function createBrowserClient(): SupabaseClient<Database> {
    return createSSRBrowserClient<Database>(getSupabaseUrl(), getAnonKey());
}
