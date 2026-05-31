"use client";

/**
 * apps/web/components/chat/ChatStream.tsx
 *
 * Client island for the active thread view.
 *
 * Responsibilities:
 *   - Hydrate from the server-loaded `initialMessages` (history of the
 *     conversation; immutable across renders).
 *   - On Composer submit: optimistic-append the user turn, open the SSE
 *     POST stream (lib/chat/sse-client), and accumulate events into an
 *     in-flight assistant message (text deltas + inline SubAgentCards).
 *   - Mount an ARIA-live="polite" region for the streaming text (Halo
 *     requirement — SC 4.1.3 Status Messages).
 *   - Auto-scroll to bottom when the message list grows OR the in-flight
 *     text appends, UNLESS the user has scrolled up to read history
 *     (manual scroll suppression — never yank them back).
 *   - On unmount / route change: abort the in-flight fetch so the server
 *     fires `request.signal.aborted` and writes `agent_runs.status='cancelled'`.
 *
 * Owner: [Cluster C · Vega + Forge + Halo]
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
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
}

// ── In-memory message shape ─────────────────────────────────────────────
// Distinct from `ChatMessageRow` because the in-flight assistant turn
// doesn't have a DB id yet; we identify it by `clientId`.

interface UiMessage {
  clientId: string;
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
}

function fromHistory(row: ChatMessageRow): UiMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  return {
    clientId: `db-${row.id}`,
    role: row.role,
    blocks: Array.isArray(row.content_blocks) ? row.content_blocks : [],
    pendingSubAgents: [],
    createdAt: new Date(row.created_at).getTime(),
  };
}

export function ChatStream({
  threadId,
  initialMessages,
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

  // AbortController for the active SSE fetch; ref so we can call abort()
  // from unmount cleanup without re-running the effect.
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

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

  useEffect(() => {
    if (userScrolledUpRef.current) return;
    const el = scrollerRef.current;
    if (el === null) return;
    // Smooth scroll on user/assistant turn-add; instant for token-by-token
    // appends (otherwise the smooth animation queues and lags the cursor).
    el.scrollTo({
      top: el.scrollHeight,
      behavior: messages.length > 0 && inFlight ? "auto" : "smooth",
    });
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
          role: "user",
          blocks: [{ type: "text", text: userText }],
          pendingSubAgents: [],
          createdAt: now,
        };
        const assistantMsg: UiMessage = {
          clientId: `assistant-${now}`,
          role: "assistant",
          blocks: [{ type: "text", text: "" }],
          pendingSubAgents: [],
          createdAt: now,
        };

        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        setInFlight(true);
        userScrolledUpRef.current = false;

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

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {/* Live region for SR-only stream announcements. Visually-hidden
          summary of the last text-delta burst keeps verbosity sane. */}
      <div
        ref={scrollerRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--sp-24) var(--sp-24) var(--sp-12) var(--sp-24)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-16)",
          minHeight: 0,
        }}
      >
        {messages.length === 0 ? (
          <EmptyConversationHint />
        ) : (
          messages.map((m) => {
            // If this is an assistant message with no text yet AND no
            // sub-agents in flight, render a standalone "thinking" indicator
            // INSTEAD of an empty bubble.
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
              return <ThinkingIndicator key={m.clientId} createdAt={m.createdAt} />;
            }
            return <MessageBubble key={m.clientId} message={m} />;
          })
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

      <Composer disabled={inFlight} onSubmit={handleSubmit} />
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
      return msg;
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

// ── Visual subcomponents ────────────────────────────────────────────────

function MessageBubble({ message }: { message: UiMessage }): React.ReactElement {
  const isUser = message.role === "user";
  return (
    <article
      data-role={message.role}
      className="msg-anim"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: "var(--sp-8)",
      }}
    >
      <div
        className={
          "app-shell-bubble" + (isUser ? " app-shell-bubble--user" : "")
        }
        style={{
          maxWidth: "min(720px, 95%)",
          padding: "var(--sp-10) var(--sp-14)",
          borderRadius: "var(--r-xl)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--sp-8)",
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-mono-meta)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: "var(--sp-6)",
          }}
        >
          <span style={{ color: isUser ? "var(--brand-orange)" : "var(--muted)" }}>
            {isUser ? "You" : "AlterEgo"}
          </span>
          <span
            style={{
              color: "var(--muted)",
              letterSpacing: "0.06em",
              fontSize: "calc(var(--fs-mono-meta) * 0.92)",
              opacity: 0.7,
            }}
          >
            {formatTime(message.createdAt)}
          </span>
        </div>
        {message.blocks.map((b, idx) =>
          b.type === "text" ? (
            <div
              key={idx}
              className="msg-md"
              style={{
                fontSize: "var(--fs-body)",
                color: "var(--ink)",
                lineHeight: "var(--lh-body)",
              }}
            >
              {isUser ? (
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{b.text}</p>
              ) : b.text.length === 0 ? null : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
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
                  }}
                >
                  {b.text}
                </ReactMarkdown>
              )}
            </div>
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
            />
          </div>
        ))}
      </div>
    </article>
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

/** Thinking indicator — sits where the bubble WILL be, no bubble chrome. */
function ThinkingIndicator({
  createdAt,
}: {
  createdAt: number;
}): React.ReactElement {
  return (
    <div
      className="msg-anim"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-10)",
        paddingLeft: "var(--sp-4)",
      }}
    >
      <span
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: "var(--fs-mono-meta)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(255, 250, 245, 0.95)",
          textShadow: "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        AlterEgo
      </span>
      <span
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: "calc(var(--fs-mono-meta) * 0.92)",
          color: "rgba(255, 245, 235, 0.7)",
          letterSpacing: "0.06em",
          textShadow: "0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
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
  );
}

function EmptyConversationHint(): React.ReactElement {
  return (
    <div
      style={{
        margin: "auto",
        textAlign: "center",
        maxWidth: "440px",
        padding: "var(--sp-32)",
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
        Empty thread
      </p>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          margin: 0,
        }}
      >
        Type below to start your first conversation. Ask AlterEgo to triage
        your inbox, summarise a thread, or draft a reply.
      </p>
    </div>
  );
}
