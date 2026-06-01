/**
 * apps/web/components/chat/ThreadList.tsx
 *
 * Server Component. Renders the left-rail list of recent chat threads.
 * Receives threads as a prop (the parent page loads them with the
 * tenant-scoped Supabase client so RLS keeps cross-tenant isolation).
 *
 * Visual: 268px rail, quiet "CHATS" eyebrow, dashed-border "+ New chat"
 * ghost button, soft warm fill on the active item — no left-edge accent
 * stripe. Tuned to read as calm and scannable next to the messages pane.
 *
 * a11y:
 *   - `<nav>` with `aria-label="Chat threads"` so SR users can jump.
 *   - Active thread carries `aria-current="page"`.
 *   - "New conversation" is a real Server Action form (no client JS).
 *
 * Owner: [Cluster C · Forge]
 */

import Link from "next/link";

import type { ChatThreadRow } from "@/lib/chat/types";
import { createThread } from "@/app/app/chat/new/action";

export interface ThreadListProps {
  threads: ReadonlyArray<ChatThreadRow>;
  activeThreadId: string | null;
}

export function ThreadList({
  threads,
  activeThreadId,
}: ThreadListProps): React.ReactElement {
  return (
    <nav
      aria-label="Chat threads"
      style={{
        width: "268px",
        flexShrink: 0,
        borderRadius: "var(--r-xl)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "var(--sp-12)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-16)",
        alignSelf: "stretch",
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-8)",
        }}
      >
        <p
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "11px",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
            margin: 0,
            padding: "0 var(--sp-4)",
          }}
        >
          Chats
        </p>
        <form action={createThread}>
          <button
            type="submit"
            className="thread-list-new"
            aria-label="Start a new conversation"
            style={{
              display: "block",
              width: "100%",
              background: "transparent",
              border: "1px dashed rgba(0, 0, 0, 0.18)",
              borderRadius: "var(--r-md)",
              padding: "10px 12px",
              color: "var(--ink-soft)",
              fontSize: "var(--fs-body-sm)",
              fontFamily: "inherit",
              textAlign: "center",
              cursor: "pointer",
              transition: "border-color 120ms, color 120ms",
            }}
          >
            + New chat
          </button>
        </form>
      </div>

      {threads.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-4)",
            padding: "var(--sp-4) var(--sp-4)",
          }}
        >
          <p
            style={{
              fontSize: "var(--fs-body-sm)",
              color: "var(--ink-soft)",
              margin: 0,
            }}
          >
            No conversations yet.
          </p>
          <p
            style={{
              fontSize: "var(--fs-body-sm)",
              color: "var(--muted)",
              margin: 0,
            }}
          >
            Click + New chat to start one.
          </p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          {threads.map((t) => {
            const isActive = t.id === activeThreadId;
            const stamp =
              t.last_message_at ?? t.updated_at ?? t.created_at;
            return (
              <li key={t.id}>
                <Link
                  href={`/app/chat/${t.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "thread-list-item thread-list-item--active"
                      : "thread-list-item"
                  }
                  style={{
                    display: "block",
                    padding: "10px 12px",
                    borderRadius: "var(--r-md)",
                    background: isActive
                      ? "rgba(0, 0, 0, 0.05)"
                      : "transparent",
                    color: "var(--ink)",
                    textDecoration: "none",
                    transition: "background 120ms",
                  }}
                >
                  <div
                    style={{
                      fontSize: "var(--fs-body-sm)",
                      color: isActive
                        ? "var(--ink)"
                        : "var(--ink-soft)",
                      fontWeight: isActive ? 500 : 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.title}
                  </div>
                  <div
                    style={{
                      marginTop: "var(--sp-2)",
                      fontFamily: "DM Mono, monospace",
                      fontSize: "calc(var(--fs-mono-meta) * 0.95)",
                      color: "var(--muted)",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {formatStamp(stamp)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

function formatStamp(iso: string | null): string {
  if (iso === null) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
