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
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_TITLE = "New conversation";

export async function createThread(): Promise<void> {
  const log = childLogger({ component: "chat.action.createThread" });

  /* Two clients, two purposes:
   *  - `userClient` carries the user's JWT and is the gate for AuthN
   *    (requireAuth proves they're signed in + email verified).
   *  - `serviceClient` bypasses RLS for the INSERT. We need this because
   *    `requireTenantId` has a DB fallback (handles users whose JWT was
   *    issued before the access-token hook was wired), but the RLS
   *    policy on chat_threads checks `auth.jwt() ->> 'tenant_id'`
   *    directly — the fallback can't influence what the policy sees.
   *
   * Auth invariant: we verify tenant ownership server-side via
   * `tenant_members` (that's what requireTenantId reads in the fallback)
   * BEFORE writing. The user cannot influence which tenant the row
   * belongs to. RLS is bypassed for the WRITE only; reads remain
   * RLS-gated via the user client. */
  const userClient = await createClient();
  const user = await requireAuth(userClient);
  const tenantId = await requireTenantId(userClient);

  const service = getSupabaseServiceClient();
  const insert = await (
    service as unknown as {
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
    redirect("/app/chat?err=create_failed");
  }

  redirect(`/app/chat/${insert.data!.id}`);
}
