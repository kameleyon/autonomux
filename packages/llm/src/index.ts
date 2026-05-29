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
} from "./client.js";

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
} from "./types.js";

export {
  LlmAuthError,
  LlmBudgetExceededError,
  LlmError,
  LlmInvalidRequestError,
  LlmRateLimitError,
  LlmServerError,
} from "./errors.js";

export { PRICING, computeCostUsd } from "./pricing.js";

export { TokenBudget, type TokenBudgetOpts } from "./util/budget.js";

export {
  ANTHROPIC_MODEL_MAP,
} from "./adapters/anthropic.js";

export {
  OPENROUTER_MODEL_MAP,
} from "./adapters/openrouter.js";
