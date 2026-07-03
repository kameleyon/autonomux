"use client";

/**
 * apps/web/components/chat/ChatStream.tsx
 *
 * Client island for the active thread view.
 *
 * Layout model:
 *   - The chat surface is a frosted-white card on a fiery wash. The wrapper
 *     `<section>` lives inside `[threadId]/page.tsx`; this component owns the
 *     vertical column inside it.
 *   - Structure (pseudo):
 *       chat-section    — flex column, fills the parent section
 *         chat-scroller — flex: 1, overflow-y: auto, holds the turn list
 *           chat-stream — 820px centered turn list
 *         Composer     — OUTSIDE the scroller, stays pinned to the bottom
 *
 * Visual model:
 *   - AI turns: full-width prose inside a soft cream panel.
 *   - User turns: right-aligned warm-tinted bubble, max 70% width, rounded.
 *   - Sub-agent result cards render full-width inside the AI body.
 *   - All turn content centers in an 820px column.
 *   - Hovering a turn reveals an action menu:
 *       user      → Copy, Edit, Delete
 *       assistant → Copy, Regenerate, Share
 *     Buttons whose callback wasn't provided are hidden, so the menu degrades
 *     gracefully until the parent wires the server actions.
 *
 * Responsibilities:
 *   - Hydrate from server-loaded `initialMessages` (immutable across renders).
 *   - On Composer submit: optimistic-append the user turn, open the SSE
 *     POST stream, accumulate events into an in-flight assistant message.
 *   - Mount an ARIA-live="polite" region for the streaming text (SC 4.1.3).
 *   - Auto-scroll to bottom on user submit AND on every streaming delta,
 *     unless the user has scrolled up to read history.
 *   - On unmount: abort the in-flight fetch so the server writes
 *     `agent_runs.status='cancelled'`.
 *
 * Owner: [Cluster C · Vega + Forge + Halo]
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Composer } from "./Composer";
import { SubAgentCard } from "./SubAgentCard";
import type { ComposerSubmitPayload } from "./Composer";
import { openChatStream } from "@/lib/chat/sse-client";
import type {
  ChatMessageRow,
  OrchestratorEvent,
  StoredContentBlock,
  SubAgentName,
  SubAgentResultPayload,
} from "@/lib/chat/types";

export interface ChatStreamProps {
  threadId: string;
  initialMessages: ReadonlyArray<ChatMessageRow>;
  /** Optional. Edit a persisted user message; if absent, the Edit button hides. */
  onEditMessage?: (messageDbId: string, newText: string) => void | Promise<void>;
  /** Optional. Delete a persisted message from history; absent → button hides. */
  onDeleteMessage?: (messageDbId: string) => void | Promise<void>;
  /** Optional. Regenerate an assistant turn from the prior user turn. */
  onRegenerateMessage?: (messageDbId: string) => void | Promise<void>;
}

// ── In-memory message shape ─────────────────────────────────────────────
// Distinct from `ChatMessageRow` because the in-flight assistant turn
// doesn't have a DB id yet; we identify it by `clientId`. The `dbId`
// field is set for messages hydrated from history and stays null for
// optimistic / in-flight turns.

interface UiMessage {
  clientId: string;
  /** Database row id when this turn was loaded from history; null otherwise. */
  dbId: string | null;
  /** "user" | "assistant" — `system`/`tool` rows are filtered out of the UI. */
  role: "user" | "assistant";
  blocks: StoredContentBlock[];
  /** Tracks in-flight sub-agent invocations awaiting their result event. */
  pendingSubAgents: PendingSubAgent[];
  /** Epoch ms when this turn started — drives the timestamp next to the role label. */
  createdAt: number;
}

interface PendingSubAgent {
  invocationId: string;
  subAgent: SubAgentName;
  /** Latest sub_agent_progress message for this invocation, if any. */
  progress?: string;
}

/* ──────────────────────────────────────────────────────────────────────
 * Stable identities for ReactMarkdown.
 *
 * Passing fresh `remarkPlugins={[...]}` / `components={{...}}` literals on
 * every render forces ReactMarkdown to rebuild its plugin pipeline and
 * component map on every token delta. During a 60-token-per-second stream
 * that thrashes React's scheduler hard enough to dump scheduler frames
 * (the `postMessage`/`unstable_scheduleCallback` loops in the trace).
 * Hoisting these to module scope means ReactMarkdown sees the same
 * references and only re-renders for actual content changes.
 * ────────────────────────────────────────────────────────────────────── */
const MD_PLUGINS = [remarkGfm];

const MD_COMPONENTS: Components = {
  p: ({ children }) => (
    <p style={{ margin: "0 0 var(--sp-8) 0" }}>{children}</p>
  ),
  h1: ({ children }) => (
    <h2 style={{ fontSize: "var(--fs-h-step)", margin: "var(--sp-12) 0 var(--sp-8)" }}>{children}</h2>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: "var(--fs-h-step)", margin: "var(--sp-12) 0 var(--sp-8)" }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: "var(--fs-body-lg)", fontWeight: 600, margin: "var(--sp-10) 0 var(--sp-6)" }}>{children}</h3>
  ),
  ul: ({ children }) => (
    <ul style={{ margin: "0 0 var(--sp-8) 0", paddingLeft: "var(--sp-20)" }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: "0 0 var(--sp-8) 0", paddingLeft: "var(--sp-20)" }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li style={{ margin: "var(--sp-4) 0" }}>{children}</li>
  ),
  code: ({ children }) => (
    <code style={{
      fontFamily: "DM Mono, monospace",
      fontSize: "0.92em",
      background: "rgba(0,0,0,0.06)",
      padding: "0.1em 0.35em",
      borderRadius: "var(--r-sm)",
    }}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre style={{
      fontFamily: "DM Mono, monospace",
      fontSize: "var(--fs-body-sm)",
      background: "rgba(0,0,0,0.06)",
      padding: "var(--sp-12)",
      borderRadius: "var(--r-md)",
      overflow: "auto",
      margin: "var(--sp-8) 0",
    }}>{children}</pre>
  ),
  a: ({ href, children }) => (
    <a href={href ?? "#"} style={{ color: "var(--brand-orange)" }}>{children}</a>
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 600 }}>{children}</strong>
  ),
};

/* ──────────────────────────────────────────────────────────────────────
 * Emoji enforcement.
 *
 * The system prompt forbids emoji in the strongest terms, but a prompt is a
 * request, not a guarantee — the model violates it intermittently. This is
 * the hard contract: strip every emoji code point before it reaches the DOM,
 * so it is structurally impossible for an emoji to render in an assistant
 * bubble (live stream OR reloaded history) regardless of what the model emits.
 *
 * Covers pictographics, regional-indicator flags, skin-tone modifiers, the
 * ZWJ / variation selectors that glue sequences together, and keycap marks.
 * After removal we tidy the whitespace the emoji left behind (doubled spaces,
 * a space stranded before punctuation, trailing line whitespace).
 * ────────────────────────────────────────────────────────────────────── */
function stripEmoji(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "") // regional indicators (flags)
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "") // skin-tone modifiers
    .replace(/[‍︎️⃣]/gu, "") // ZWJ + variation selectors + keycap
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,!?;:])/g, "$1")
    .replace(/[ \t]+$/gm, "");
}

function fromHistory(row: ChatMessageRow): UiMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  return {
    clientId: `db-${row.id}`,
    dbId: row.id,
    role: row.role,
    blocks: Array.isArray(row.content_blocks) ? row.content_blocks : [],
    pendingSubAgents: [],
    createdAt: new Date(row.created_at).getTime(),
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Empty-state prompt chips.
 *
 * Four starter prompts inviting the user into the most-wired sub-agents
 * (Mailroom + Scheduler). Each chip carries a short title and a longer
 * `prompt` that becomes the seed message when clicked.
 * ────────────────────────────────────────────────────────────────────── */
interface PromptChip {
  readonly title: string;
  readonly subtitle: string;
  readonly prompt: string;
}

const EMPTY_CHIPS: ReadonlyArray<PromptChip> = [
  {
    title: "Triage my inbox",
    subtitle: "Pull the last 24 hours and rank by importance.",
    prompt:
      "Triage my inbox. Pull the last 24 hours and rank by importance.",
  },
  {
    title: "What's on my calendar today?",
    subtitle: "Show me today and tomorrow, flag any conflicts.",
    prompt:
      "What's on my calendar today? Show me today and tomorrow, and flag any conflicts.",
  },
  {
    title: "Summarize unread emails",
    subtitle: "Surface what changed since I last looked.",
    prompt:
      "Summarize my unread emails. Surface what changed since I last looked.",
  },
  {
    title: "Show my mailroom rules",
    subtitle: "List the active triage rules and what they do.",
    prompt:
      "Show my mailroom rules. List the active triage rules and what they do.",
  },
];

export function ChatStream({
  threadId,
  initialMessages,
  onEditMessage,
  onDeleteMessage,
  onRegenerateMessage,
}: ChatStreamProps): React.ReactElement {
  const initialUi = useMemo<UiMessage[]>(
    () =>
      initialMessages
        .map(fromHistory)
        .filter((m): m is UiMessage => m !== null),
    [initialMessages],
  );

  const [messages, setMessages] = useState<UiMessage[]>(initialUi);
  const [inFlight, setInFlight] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** clientId of the message currently in inline-edit mode, or null. */
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  // AbortController for the active SSE fetch; ref so we can call abort()
  // from unmount cleanup without re-running the effect.
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  // Tracks whether THIS run is the first message in the thread so we can
  // force the AI's birth into view (otherwise a long initial reply can
  // render below the fold).
  const isFirstTurnRef = useRef(initialUi.length === 0);

  // ── Auto-scroll ─────────────────────────────────────────────────────
  // Track whether the user is pinned near the bottom; if they scrolled
  // up to read older messages, don't yank them back when new content
  // appends.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el === null) return;
    const handler = (): void => {
      const distanceFromBottom =
        el.scrollHeight - (el.scrollTop + el.clientHeight);
      userScrolledUpRef.current = distanceFromBottom > 80;
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  // Layout effect so the scroll happens before paint — kills the "first
  // assistant turn flashes below the fold" race on slow machines.
  useLayoutEffect(() => {
    if (userScrolledUpRef.current && !isFirstTurnRef.current) return;
    const el = scrollerRef.current;
    if (el === null) return;
    // Smooth scroll on user/assistant turn-add; instant for token-by-token
    // appends (otherwise the smooth animation queues and lags the cursor).
    el.scrollTo({
      top: el.scrollHeight,
      behavior: messages.length > 0 && inFlight ? "auto" : "smooth",
    });
    if (isFirstTurnRef.current && messages.length > 0) {
      isFirstTurnRef.current = false;
    }
  }, [messages, inFlight]);

  // ── Cleanup on unmount → cancel server stream ────────────────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Submit handler ──────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (payload: ComposerSubmitPayload): void => {
      if (inFlight) return;
      setErrorMsg(null);

      void (async () => {
        // Read text attachments inline so the LLM can act on them.
        // Images / PDFs are listed by filename for now; full vision wiring
        // lands when we plumb Anthropic content blocks through the LLM
        // adapter. Server-side route will receive the same fold.
        const textParts: string[] = [];
        if (payload.text.length > 0) textParts.push(payload.text);
        const attachmentLabels: string[] = [];
        for (const f of payload.attachments) {
          if (
            f.type.startsWith("text/") ||
            f.type === "application/json"
          ) {
            try {
              const content = await f.text();
              textParts.push(
                `\n\n--- attached: ${f.name} (${formatBytes(f.size)}) ---\n${content}\n--- end ${f.name} ---`,
              );
            } catch {
              attachmentLabels.push(`[unreadable: ${f.name}]`);
            }
          } else {
            attachmentLabels.push(`[${f.type || "file"}: ${f.name} · ${formatBytes(f.size)}]`);
          }
        }
        if (attachmentLabels.length > 0) {
          textParts.push(`\n\nAttachments (not yet readable by AlterEgo): ${attachmentLabels.join(", ")}`);
        }
        const userText = textParts.join("");
        if (userText.length === 0) return;

        const now = Date.now();
        const userMsg: UiMessage = {
          clientId: `user-${now}`,
          dbId: null,
          role: "user",
          blocks: [{ type: "text", text: userText }],
          pendingSubAgents: [],
          createdAt: now,
        };
        const assistantMsg: UiMessage = {
          clientId: `assistant-${now}`,
          dbId: null,
          role: "assistant",
          blocks: [{ type: "text", text: "" }],
          pendingSubAgents: [],
          createdAt: now,
        };

        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        setInFlight(true);
        userScrolledUpRef.current = false;

        // Explicit scroll on submit so the user sees their own message
        // before the SSE delta loop fires. The useLayoutEffect above also
        // runs, but on slow renders the rAF-deferred scroll guarantees the
        // bottom is reached after the freshly-appended turn is in the DOM.
        requestAnimationFrame(() => {
          const el = scrollerRef.current;
          if (el === null) return;
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        });

        const ac = new AbortController();
        abortRef.current = ac;

        try {
          for await (const event of openChatStream(
            { threadId, userMessage: userText },
            { signal: ac.signal },
          )) {
            applyEvent(setMessages, assistantMsg.clientId, event);
            if (event.type === "error") {
              setErrorMsg(event.message);
            }
          }
        } catch (err) {
          if ((err as Error)?.name !== "AbortError") {
            setErrorMsg(
              (err as Error)?.message ??
                "Could not reach AlterEgo. Try again in a moment.",
            );
          }
        } finally {
          setInFlight(false);
          if (abortRef.current === ac) abortRef.current = null;
        }
      })();
    },
    [inFlight, threadId],
  );

  const handleChipClick = useCallback(
    (prompt: string): void => {
      handleSubmit({ text: prompt, attachments: [] });
    },
    [handleSubmit],
  );

  // Cancel the in-flight stream. Aborting the fetch tears down the SSE
  // connection, which the server observes as `request.signal.aborted` and
  // uses to stop the orchestrator + mark the run cancelled (no orphan charge).
  // The for-await loop throws AbortError → the finally clears inFlight.
  const handleStop = useCallback((): void => {
    abortRef.current?.abort();
  }, []);

  // ── Inline-edit handlers ───────────────────────────────────────────
  // Edit-mode is exclusive: only one bubble is editable at a time. The
  // textarea writes a new text-block back into the UI immediately for
  // optimistic feedback, then the parent's server-action callback runs
  // to persist the change.
  const handleEnterEdit = useCallback((clientId: string): void => {
    setEditingClientId(clientId);
  }, []);
  const handleCancelEdit = useCallback((): void => {
    setEditingClientId(null);
  }, []);
  const handleSaveEdit = useCallback(
    (clientId: string, newText: string): void => {
      const target = messages.find((m) => m.clientId === clientId) ?? null;
      const trimmed = newText.trim();
      if (target === null || trimmed.length === 0) {
        setEditingClientId(null);
        return;
      }
      // Optimistic: replace the first text block with the new text.
      setMessages((prev) =>
        prev.map((m) => {
          if (m.clientId !== clientId) return m;
          const blocks: StoredContentBlock[] = [];
          let replaced = false;
          for (const b of m.blocks) {
            if (!replaced && b.type === "text") {
              blocks.push({ type: "text", text: trimmed });
              replaced = true;
            } else {
              blocks.push(b);
            }
          }
          if (!replaced) blocks.unshift({ type: "text", text: trimmed });
          return { ...m, blocks };
        }),
      );
      setEditingClientId(null);
      // Fire the parent's persistence callback if both the prop and a
      // DB id are present. Optimistic update stays even if the server
      // call is slow; the parent is responsible for surfacing failures
      // (will arrive in a later sprint).
      if (target.dbId !== null && onEditMessage !== undefined) {
        void Promise.resolve(onEditMessage(target.dbId, trimmed)).catch(() => {
          // Server failure handling lives upstream; swallowing here keeps
          // the UI responsive rather than reverting silently mid-thread.
        });
      }
    },
    [messages, onEditMessage],
  );

  const handleDelete = useCallback(
    (clientId: string): void => {
      const target = messages.find((m) => m.clientId === clientId) ?? null;
      if (target === null) return;
      // Optimistic removal from the UI list.
      setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
      if (target.dbId !== null && onDeleteMessage !== undefined) {
        void Promise.resolve(onDeleteMessage(target.dbId)).catch(() => {
          // Same posture as edit — UI moves forward; the parent surfaces errors.
        });
      }
    },
    [messages, onDeleteMessage],
  );

  const handleRegenerate = useCallback(
    (clientId: string): void => {
      const target = messages.find((m) => m.clientId === clientId) ?? null;
      if (target === null || target.dbId === null) return;
      if (onRegenerateMessage === undefined) return;
      void Promise.resolve(onRegenerateMessage(target.dbId)).catch(() => {
        // No-op: parent owns failure surfacing.
      });
    },
    [messages, onRegenerateMessage],
  );

  const lastClientId =
    messages.length > 0 ? (messages[messages.length - 1]?.clientId ?? null) : null;

  return (
    <div className="chat-section">
      {/* Live region for SR-only stream announcements. */}
      <div
        ref={scrollerRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        className="chat-scroller"
      >
        {messages.length === 0 ? (
          <EmptyConversationHint onChipClick={handleChipClick} />
        ) : (
          <div className="chat-stream">
            {messages.map((m) => {
              // An assistant message with no text and no sub-agent state yet
              // is the "thinking" phase — render the typing indicator inline
              // in the same slot the body would occupy.
              const hasText = m.blocks.some(
                (b) => b.type === "text" && b.text.length > 0,
              );
              const hasResults = m.blocks.some(
                (b) => b.type === "sub_agent_result",
              );
              if (
                m.role === "assistant" &&
                !hasText &&
                !hasResults &&
                m.pendingSubAgents.length === 0
              ) {
                return (
                  <ThinkingTurn key={m.clientId} createdAt={m.createdAt} />
                );
              }
              const isStreamingTail =
                m.role === "assistant" &&
                inFlight &&
                m.clientId === lastClientId;
              const isEditing = editingClientId === m.clientId;
              return (
                <MessageTurn
                  key={m.clientId}
                  message={m}
                  isStreamingTail={isStreamingTail}
                  isEditing={isEditing}
                  canEdit={
                    m.role === "user" &&
                    m.dbId !== null &&
                    onEditMessage !== undefined
                  }
                  canDelete={
                    m.dbId !== null && onDeleteMessage !== undefined
                  }
                  canRegenerate={
                    m.role === "assistant" &&
                    m.dbId !== null &&
                    onRegenerateMessage !== undefined
                  }
                  onEnterEdit={handleEnterEdit}
                  onCancelEdit={handleCancelEdit}
                  onSaveEdit={handleSaveEdit}
                  onDelete={handleDelete}
                  onRegenerate={handleRegenerate}
                />
              );
            })}
          </div>
        )}
      </div>

      {errorMsg !== null ? (
        <div
          role="alert"
          style={{
            margin: "0 var(--sp-24) var(--sp-12) var(--sp-24)",
            padding: "var(--sp-10) var(--sp-12)",
            borderRadius: "var(--r-md)",
            background: "var(--alert-bg)",
            color: "var(--alert-c)",
            fontSize: "var(--fs-body-sm)",
          }}
        >
          {errorMsg}
        </div>
      ) : null}

      <Composer disabled={inFlight} onSubmit={handleSubmit} onStop={handleStop} />
    </div>
  );
}

// ── Event reducer ───────────────────────────────────────────────────────

function applyEvent(
  setMessages: React.Dispatch<React.SetStateAction<UiMessage[]>>,
  assistantClientId: string,
  event: OrchestratorEvent,
): void {
  setMessages((prev) =>
    prev.map((m) => {
      if (m.clientId !== assistantClientId) return m;
      return reduceAssistant(m, event);
    }),
  );
}

function reduceAssistant(msg: UiMessage, event: OrchestratorEvent): UiMessage {
  /* The orchestrator's wire shape uses `text`/`sub_agent_name`/`tool_use_id`;
   * the local OrchestratorEvent mirror in lib/chat/types.ts used to call
   * them `delta`/`sub_agent`/`invocation_id`. We read both spellings so the
   * UI stays compatible across older/newer event shapes. */
  type WireEvent = OrchestratorEvent & {
    delta?: string;
    text?: string;
    sub_agent?: SubAgentName;
    sub_agent_name?: string;
    invocation_id?: string;
    tool_use_id?: string;
    content?: unknown;
    result?: SubAgentResultPayload;
  };
  const e = event as WireEvent;

  switch (event.type) {
    case "text_delta": {
      const delta = e.text ?? e.delta ?? "";
      if (delta.length === 0) return msg;
      const blocks = [...msg.blocks];
      const last = blocks[blocks.length - 1];
      if (last !== undefined && last.type === "text") {
        blocks[blocks.length - 1] = {
          type: "text",
          text: last.text + delta,
        };
      } else {
        blocks.push({ type: "text", text: delta });
      }
      return { ...msg, blocks };
    }
    case "sub_agent_start": {
      const invocationId = e.tool_use_id ?? e.invocation_id ?? "unknown";
      const subAgent = (e.sub_agent_name ?? e.sub_agent ?? "mailroom") as SubAgentName;
      return {
        ...msg,
        pendingSubAgents: [
          ...msg.pendingSubAgents,
          { invocationId, subAgent },
        ],
      };
    }
    case "sub_agent_progress": {
      // Live feedback contract: surface the latest progress line on the
      // matching pending sub-agent card. Match by invocation id; fall back to
      // sub-agent name so a progress event that predates the start event (or
      // omits the id) still lands somewhere visible.
      const invocationId = e.tool_use_id ?? e.invocation_id ?? null;
      const progressName = e.sub_agent_name ?? e.sub_agent ?? null;
      const message = (e as { message?: string }).message ?? "";
      if (message.length === 0) return msg;
      return {
        ...msg,
        pendingSubAgents: msg.pendingSubAgents.map((p) =>
          (invocationId !== null && p.invocationId === invocationId) ||
          (invocationId === null && p.subAgent === progressName)
            ? { ...p, progress: message }
            : p,
        ),
      };
    }
    case "sub_agent_result": {
      const invocationId = e.tool_use_id ?? e.invocation_id ?? "unknown";
      const subAgent = (e.sub_agent_name ?? e.sub_agent ?? "mailroom") as SubAgentName;
      const result = (e.result ?? e.content) as SubAgentResultPayload;
      const block: StoredContentBlock = {
        type: "sub_agent_result",
        sub_agent: subAgent,
        result,
      };
      return {
        ...msg,
        blocks: [...msg.blocks, block],
        pendingSubAgents: msg.pendingSubAgents.filter(
          (p) => p.invocationId !== invocationId,
        ),
      };
    }
    case "final_usage": {
      return msg;
    }
    case "error": {
      return msg;
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function plainTextOf(message: UiMessage): string {
  // Flatten the message into a copy-able string. User turns are a single
  // text block; assistant turns may interleave text + sub-agent results
  // (the latter we skip — the structured cards copy nothing meaningful).
  const parts: string[] = [];
  for (const b of message.blocks) {
    if (b.type === "text") {
      parts.push(message.role === "assistant" ? stripEmoji(b.text) : b.text);
    }
  }
  return parts.join("\n").trim();
}

function firstTextBlockText(message: UiMessage): string {
  for (const b of message.blocks) {
    if (b.type === "text") return b.text;
  }
  return "";
}

// ── Visual subcomponents ────────────────────────────────────────────────

interface MessageTurnProps {
  readonly message: UiMessage;
  readonly isStreamingTail: boolean;
  readonly isEditing: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canRegenerate: boolean;
  readonly onEnterEdit: (clientId: string) => void;
  readonly onCancelEdit: () => void;
  readonly onSaveEdit: (clientId: string, newText: string) => void;
  readonly onDelete: (clientId: string) => void;
  readonly onRegenerate: (clientId: string) => void;
}

const MessageTurn = memo(
  MessageTurnRaw,
  (a, b) =>
    a.message === b.message &&
    a.isStreamingTail === b.isStreamingTail &&
    a.isEditing === b.isEditing &&
    a.canEdit === b.canEdit &&
    a.canDelete === b.canDelete &&
    a.canRegenerate === b.canRegenerate,
);

function MessageTurnRaw({
  message,
  isStreamingTail,
  isEditing,
  canEdit,
  canDelete,
  canRegenerate,
  onEnterEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onRegenerate,
}: MessageTurnProps): React.ReactElement {
  const isUser = message.role === "user";

  // Per-action feedback flags. Each is a transient bool that flips true on
  // success and clears after ~1.4s so the user gets a visual confirmation
  // without us reaching for a toast system.
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopy = useCallback((): void => {
    const text = plainTextOf(message);
    if (text.length === 0) return;
    if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
      return;
    }
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {
        // Clipboard permission denied or unavailable — silent no-op rather
        // than a toast; the user can re-select the text manually.
      });
  }, [message]);

  const handleShare = useCallback((): void => {
    if (typeof window === "undefined" || message.dbId === null) return;
    const url =
      window.location.origin +
      window.location.pathname +
      `#msg-${message.dbId}`;
    if (navigator.clipboard === undefined) return;
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1400);
      })
      .catch(() => {
        // Same posture as Copy — silent fail keeps the UI calm.
      });
  }, [message.dbId]);

  return (
    <article
      id={message.dbId !== null ? `msg-${message.dbId}` : undefined}
      data-role={message.role}
      className="chat-turn msg-anim"
    >
      <div className="chat-turn-meta">
        <span
          className={
            isUser
              ? "chat-turn-label-you"
              : "chat-turn-label-alterego"
          }
        >
          {isUser ? "You" : "AlterEgo"}
        </span>
        <span suppressHydrationWarning className="chat-turn-meta-time">
          {formatTime(message.createdAt)}
        </span>
      </div>

      {isEditing && isUser ? (
        <EditBubble
          initialText={firstTextBlockText(message)}
          onCancel={onCancelEdit}
          onSave={(t) => onSaveEdit(message.clientId, t)}
        />
      ) : (
        <div
          className={
            isUser ? "chat-turn-body--user" : "chat-turn-body--assistant"
          }
        >
          {message.blocks.map((b, idx) =>
            b.type === "text" ? (
              <TextBlock
                key={idx}
                role={message.role}
                text={b.text}
                showCursor={
                  isStreamingTail && idx === lastTextBlockIndex(message.blocks)
                }
              />
            ) : (
              <div key={idx} className="card-anim" style={{ width: "100%" }}>
                <SubAgentCard
                  invocationId={`hist-${idx}`}
                  subAgent={b.sub_agent}
                  result={b.result as SubAgentResultPayload}
                />
              </div>
            ),
          )}
          {/* In-flight sub-agent skeleton card(s). */}
          {message.pendingSubAgents.map((p) => (
            <div key={p.invocationId} className="card-anim" style={{ width: "100%" }}>
              <SubAgentCard
                invocationId={p.invocationId}
                subAgent={p.subAgent}
                progress={p.progress}
              />
            </div>
          ))}
        </div>
      )}

      {/* Action row — fades in on hover. Suppressed while the assistant is
          still streaming (copying a half-written reply is rarely useful and
          a flashing button mid-stream feels noisy) and while the bubble is
          in edit mode (the textarea provides Save / Cancel inline). */}
      {!isStreamingTail && !isEditing ? (
        <div className="msg-actions" aria-label="Message actions">
          <button
            type="button"
            className={
              "msg-action-btn" + (copied ? " msg-action-btn--feedback" : "")
            }
            onClick={handleCopy}
            title={copied ? "Copied" : "Copy"}
            aria-label={copied ? "Copied" : "Copy message"}
          >
            <span aria-hidden="true">{"⧉"}</span>
          </button>
          {isUser ? (
            <>
              {canEdit ? (
                <button
                  type="button"
                  className="msg-action-btn"
                  onClick={() => onEnterEdit(message.clientId)}
                  title="Edit"
                  aria-label="Edit message"
                >
                  <span aria-hidden="true">{"✎"}</span>
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="msg-action-btn"
                  onClick={() => onDelete(message.clientId)}
                  title="Delete"
                  aria-label="Delete message"
                >
                  <span aria-hidden="true">{"✕"}</span>
                </button>
              ) : null}
            </>
          ) : (
            <>
              {canRegenerate ? (
                <button
                  type="button"
                  className="msg-action-btn"
                  onClick={() => onRegenerate(message.clientId)}
                  title="Regenerate"
                  aria-label="Regenerate response"
                >
                  <span aria-hidden="true">{"↻"}</span>
                </button>
              ) : null}
              <button
                type="button"
                className={
                  "msg-action-btn" +
                  (linkCopied ? " msg-action-btn--feedback" : "")
                }
                onClick={handleShare}
                title={linkCopied ? "Link copied" : "Share"}
                aria-label={linkCopied ? "Link copied" : "Copy shareable link"}
              >
                <span aria-hidden="true">{"↗"}</span>
              </button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

function lastTextBlockIndex(blocks: ReadonlyArray<StoredContentBlock>): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i]?.type === "text") return i;
  }
  return -1;
}

function TextBlock({
  role,
  text,
  showCursor,
}: {
  role: "user" | "assistant";
  text: string;
  showCursor: boolean;
}): React.ReactElement | null {
  if (role === "user") {
    // User text is the user's own words — render verbatim (their emoji
    // are their choice). Only AlterEgo output is stripped.
    return <p>{text}</p>;
  }
  const safe = stripEmoji(text);
  if (safe.length === 0 && !showCursor) return null;
  return (
    <>
      {safe.length > 0 ? (
        <ReactMarkdown remarkPlugins={MD_PLUGINS} components={MD_COMPONENTS}>
          {safe}
        </ReactMarkdown>
      ) : null}
      {showCursor ? (
        <span
          className="streaming-cursor"
          aria-hidden="true"
          data-testid="streaming-cursor"
        />
      ) : null}
    </>
  );
}

interface EditBubbleProps {
  readonly initialText: string;
  readonly onCancel: () => void;
  readonly onSave: (newText: string) => void;
}

/**
 * Inline-editable user bubble. Auto-focuses on mount; closes on Esc
 * (cancel) and Cmd/Ctrl+Enter (save). Save button is visually primary
 * (brand orange), Cancel is a ghost.
 */
function EditBubble({
  initialText,
  onCancel,
  onSave,
}: EditBubbleProps): React.ReactElement {
  const [draft, setDraft] = useState(initialText);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (ta === null) return;
    ta.focus();
    // Auto-size the textarea to its content on mount.
    ta.style.height = "auto";
    ta.style.height = `${Math.min(Math.max(ta.scrollHeight, 60), 300)}px`;
    // Move the caret to the end so the user can keep typing.
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
  }, []);

  // Re-grow on every keystroke.
  useEffect(() => {
    const ta = taRef.current;
    if (ta === null) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(Math.max(ta.scrollHeight, 60), 300)}px`;
  }, [draft]);

  const trimmed = draft.trim();
  const dirty = trimmed.length > 0 && trimmed !== initialText.trim();

  return (
    <div className="chat-turn-body--user chat-turn-body--editing">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
            return;
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (dirty) onSave(trimmed);
            else onCancel();
          }
        }}
        className="chat-turn-edit-textarea"
        aria-label="Edit message"
        rows={1}
      />
      <div className="chat-turn-edit-actions">
        <button
          type="button"
          className="chat-turn-edit-btn chat-turn-edit-btn--ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="chat-turn-edit-btn chat-turn-edit-btn--primary"
          onClick={() => {
            if (dirty) onSave(trimmed);
            else onCancel();
          }}
          disabled={!dirty}
          aria-disabled={!dirty}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Thinking turn — same outer shell as a message turn, dots inline. */
function ThinkingTurn({
  createdAt,
}: {
  createdAt: number;
}): React.ReactElement {
  return (
    <article data-role="assistant" className="chat-turn msg-anim">
      <div className="chat-turn-meta">
        <span className="chat-turn-label-alterego">AlterEgo</span>
        <span suppressHydrationWarning className="chat-turn-meta-time">
          {formatTime(createdAt)}
        </span>
        <span
          className="typing-dots typing-dots--on-wash"
          aria-label="AlterEgo is thinking"
        >
          <span />
          <span />
          <span />
        </span>
      </div>
    </article>
  );
}

function EmptyConversationHint({
  onChipClick,
}: {
  onChipClick: (prompt: string) => void;
}): React.ReactElement {
  return (
    <div className="chat-empty">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-12)" }}>
        <h1 className="chat-empty-hero">
          What can <em>I</em> help with?
        </h1>
        <p className="chat-empty-sub">
          Mailroom and Scheduler are wired. Ask AlterEgo to do something.
        </p>
      </div>
      <div className="chat-empty-chips">
        {EMPTY_CHIPS.map((chip) => (
          <button
            key={chip.title}
            type="button"
            className="chat-chip"
            onClick={() => onChipClick(chip.prompt)}
          >
            <span className="chat-chip-title">{chip.title}</span>
            <span className="chat-chip-sub">{chip.subtitle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
