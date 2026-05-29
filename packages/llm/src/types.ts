/**
 * @autonomux/llm — public types
 *
 * Provider-agnostic shapes. Every adapter normalizes its provider's
 * response into these types so callers never know which provider ran.
 */

/* ────────────────────────────────────────────────────────────────────────── */
/*  Provider + model identity                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Abstract model names. The adapter maps these to provider-specific
 * model identifiers (e.g. "sonnet-4.6" → "anthropic/claude-sonnet-4.6"
 * on OpenRouter or "claude-sonnet-4-6" on Anthropic direct).
 */
export type ModelName = "sonnet-4.6" | "haiku-4.5";

export type Provider = "openrouter" | "anthropic";

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | "error";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Content blocks (Anthropic-shaped — OpenRouter responses are translated)   */
/* ────────────────────────────────────────────────────────────────────────── */

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | TextBlock[];
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Messages + tools                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

export type Role = "user" | "assistant" | "system";

export interface Message {
  role: Role;
  content: string | ContentBlock[];
}

/**
 * Tool schema — Anthropic-style. JSON Schema for the input.
 * The OpenRouter adapter translates this to OpenAI function-call shape.
 */
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    [k: string]: unknown;
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Request                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

export interface CompleteRequest {
  model: ModelName;
  messages: Message[];
  /**
   * System prompt. Anthropic accepts this as a top-level field; the
   * OpenRouter adapter prepends it as a `system` message.
   */
  system?: string;
  tools?: Tool[];
  max_tokens: number;
  temperature?: number;
  /**
   * Optional request_id propagated to provider headers for tracing.
   * The orchestrator sets this so retries are idempotent on the
   * provider side too.
   */
  request_id?: string;
  /**
   * Optional budget guard. If provided, the call's input + output tokens
   * are charged against the budget AFTER the call returns. Pre-flight
   * checks happen on `budget.assert()` from the caller.
   */
  budget?: TokenBudgetLike;
  /**
   * AbortSignal forwarded to fetch / SDK.
   */
  signal?: AbortSignal;
}

/**
 * Minimal interface that `TokenBudget` (from util/budget.ts) satisfies.
 * Declared here to avoid a circular import between types and util.
 */
export interface TokenBudgetLike {
  charge(input: number, output: number, model: ModelName): void;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Response                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface CompleteResponse {
  /** Normalized content blocks (Anthropic shape). */
  content: ContentBlock[];
  stop_reason: StopReason;
  usage: Usage;
  /**
   * Cost in USD. ALWAYS computed and ALWAYS returned. If the provider
   * reports cost in headers (OpenRouter does sometimes), that is used;
   * otherwise we compute from `pricing.ts`.
   */
  cost_usd: number;
  /** The provider-specific model id that actually served the request. */
  model_used: string;
  provider: Provider;
  latency_ms: number;
  /** Provider's id for the response, useful for support tickets. */
  id: string;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Streaming                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Discriminated union of stream events. Both adapters emit this shape.
 *
 * Lifecycle:
 *   message_start  → optional, signals model + provider + initial usage
 *   text_delta+    → zero or more text chunks
 *   tool_use_start → signals a tool call beginning (with id + name)
 *   tool_use_delta+→ partial JSON for the tool input
 *   message_stop   → final, with full usage + cost + stop_reason
 */
export type StreamChunk =
  | {
      type: "message_start";
      provider: Provider;
      model_used: string;
      id: string;
    }
  | {
      type: "text_delta";
      text: string;
    }
  | {
      type: "tool_use_start";
      id: string;
      name: string;
    }
  | {
      type: "tool_use_delta";
      id: string;
      partial_json: string;
    }
  | {
      type: "message_stop";
      stop_reason: StopReason;
      usage: Usage;
      cost_usd: number;
      latency_ms: number;
    };
