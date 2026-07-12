/**
 * apps/web/app/api/chat/threads/route.ts
 *
 * GET → recent conversations for the signed-in tenant + user, so the AlterEgo
 * client can render a "Recent" history list and let the user reopen a past
 * chat. Returns `{ threads: [{ id, title, last_message_at }] }`, newest
 * activity first, archived threads excluded, capped at 30.
 *
 * Auth: requireAuth (signed in + verified) then requireTenantId (JWT claim,
 * tenant_members fallback). The SELECT is service-role but carries an explicit
 * `tenant_id` AND `user_id` predicate — the client cannot read another
 * tenant's or another user's conversations. This mirrors the write path in
 * ../thread/route.ts (which binds tenant_id + user_id from the same verified
 * server values on INSERT).
 */
import { NextResponse } from "next/server";

import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { childLogger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ceiling on how many recent conversations the history list loads. */
const MAX_THREADS = 30;

interface ThreadListItem {
  id: string;
  title: string;
  last_message_at: string | null;
}

export async function GET(): Promise<NextResponse> {
  const log = childLogger({ component: "api.chat.threads" });

  const userClient = await createClient();
  let userId: string;
  let tenantId: string;
  try {
    const user = await requireAuth(userClient);
    userId = user.id;
    tenantId = await requireTenantId(userClient);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = getSupabaseServiceClient();
  const res = await (
    service as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, v: string) => {
            eq: (col: string, v: string) => {
              is: (col: string, v: null) => {
                order: (
                  col: string,
                  opts: { ascending: boolean; nullsFirst: boolean },
                ) => {
                  limit: (n: number) => Promise<{
                    data: ThreadListItem[] | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    }
  )
    .from("chat_threads")
    .select("id,title,last_message_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(MAX_THREADS);

  if (res.error !== null) {
    log.error({ err: res.error, tenant_id: tenantId }, "thread list failed");
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }

  return NextResponse.json(
    { threads: res.data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
