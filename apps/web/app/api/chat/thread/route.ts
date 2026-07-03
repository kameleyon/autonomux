/**
 * apps/web/app/api/chat/thread/route.ts
 *
 * POST → create a fresh chat_threads row for the signed-in tenant + user and
 * return `{ threadId }` as JSON. This is the JSON sibling of the createThread
 * server action (which redirects); the AlterEgo client calls this to get a
 * thread id before opening the SSE stream, so the streamed conversation
 * persists and carries context turn-to-turn.
 *
 * Auth: requireAuth (signed in + verified) then requireTenantId (JWT claim,
 * tenant_members fallback). The service-role INSERT binds tenant_id from that
 * verified server value — the client cannot influence which tenant it lands in.
 */
import { NextResponse } from "next/server";

import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { childLogger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TITLE = "New conversation";

export async function POST(): Promise<NextResponse> {
  const log = childLogger({ component: "api.chat.thread" });

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
    .insert({ tenant_id: tenantId, user_id: userId, title: DEFAULT_TITLE })
    .select("id")
    .single();

  if (insert.error !== null || insert.data === null) {
    log.error({ err: insert.error, tenant_id: tenantId }, "thread insert failed");
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  return NextResponse.json(
    { threadId: insert.data.id },
    { headers: { "cache-control": "no-store" } },
  );
}
