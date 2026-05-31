/**
 * apps/web/components/chat/ThreadList.tsx
 *
 * Server Component. Renders the left-rail list of recent chat threads.
 * Receives threads as a prop (the parent page loads them with the
 * tenant-scoped Supabase client so RLS keeps cross-tenant isolation).
 *
 * Visual: warm palette only, `--r-xl` rail, --r-md per row. Active thread
 * uses a subtle warm fill (--surface-warm) and a left-edge gold accent.
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
        width: "240px",
        flexShrink: 0,
        borderRadius: "var(--r-xl)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "var(--sp-16)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-12)",
        alignSelf: "stretch",
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--sp-4)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--fs-h-step)",
            margin: 0,
            color: "var(--ink)",
          }}
        >
          Threads
        </h2>
        <form action={createThread}>
          <button
            type="submit"
            style={{
              background: "var(--brand-orange)",
              color: "var(--brand-white)",
              border: "none",
              borderRadius: "var(--r-md)",
              padding: "var(--sp-6) var(--sp-12)",
              fontFamily: "DM Mono, monospace",
              fontSize: "var(--fs-mono-meta)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
            aria-label="Start a new conversation"
          >
            New
          </button>
        </form>
      </div>

      {threads.length === 0 ? (
        <p
          style={{
            fontSize: "var(--fs-body-sm)",
            color: "var(--muted)",
            margin: 0,
          }}
        >
          No threads yet.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-4)",
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
                  style={{
                    display: "block",
                    padding: "var(--sp-10) var(--sp-12)",
                    borderRadius: "var(--r-md)",
                    background: isActive
                      ? "var(--surface-warm)"
                      : "transparent",
                    borderLeft: isActive
                      ? "3px solid var(--brand-gold)"
                      : "3px solid transparent",
                    color: "var(--ink)",
                    textDecoration: "none",
                    transition: "background 120ms",
                  }}
                >
                  <div
                    style={{
                      fontSize: "var(--fs-body-sm)",
                      color: isActive ? "var(--ink)" : "var(--ink-soft)",
                      fontWeight: isActive ? 600 : 400,
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
                      fontSize: "var(--fs-mono-meta)",
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
