/**
 * apps/web/components/chat/ThreadList.tsx
 *
 * Server Component. Renders the left-rail list of recent chat threads
 * with full CRUD: hover kebab → popover with Rename / Archive / Delete,
 * inline rename input, and a collapsible "Archived" group below the
 * active list. Per-row interactivity lives in `./ThreadRow.tsx` (client
 * island) so the surrounding rail can stay on the server.
 *
 * Visual: 268px rail, quiet "CHATS" eyebrow, dashed-border "+ New chat"
 * ghost button, soft warm fill on the active item — no left-edge accent
 * stripe. Tuned to read as calm and scannable next to the messages pane.
 *
 * a11y:
 *   - `<nav>` with `aria-label="Chat threads"` so SR users can jump.
 *   - Active thread carries `aria-current="page"`.
 *   - "New conversation" is a real Server Action form (no client JS).
 *   - The archive group is a real `<details>`/`<summary>` collapsible,
 *     keyboard-navigable for free.
 *
 * Owner: [Cluster C · Forge]
 */

import type { ChatThreadRow } from "@/lib/chat/types";
import { createThread } from "@/app/app/chat/new/action";

import { ThreadRow } from "./ThreadRow";
import { ArchivedThreadGroup } from "./ArchivedThreadGroup";

export interface ThreadListProps {
  activeThreads: ReadonlyArray<ChatThreadRow>;
  archivedThreads: ReadonlyArray<ChatThreadRow>;
  activeThreadId: string | null;
}

export function ThreadList({
  activeThreads,
  archivedThreads,
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

      {activeThreads.length === 0 ? (
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
          {activeThreads.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              isActive={t.id === activeThreadId}
              variant="active"
            />
          ))}
        </ul>
      )}

      {archivedThreads.length > 0 ? (
        <ArchivedThreadGroup
          threads={archivedThreads}
          activeThreadId={activeThreadId}
        />
      ) : null}
    </nav>
  );
}
