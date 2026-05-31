/**
 * @autonomux/orchestrator — event stream contract.
 *
 * `AlterEgoRuntime.runStream()` yields a discriminated union of events.
 * The web SSE bridge (apps/web/app/api/chat/stream) and any future
 * transport (websocket, gRPC) map these 1:1 onto the wire.
 *
 * Two design constraints govern this shape:
 *   1. Every event carries the agent_run_id so the client can correlate
 *      streaming chunks with the persisted row (used by the SubAgentCard
 *      "view chain-of-thought" affordance).
 *   2. No event ever carries plaintext credentials / cipher envelopes —
 *      the error event is a structured object so the SSE bridge can
 *      strip provider-internal detail before sending to the browser.
 */
import type { ContentBlock, StopReason, Usage } from "@autonomux/llm";

/** Stable error class identifiers (mirrors the worker side). */
export type OrchestratorErrorClass =
  | "llm.invalid_request"
  | "llm.rate_limited"
  | "llm.server_error"
  | "llm.budget_exceeded"
  | "llm.auth"
  | "sub_agent.timeout"
  | "sub_agent.failed"
  | "sub_agent.unknown"
  | "oauth.revoked"
  | "internal";

/** Final-usage snapshot persisted to `agent_runs`. */
export interface FinalUsage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_usd: number;
  readonly latency_ms: number;
  readonly stop_reason: StopReason;
  /** Number of tool-call hops the runtime executed (0 = no tool use). */
  readonly tool_hops: number;
}

/**
 * Discriminated union of every event the runtime can emit.
 *
 * Lifecycle (informally):
 *   text_delta*                                        (assistant prose)
 *   ( sub_agent_start sub_agent_progress* sub_agent_result
 *       text_delta* )*                                 (tool hops)
 *   final_usage
 *
 * `error` is terminal and replaces `final_usage` on failure.
 */
export type OrchestratorEvent =
  | {
      readonly type: "text_delta";
      readonly agent_run_id: string;
      readonly text: string;
    }
  | {
      readonly type: "sub_agent_start";
      readonly agent_run_id: string;
      readonly sub_agent_run_id: string;
      readonly sub_agent_name: string;
      readonly tool_use_id: string;
      readonly request_id: string;
      readonly input: Record<string, unknown>;
    }
  | {
      readonly type: "sub_agent_progress";
      readonly agent_run_id: string;
      readonly sub_agent_run_id: string;
      readonly sub_agent_name: string;
      readonly message: string;
      /** Optional fraction in [0,1] — pure UI hint, not load-bearing. */
      readonly progress?: number;
    }
  | {
      readonly type: "sub_agent_result";
      readonly agent_run_id: string;
      readonly sub_agent_run_id: string;
      readonly sub_agent_name: string;
      readonly tool_use_id: string;
      /**
       * Anthropic-shaped content blocks. The runtime forwards these
       * verbatim to the SSE bridge AND feeds them back into the LLM as
       * a `tool_result` message in the next hop.
       */
      readonly content: ContentBlock[];
      readonly is_error: boolean;
      readonly duration_ms: number;
    }
  | {
      readonly type: "final_usage";
      readonly agent_run_id: string;
      readonly usage: Usage;
      readonly cost_usd: number;
      readonly latency_ms: number;
      readonly stop_reason: StopReason;
      readonly tool_hops: number;
    }
  | {
      readonly type: "error";
      readonly agent_run_id: string;
      readonly error_class: OrchestratorErrorClass;
      readonly message: string;
    };
