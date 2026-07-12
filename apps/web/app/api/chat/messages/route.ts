/**
 * apps/web/app/api/chat/messages/route.ts
 *
 * GET ?threadId=<uuid> → the persisted messages for one conversation, so the
 * AlterEgo client can rehydrate a thread the user reopens from the Recent
 * history list. Returns `{ messages: [{ id, role, content_blocks,
 * created_at }] }`, oldest first, capped at MAX_MESSAGES.
 *
 * Auth boundary (two gates):
 *   1. requireAuth + requireTenantId — establishes the verified tenant + user.
 *   2. The thread is looked up with an explicit `tenant_id` AND `user_id`
 *      predicate; if it doesn't belong to this user we 404 and never touch the
 *      messages table. Message rows are then loaded with an explicit
 *      `thread_id` + `tenant_id` predicate (defense in depth). Service-role is
 *      used for the same reason as the write path (the JWT may pre-date the
 *      tenant_id claim hook) — every query carries the tenant boundary.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { childLogger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { ChatMessageRow } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A single thread reload never returns more than this many rows. */
const MAX_MESSAGES = 200;

type MessageOut = Pick<
  ChatMessageRow,
  "id" | "role" | "content_blocks" | "created_at"
>;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const log = childLogger({ component: "api.chat.messages" });

  const threadId = request.nextUrl.searchParams.get("threadId");
  if (threadId === null || threadId.length === 0) {
    return NextResponse.json({ error: "missing_threadId" }, { status: 400 });
  }

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

  // Gate: the thread must belong to THIS tenant AND user. 404 (not 403) so we
  // don't confirm the existence of another user's thread id.
  const threadRes = await (
    service as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, v: string) => {
            eq: (col: string, v: string) => {
              eq: (col: string, v: string) => {
                maybeSingle: () => Promise<{
                  data: { id: string } | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    }
  )
    .from("chat_threads")
    .select("id")
    .eq("id", threadId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (threadRes.error !== null) {
    log.error(
      { err: threadRes.error, thread_id: threadId },
      "message load: thread lookup failed",
    );
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
  if (threadRes.data === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const msgRes = await (
    service as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, v: string) => {
            eq: (col: string, v: string) => {
              order: (
                col: string,
                opts: { ascending: boolean },
              ) => {
                limit: (n: number) => Promise<{
                  data: MessageOut[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    }
  )
    .from("chat_messages")
    .select("id,role,content_blocks,created_at")
    .eq("thread_id", threadId)
    .eq("tenant_id", tenantId)
    // Fetch the NEWEST rows, not the oldest: on a thread longer than
    // MAX_MESSAGES we want the recent tail (what the user was last saying),
    // not a truncated ancient head. We reverse to chronological order below.
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);

  if (msgRes.error !== null) {
    log.error(
      { err: msgRes.error, thread_id: threadId },
      "message load failed",
    );
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  // Reverse newest-first → chronological (oldest-first) for rendering.
  const messages = (msgRes.data ?? []).slice().reverse();

  return NextResponse.json(
    { messages },
    { headers: { "cache-control": "no-store" } },
  );
}
