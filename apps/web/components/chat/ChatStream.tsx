"use client";

/**
 * apps/web/components/chat/ChatStream.tsx
 *
 * Client island for the active thread view.
 *
 * Visual model (2026 refresh):
 *   - The chat surface is a frosted-white card on a fiery wash. Inside the
 *     card text is dark ink.
 *   - AI turns: full-width prose, no bubble, no border, no shadow. A small
 *     "ALTEREGO" label sits above the body with a timestamp.
 *   - User turns: right-aligned cream-tinted bubble, max 70% width. A small
 *     "YOU" label sits above the bubble with a timestamp.
 *   - Sub-agent result cards render full-width inside the AI body.
 *   - All turn content is centered in an 820px column.
 *   - Hovering a turn reveals a Copy (and Regenerate, on AI turns) action.
 *
 * Responsibilities:
 *   - Hydrate from server-loaded `initialMessages` (immutable across renders).
 *   - On Composer submit: optimistic-append the user turn, open the SSE
 *     POST stream, accumulate events into an in-flight assistant message.
 *   - Mount an ARIA-live="polite" region for the streaming text (SC 4.1.3).
 *   - Auto-scroll to bottom unless the user scrolled up to read history.
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

  const handleChipClick = useCallback(
    (prompt: string): void => {
      handleSubmit({ text: prompt, attachments: [] });
    },
    [handleSubmit],
  );

  const lastClientId =
    messages.length > 0 ? (messages[messages.length - 1]?.clientId ?? null) : null;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {/* Live region for SR-only stream announcements. */}
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
          minHeight: 0,
        }}
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
              return (
                <MessageTurn
                  key={m.clientId}
                  message={m}
                  isStreamingTail={isStreamingTail}
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

// ── Visual subcomponents ────────────────────────────────────────────────

interface MessageTurnProps {
  readonly message: UiMessage;
  readonly isStreamingTail: boolean;
}

const MessageTurn = memo(
  MessageTurnRaw,
  (a, b) =>
    a.message === b.message && a.isStreamingTail === b.isStreamingTail,
);

function MessageTurnRaw({
  message,
  isStreamingTail,
}: MessageTurnProps): React.ReactElement {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

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

  const handleRegenerate = useCallback((): void => {
    // Regeneration wiring lands when the orchestrator supports a
    // turn-replay event. For now the button must render so the layout
    // doesn't shift when the feature flips on.
    // eslint-disable-next-line no-console
    console.log("regenerate not yet wired");
  }, []);

  return (
    <article
      data-role={message.role}
      className="chat-turn msg-anim"
    >
      <div className="chat-turn-meta">
        <span
          className={
            isUser
              ? "chat-turn-meta-label--user"
              : "chat-turn-meta-label--assistant"
          }
        >
          {isUser ? "You" : "AlterEgo"}
        </span>
        <span suppressHydrationWarning className="chat-turn-meta-time">
          {formatTime(message.createdAt)}
        </span>
      </div>

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
            <SubAgentCard invocationId={p.invocationId} subAgent={p.subAgent} />
          </div>
        ))}
      </div>

      {/* Action row — fades in on hover. Suppressed while the assistant is
          still streaming (copying a half-written reply is rarely useful and
          a flashing button mid-stream feels noisy). */}
      {!isStreamingTail ? (
        <div className="chat-turn-actions" aria-hidden={false}>
          <button
            type="button"
            className={
              "chat-turn-action" +
              (copied ? " chat-turn-action-feedback" : "")
            }
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy message"}
          >
            <span className="chat-turn-action-glyph" aria-hidden="true">
              {"⧉"}
            </span>
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          {!isUser ? (
            <button
              type="button"
              className="chat-turn-action"
              onClick={handleRegenerate}
              aria-label="Regenerate response"
            >
              <span className="chat-turn-action-glyph" aria-hidden="true">
                {"↻"}
              </span>
              <span>Regenerate</span>
            </button>
          ) : null}
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
        <span className="chat-turn-meta-label--assistant">AlterEgo</span>
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
