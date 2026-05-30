/**
 * apps/web/lib/supabase/server.ts
 *
 * Tenant-scoped server-side Supabase client for Next.js App Router.
 *
 * Reads + writes session cookies via Next.js `cookies()`. Use inside Server
 * Components, Server Actions, Route Handlers. The session JWT in cookies
 * carries the `tenant_id` claim — RLS in Postgres enforces tenant isolation
 * (see packages/db/migrations/0002_rls.sql).
 *
 * Throws at construction time if env is missing — we never want a "no-op
 * Supabase client" silently shipping to production.
 *
 * Owner: [Forge + Shield]
 */

import { cookies } from "next/headers";
import {
  createServerClient as createSSRServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@autonomux/db/types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `[apps/web/lib/supabase/server] Missing required env: ${name}`,
    );
  }
  return value;
}

/**
 * Create a per-request, tenant-scoped Supabase client.
 *
 * In Server Components Next.js cookies() is read-only; cookie writes from
 * Supabase session refresh will throw silently — they will be re-emitted
 * by middleware on the next request. That is the documented App Router
 * pattern (see Supabase SSR docs).
 */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  /* Strip any trailing slash from the Supabase URL — operators sometimes
   * paste `https://<ref>.supabase.co/` into Vercel which makes the SDK
   * construct `https://<ref>.supabase.co//auth/v1/signup` (double slash),
   * gotrue then rejects with "Invalid path specified in request URL".
   * 2026-05-30. */
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createSSRServerClient<Database>(url, anonKey, {
    cookies: {
      getAll(): { name: string; value: string }[] {
        return cookieStore.getAll().map((c) => ({
          name: c.name,
          value: c.value,
        }));
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[],
      ): void {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set({
              name,
              value,
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
            });
          }
        } catch {
          // Read-only cookie store (Server Component); middleware will
          // re-emit the refreshed session cookies on the next request.
        }
      },
    },
  });
}
