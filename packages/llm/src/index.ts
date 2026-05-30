/**
 * @autonomux/llm — public barrel.
 *
 * Callers should import from here only. The adapter modules are an
 * internal implementation detail.
 */

export {
  createLlmClient,
  type CreateLlmClientOpts,
  type LlmClient,
} from "./client";

export type {
  CompleteRequest,
  CompleteResponse,
  ContentBlock,
  Message,
  ModelName,
  Provider,
  Role,
  StopReason,
  StreamChunk,
  TextBlock,
  Tool,
  ToolResultBlock,
  ToolUseBlock,
  TokenBudgetLike,
  Usage,
} from "./types";

export {
  LlmAuthError,
  LlmBudgetExceededError,
  LlmError,
  LlmInvalidRequestError,
  LlmRateLimitError,
  LlmServerError,
} from "./errors";

export { PRICING, computeCostUsd } from "./pricing";

export { TokenBudget, type TokenBudgetOpts } from "./util/budget";

export {
  ANTHROPIC_MODEL_MAP,
} from "./adapters/anthropic";

export {
  OPENROUTER_MODEL_MAP,
} from "./adapters/openrouter";
