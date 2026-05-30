/**
 * apps/web/lib/supabase/service.ts
 *
 * Service-role Supabase client — bypasses RLS. Server-ONLY.
 *
 * The `import "server-only"` directive at the top of this file causes the
 * Next.js bundler to ABORT the build if any client component reaches this
 * module. Combined with the env guard, this is the hard fence between
 * tenant-scoped queries and admin-level writes.
 *
 * Use ONLY for:
 *   - Signup flow: creating `tenants` + `tenant_members` rows before the
 *     user has a tenant_id claim.
 *   - Audit logging (must succeed regardless of caller's RLS posture).
 *   - Webhook handlers (Stripe, Plaid) where there is no user session.
 *
 * For anything tenant-scoped, prefer the SSR server client in `./server.ts`
 * which honors RLS via the user's JWT.
 *
 * Owner: [Forge + Shield + Cipher]
 */

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@autonomux/db/types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `[apps/web/lib/supabase/service] Missing required env: ${name}`,
    );
  }
  return value;
}

let serviceClient: SupabaseClient<Database> | null = null;

export function getSupabaseServiceClient(): SupabaseClient<Database> {
  if (serviceClient !== null) return serviceClient;
  /* Same trailing-slash defense as ./server.ts — see comment there. */
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  serviceClient = createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "x-autonomux-client": "service-role-web",
      },
    },
  });
  return serviceClient;
}
