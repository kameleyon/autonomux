/**
 * apps/web/components/chat/ArchivedThreadGroup.tsx
 *
 * Client island. Collapsible "Archived" group beneath the active thread
 * list. Hidden by default — clicking the eyebrow toggles disclosure.
 * Each row inside reuses `ThreadRow` in `variant="archived"` mode so the
 * styling + menu wiring stays in one place.
 *
 * Owner: [Cluster C · Forge]
 */

"use client";

import { useState } from "react";

import type { ChatThreadRow } from "@/lib/chat/types";

import { ThreadRow } from "./ThreadRow";

export interface ArchivedThreadGroupProps {
  threads: ReadonlyArray<ChatThreadRow>;
  activeThreadId: string | null;
}

export function ArchivedThreadGroup({
  threads,
  activeThreadId,
}: ArchivedThreadGroupProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      aria-label="Archived conversations"
      className="thread-actions-archive-group"
    >
      <button
        type="button"
        className="thread-actions-archive-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="thread-actions-archive-caret" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span>Archived ({threads.length})</span>
      </button>

      {expanded ? (
        <ul className="thread-actions-archive-list">
          {threads.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              isActive={t.id === activeThreadId}
              variant="archived"
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
