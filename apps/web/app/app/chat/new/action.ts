/**
 * apps/web/app/app/chat/new/action.ts
 *
 * Server Action: `createThread()` — inserts a fresh `chat_threads` row for
 * the current tenant + user and redirects to the new thread page.
 *
 * RLS keeps the insert tenant-scoped: a malicious client cannot bind
 * another tenant's id because we pull tenant_id server-side from the JWT
 * claim (requireTenantId) and the RLS policy on `chat_threads` checks
 * `tenant_id = auth.jwt() ->> 'tenant_id'`.
 *
 * Owner: [Cluster C · Forge]
 */

"use server";

import "server-only";

import { redirect } from "next/navigation";

import { childLogger } from "@/lib/logger";
import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_TITLE = "New conversation";

export async function createThread(): Promise<void> {
  const log = childLogger({ component: "chat.action.createThread" });

  const supabase = await createClient();
  const user = await requireAuth(supabase);
  const tenantId = await requireTenantId(supabase);

  // `chat_threads` is added by migration 0009 (Cluster A). Until the
  // generated `Database` type is republished we use an untyped accessor
  // here — the RLS policy on the table is the source of truth for
  // tenant scoping, not the TS shape.
  const insert = await (
    supabase as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => {
          select: (cols: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from("chat_threads")
    .insert({
      tenant_id: tenantId,
      user_id: user.id,
      title: DEFAULT_TITLE,
      last_message_at: null,
    })
    .select("id")
    .single();

  if (insert.error !== null || insert.data === null) {
    log.error(
      { err: insert.error, user_id: user.id, tenant_id: tenantId },
      "createThread insert failed",
    );
    // Send the user back to /app/chat with an error query — the page can
    // surface it via the empty state if the list is otherwise empty.
    redirect("/app/chat?err=create_failed");
  }

  redirect(`/app/chat/${insert.data!.id}`);
}
