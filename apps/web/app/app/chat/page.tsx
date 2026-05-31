/**
 * apps/web/app/app/chat/page.tsx
 *
 * Server Component. /app/chat landing.
 *
 * Behaviour:
 *   1. Auth + tenant guard.
 *   2. SELECT chat_threads for this tenant, ORDER BY last_message_at DESC
 *      LIMIT 50 (most recent first; nulls last so brand-new empty threads
 *      bubble down).
 *   3. No threads → empty state with a "Start a conversation" CTA that
 *      hits the `createThread` Server Action.
 *   4. ≥1 thread → render the ThreadList rail + a hint card on the right
 *      so the user knows to pick or create a thread. (We don't auto-
 *      redirect to the most-recent thread because surprise nav can lose
 *      the user's place when they came here intentionally.)
 *
 * Owner: [Cluster C · Forge + Vega]
 */

import { redirect } from "next/navigation";

import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

import { createThread } from "./new/action";
import type { ChatThreadRow } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Chat · AlterEgo",
};

export default async function ChatIndexPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const supabase = await createClient();
  await requireAuth(supabase);
  const tenantId = await requireTenantId(supabase);
  const searchParams = await props.searchParams;

  // Untyped accessor — chat_threads lands in migration 0009 (Cluster A).
  const { data } = await (
    supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            v: string,
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
    }
  )
    .from("chat_threads")
    .select(
      "id,tenant_id,user_id,title,created_at,updated_at,last_message_at",
    )
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);

  const threads: ChatThreadRow[] = data ?? [];
  const err = typeof searchParams.err === "string" ? searchParams.err : null;

  // Empty state — render a single, full-width card. No left rail (nothing
  // to list) so the user's attention lands squarely on the CTA.
  if (threads.length === 0) {
    return (
      <section
        aria-labelledby="chat-empty-heading"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--sp-48) var(--sp-16)",
        }}
      >
        <div
          style={{
            maxWidth: "560px",
            padding: "var(--sp-32)",
            borderRadius: "var(--r-xl)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            textAlign: "left",
          }}
        >
          <p
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: "var(--fs-mono-meta)",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "var(--brand-orange)",
              marginBottom: "var(--sp-12)",
            }}
          >
            AlterEgo
          </p>
          <h1
            id="chat-empty-heading"
            style={{
              fontSize: "var(--fs-display-s)",
              marginBottom: "var(--sp-16)",
              color: "var(--ink)",
            }}
          >
            Start your first <em>conversation</em>.
          </h1>
          <p
            style={{
              fontSize: "var(--fs-body-lg)",
              color: "var(--ink-soft)",
              marginBottom: "var(--sp-24)",
              lineHeight: "var(--lh-body)",
            }}
          >
            Ask it to triage your inbox, draft a reply, or surface what
            shifted while you were away. Each thread keeps its own context
            and audit trail — nothing leaves your tenant.
          </p>
          {err !== null ? (
            <p
              role="alert"
              style={{
                marginBottom: "var(--sp-16)",
                padding: "var(--sp-10) var(--sp-12)",
                borderRadius: "var(--r-md)",
                background: "var(--alert-bg)",
                color: "var(--alert-c)",
                fontSize: "var(--fs-body-sm)",
              }}
            >
              We couldn&apos;t create that thread. Try again in a moment.
            </p>
          ) : null}
          <form action={createThread}>
            <button
              type="submit"
              style={{
                background: "var(--brand-orange)",
                color: "var(--brand-white)",
                border: "none",
                borderRadius: "var(--r-md)",
                padding: "var(--sp-12) var(--sp-20)",
                fontSize: "var(--fs-body)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Start a conversation
            </button>
          </form>
        </div>
      </section>
    );
  }

  // ≥1 thread: redirect to the most recent so the user lands directly in
  // their active conversation (per Sprint D plan §3). The ThreadList is
  // still rendered inside `[threadId]/page.tsx` via this same layout shell.
  const mostRecent = threads[0]!;
  redirect(`/app/chat/${mostRecent.id}`);
}
