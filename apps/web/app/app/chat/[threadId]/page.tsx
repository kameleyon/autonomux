/**
 * apps/web/app/app/chat/[threadId]/page.tsx
 *
 * Server Component. Loads ONE thread (RLS auto-filters by tenant) + the
 * last 50 messages, renders the ThreadList rail and the ChatStream
 * client island.
 *
 * 404 behaviour: if the SELECT returns no row, either (a) the thread
 * doesn't exist, or (b) it exists but belongs to a different tenant —
 * RLS makes both indistinguishable here, which is the correct posture
 * (no enumeration leak). Either way we call notFound().
 *
 * Owner: [Cluster C · Forge + Vega]
 */

import { notFound } from "next/navigation";

import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

import { ThreadList } from "@/components/chat/ThreadList";
import { ChatStream } from "@/components/chat/ChatStream";
import type {
  ChatMessageRow,
  ChatThreadRow,
} from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Chat · AlterEgo",
};

export default async function ChatThreadPage(props: {
  params: Promise<{ threadId: string }>;
}): Promise<React.ReactElement> {
  const params = await props.params;
  const { threadId } = params;

  const supabase = await createClient();
  await requireAuth(supabase);
  const tenantId = await requireTenantId(supabase);

  /* Service-role reads with explicit tenant_id predicates — RLS denies
   * everything for users whose JWT lacks the tenant_id claim (issued
   * pre-hook). tenantId is verified server-side via requireTenantId
   * which uses the tenant_members fallback. */
  const service = getSupabaseServiceClient();

  const threadRes = await (
    service as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, v: string) => {
            eq: (col: string, v: string) => {
              maybeSingle: () => Promise<{
                data: ChatThreadRow | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    }
  )
    .from("chat_threads")
    .select(
      "id,tenant_id,user_id,title,created_at,updated_at,last_message_at,archived_at",
    )
    .eq("id", threadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (threadRes.error !== null || threadRes.data === null) {
    notFound();
  }
  const thread = threadRes.data;

  /* Load active + archived threads in parallel with the last 50 messages
   * for the open thread. The active list filters `archived_at IS NULL`
   * (matches the partial index from 0014); the archived list filters the
   * inverse. Both are tenant-scoped. */
  type ThreadsQuery = {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          is: (
            col: string,
            v: null,
          ) => {
            order: (
              col: string,
              opts: { ascending: boolean; nullsFirst?: boolean },
            ) => {
              limit: (n: number) => Promise<{
                data: ChatThreadRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
          not: (
            col: string,
            op: "is",
            v: null,
          ) => {
            order: (
              col: string,
              opts: { ascending: boolean; nullsFirst?: boolean },
            ) => {
              limit: (n: number) => Promise<{
                data: ChatThreadRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };

  const [activeThreadsRes, archivedThreadsRes, messagesRes] = await Promise.all([
    (service as unknown as ThreadsQuery)
      .from("chat_threads")
      .select(
        "id,tenant_id,user_id,title,created_at,updated_at,last_message_at,archived_at",
      )
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50),
    (service as unknown as ThreadsQuery)
      .from("chat_threads")
      .select(
        "id,tenant_id,user_id,title,created_at,updated_at,last_message_at,archived_at",
      )
      .eq("tenant_id", tenantId)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false, nullsFirst: false })
      .limit(50),
    (
      service as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (
              col: string,
              v: string,
            ) => {
              order: (
                col: string,
                opts: { ascending: boolean },
              ) => {
                limit: (n: number) => Promise<{
                  data: ChatMessageRow[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      }
    )
      .from("chat_messages")
      .select(
        "id,thread_id,tenant_id,role,content_blocks,agent_run_id,created_at",
      )
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const activeThreads = activeThreadsRes.data ?? [];
  const archivedThreads = archivedThreadsRes.data ?? [];
  const messages = messagesRes.data ?? [];

  return (
    <>
      <ThreadList
        activeThreads={activeThreads}
        archivedThreads={archivedThreads}
        activeThreadId={thread.id}
      />
      <section
        aria-label={`Conversation: ${thread.title}`}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0, // allow children to shrink properly
          borderRadius: "var(--r-xl)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "14px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "var(--sp-16)",
          }}
        >
          <h1
            style={{
              fontSize: "var(--fs-h-step)",
              margin: 0,
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {thread.title}
          </h1>
          <p
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: "10px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--muted)",
              margin: 0,
              flexShrink: 0,
            }}
          >
            Sonnet 4.6
          </p>
        </header>
        <ChatStream threadId={thread.id} initialMessages={messages} />
      </section>
    </>
  );
}
