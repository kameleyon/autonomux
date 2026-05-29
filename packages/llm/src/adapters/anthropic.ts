/**
 * Anthropic direct adapter.
 *
 * Uses `@anthropic-ai/sdk`. Native Messages API shape — minimal
 * translation needed since our public types mirror Anthropic's
 * content-block shape.
 *
 * Activated when `LLM_PROVIDER=anthropic` is set in env.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  LlmAuthError,
  LlmInvalidRequestError,
  LlmRateLimitError,
  LlmServerError,
} from "../errors.js";
import { computeCostUsd } from "../pricing.js";
import type {
  CompleteRequest,
  CompleteResponse,
  ContentBlock,
  ModelName,
  StopReason,
  StreamChunk,
} from "../types.js";
import { withRetry } from "../util/retry.js";
import type { AdapterCtx, LlmAdapter } from "./types.js";

/** Map abstract model → Anthropic provider model id. */
export const ANTHROPIC_MODEL_MAP: Record<ModelName, string> = {
  "sonnet-4.6": "claude-sonnet-4-6",
  "haiku-4.5": "claude-haiku-4-5-20251001",
};

interface AnthropicAdapterOpts {
  api_key?: string;
  base_url?: string;
}

export function createAnthropicAdapter(
  ctx: AdapterCtx,
  opts: AnthropicAdapterOpts = {},
): LlmAdapter {
  const apiKey = opts.api_key ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new LlmAuthError(
      "ANTHROPIC_API_KEY is not set. Configure it in Doppler / env.",
      { provider: "anthropic" },
    );
  }
  const client = new Anthropic({
    apiKey,
    ...(opts.base_url ? { baseURL: opts.base_url } : {}),
  });

  return {
    provider: "anthropic",

    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      const modelId = ANTHROPIC_MODEL_MAP[req.model];
      const started = Date.now();

      const run = async (): Promise<CompleteResponse> => {
        try {
          const resp = await client.messages.create(
            {
              model: modelId,
              max_tokens: req.max_tokens,
              ...(req.temperature !== undefined
                ? { temperature: req.temperature }
                : {}),
              ...(req.system !== undefined ? { system: req.system } : {}),
              ...(req.tools !== undefined && req.tools.length > 0
                ? {
                    tools: req.tools.map((t) => ({
                      name: t.name,
                      description: t.description,
                      input_schema: t.input_schema,
                    })),
                  }
                : {}),
              messages: req.messages.map((m) => ({
                role: m.role === "system" ? "user" : m.role,
                content: m.content as never,
              })),
            },
            req.signal ? { signal: req.signal } : undefined,
          );

          const usage = {
            input_tokens: resp.usage.input_tokens,
            output_tokens: resp.usage.output_tokens,
          };
          const cost_usd = computeCostUsd(req.model, "anthropic", usage);
          req.budget?.charge(
            usage.input_tokens,
            usage.output_tokens,
            req.model,
          );

          return {
            content: resp.content.map(normalizeAnthropicBlock),
            stop_reason: normalizeStopReason(resp.stop_reason),
            usage,
            cost_usd,
            model_used: resp.model,
            provider: "anthropic",
            latency_ms: Date.now() - started,
            id: resp.id,
          };
        } catch (err) {
          throw translateAnthropicError(err, modelId, req.request_id);
        }
      };

      return withRetry(run, {
        onRetry: (ev) => {
          ctx.logger?.warn(
            {
              attempt: ev.attempt,
              max_attempts: ev.max_attempts,
              delay_ms: ev.delay_ms,
              reason: ev.reason,
              provider: "anthropic",
              model: modelId,
              request_id: req.request_id,
              err: ev.error.message,
            },
            "llm.retry",
          );
        },
        ...(req.signal ? { signal: req.signal } : {}),
      });
    },

    async *stream(req: CompleteRequest): AsyncIterable<StreamChunk> {
      const modelId = ANTHROPIC_MODEL_MAP[req.model];
      const started = Date.now();
      let stream: ReturnType<typeof client.messages.stream>;
      try {
        stream = client.messages.stream(
          {
            model: modelId,
            max_tokens: req.max_tokens,
            ...(req.temperature !== undefined
              ? { temperature: req.temperature }
              : {}),
            ...(req.system !== undefined ? { system: req.system } : {}),
            ...(req.tools !== undefined && req.tools.length > 0
              ? {
                  tools: req.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    input_schema: t.input_schema,
                  })),
                }
              : {}),
            messages: req.messages.map((m) => ({
              role: m.role === "system" ? "user" : m.role,
              content: m.content as never,
            })),
          },
          req.signal ? { signal: req.signal } : undefined,
        );
      } catch (err) {
        throw translateAnthropicError(err, modelId, req.request_id);
      }

      let yieldedStart = false;
      try {
        for await (const event of stream) {
          if (!yieldedStart && event.type === "message_start") {
            yieldedStart = true;
            yield {
              type: "message_start",
              provider: "anthropic",
              model_used: event.message.model,
              id: event.message.id,
            };
            continue;
          }
          if (event.type === "content_block_start") {
            const block = event.content_block;
            if (block.type === "tool_use") {
              yield {
                type: "tool_use_start",
                id: block.id,
                name: block.name,
              };
            }
            continue;
          }
          if (event.type === "content_block_delta") {
            const delta = event.delta;
            if (delta.type === "text_delta") {
              yield { type: "text_delta", text: delta.text };
            } else if (delta.type === "input_json_delta") {
              yield {
                type: "tool_use_delta",
                id: String(event.index),
                partial_json: delta.partial_json,
              };
            }
            continue;
          }
        }

        const final = await stream.finalMessage();
        const usage = {
          input_tokens: final.usage.input_tokens,
          output_tokens: final.usage.output_tokens,
        };
        const cost_usd = computeCostUsd(req.model, "anthropic", usage);
        req.budget?.charge(usage.input_tokens, usage.output_tokens, req.model);

        yield {
          type: "message_stop",
          stop_reason: normalizeStopReason(final.stop_reason),
          usage,
          cost_usd,
          latency_ms: Date.now() - started,
        };
      } catch (err) {
        throw translateAnthropicError(err, modelId, req.request_id);
      }
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Normalization                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

function normalizeAnthropicBlock(
  block: Anthropic.Messages.ContentBlock,
): ContentBlock {
  if (block.type === "text") {
    return { type: "text", text: block.text };
  }
  if (block.type === "tool_use") {
    return {
      type: "tool_use",
      id: block.id,
      name: block.name,
      input: (block.input as Record<string, unknown>) ?? {},
    };
  }
  // Fallback for unknown block types (thinking, etc.) — coerce to text
  // so the caller never receives an unhandled discriminant.
  return { type: "text", text: JSON.stringify(block) };
}

function normalizeStopReason(reason: string | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "max_tokens":
    case "stop_sequence":
    case "tool_use":
      return reason;
    default:
      return "end_turn";
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Error translation                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

function translateAnthropicError(
  err: unknown,
  model: string,
  request_id: string | undefined,
): Error {
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    const ctx = {
      provider: "anthropic" as const,
      model,
      request_id,
      status,
      cause: err,
    };
    if (status === 401 || status === 403) {
      return new LlmAuthError(err.message, ctx);
    }
    if (status === 429) {
      const retry_after_ms = parseRetryAfter(err.headers);
      return new LlmRateLimitError(err.message, {
        ...ctx,
        ...(retry_after_ms !== undefined ? { retry_after_ms } : {}),
      });
    }
    if (typeof status === "number" && status >= 500) {
      return new LlmServerError(err.message, ctx);
    }
    return new LlmInvalidRequestError(err.message, ctx);
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function parseRetryAfter(
  headers: Record<string, string> | Headers | undefined,
): number | undefined {
  if (!headers) return undefined;
  const raw =
    headers instanceof Headers
      ? headers.get("retry-after")
      : (headers["retry-after"] ?? headers["Retry-After"]);
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}
