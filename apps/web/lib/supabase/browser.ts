/**
 * apps/web/lib/supabase/browser.ts
 *
 * Browser-side Supabase client. Singleton — instantiate once per page load
 * and reuse via `getSupabaseBrowserClient()`. Used in Client Components for
 * realtime subscriptions and interactive auth state (`onAuthStateChange`).
 *
 * The anon key + URL are public; tenant isolation is enforced by RLS using
 * the JWT claim `tenant_id`. Never expose the service role here.
 *
 * Owner: [Forge + Shield]
 */

import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@autonomux/db/types";

let client: SupabaseClient<Database> | null = null;

function requirePublicEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `[apps/web/lib/supabase/browser] Missing public env: ${name}`,
    );
  }
  return value;
}

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (client !== null) return client;
  const url = requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  client = createSSRBrowserClient<Database>(url, anonKey);
  return client;
}
