/**
 * apps/web/lib/chat/types.ts
 *
 * Local mirror of the `OrchestratorEvent` discriminated union from
 * `packages/orchestrator/src/events.ts` (Cluster A / Sprint D §1).
 *
 * The orchestrator package isn't wired into the workspace yet, so we keep
 * a local copy that the chat surface can compile against today. When
 * Cluster A lands, swap to:
 *
 *   import type { OrchestratorEvent } from "@autonomux/orchestrator/events";
 *
 * The shape MUST stay in lockstep with the orchestrator's emitted events
 * (text_delta / sub_agent_start / sub_agent_progress / sub_agent_result /
 *  final_usage / error) — see SPRINT_D_PLAN §1.
 *
 * Owner: [Cluster C · Forge + Vega]
 */

/**
 * Sub-agent identifier. Mailroom is the only sub-agent shipping this sprint;
 * the rest are placeholders so the registry & UI can extend without churn.
 * Mirrors `SubAgentName` in `packages/db/src/types.ts`.
 */
export type SubAgentName =
  | "mailroom"
  | "scheduler"
  | "scribe"
  | "oracle"
  | "treasurer"
  | "voice"
  | "companion";

/** Mailroom row shape — see SPRINT_D_PLAN §2 (mailroom-engine.ts output). */
export interface MailroomMessage {
  id: string;
  sender: string;
  subject: string;
  /** 1-5 inclusive (5 = highest). */
  importance: 1 | 2 | 3 | 4 | 5;
  proposed_action:
    | "reply"
    | "draft"
    | "archive"
    | "delete"
    | "snooze"
    | "label"
    | "escalate";
  reason: string;
}

export interface MailroomResult {
  kind: "mailroom";
  messages: MailroomMessage[];
}

/**
 * Sub-agent result payload — discriminated by `kind`. Adding a new
 * sub-agent (Scheduler, etc.) just adds another variant here and a
 * matching renderer in SubAgentCard.tsx.
 */
export type SubAgentResultPayload = MailroomResult;

// ── Event union ─────────────────────────────────────────────────────────

/** Streaming text delta from the orchestrator's reasoning. */
export interface TextDeltaEvent {
  type: "text_delta";
  /** Partial UTF-8 text to append. */
  delta: string;
}

/** A sub-agent invocation just began. Use this to render a loading card. */
export interface SubAgentStartEvent {
  type: "sub_agent_start";
  sub_agent: SubAgentName;
  /** Echoed back as `result.invocation_id` so the UI can match start→result. */
  invocation_id: string;
  /** Server-side wall-clock at start (epoch ms). For UX timers. */
  started_at: number;
}

/** Optional progress ping while a long sub-agent runs. */
export interface SubAgentProgressEvent {
  type: "sub_agent_progress";
  invocation_id: string;
  message: string;
}

/** Terminal sub-agent result; pairs with a prior sub_agent_start. */
export interface SubAgentResultEvent {
  type: "sub_agent_result";
  invocation_id: string;
  sub_agent: SubAgentName;
  result: SubAgentResultPayload;
}

/** Final cost / token roll-up; arrives once at the end of a successful run. */
export interface FinalUsageEvent {
  type: "final_usage";
  input_tokens: number;
  output_tokens: number;
  cost_usd_cents: number;
  duration_ms: number;
}

/** Terminal error frame — UI surfaces a recoverable retry CTA. */
export interface ErrorEvent {
  type: "error";
  /** Stable error class — e.g. `orchestrator.tool_loop_exhausted`. */
  code: string;
  message: string;
}

export type OrchestratorEvent =
  | TextDeltaEvent
  | SubAgentStartEvent
  | SubAgentProgressEvent
  | SubAgentResultEvent
  | FinalUsageEvent
  | ErrorEvent;

// ── Persisted chat-row shapes ───────────────────────────────────────────
// Cluster A's migration 0009 creates `chat_threads` + `chat_messages`. The
// generated DB types aren't published yet, so we declare row-level types
// here for the components to import.

export interface ChatThreadRow {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

/**
 * Content-block-of-record for a stored chat message.
 *
 * For user messages: `{ type: "text", text }`. For assistant messages we
 * persist the streamed text plus any sub-agent results so the thread can be
 * faithfully reloaded without re-running the orchestrator.
 */
export type StoredContentBlock =
  | { type: "text"; text: string }
  | {
      type: "sub_agent_result";
      sub_agent: SubAgentName;
      result: SubAgentResultPayload;
    };

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  tenant_id: string;
  role: ChatMessageRole;
  content_blocks: StoredContentBlock[];
  agent_run_id: string | null;
  created_at: string;
}
