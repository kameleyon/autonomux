/**
 * OpenRouter adapter.
 *
 * OpenRouter exposes an OpenAI-shaped chat completions API. This adapter
 * translates between our Anthropic-shaped public types and OpenAI's
 * messages-with-tool_calls shape both ways, so callers never know which
 * provider ran.
 *
 * Endpoint: https://openrouter.ai/api/v1/chat/completions
 * Activated when `LLM_PROVIDER=openrouter` (default).
 */

import {
  LlmAuthError,
  LlmInvalidRequestError,
  LlmRateLimitError,
  LlmServerError,
} from "../errors";
import { computeCostUsd } from "../pricing";
import type {
  CompleteRequest,
  CompleteResponse,
  ContentBlock,
  Message,
  ModelName,
  StopReason,
  StreamChunk,
  Tool,
  ToolUseBlock,
} from "../types";
import { withRetry } from "../util/retry";
import type { AdapterCtx, LlmAdapter } from "./types";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Constants                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Map abstract model → OpenRouter provider model id. */
export const OPENROUTER_MODEL_MAP: Record<ModelName, string> = {
  "sonnet-4.6": "anthropic/claude-sonnet-4.6",
  "haiku-4.5": "anthropic/claude-haiku-4.5",
};

interface OpenRouterAdapterOpts {
  api_key?: string;
  base_url?: string;
  /** Sent as HTTP-Referer header — OpenRouter requires for analytics. */
  referrer?: string;
  /** Sent as X-Title header — OpenRouter requires for analytics. */
  app_title?: string;
  fetch_impl?: typeof fetch;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  OpenAI-shaped wire types (minimal subset we use)                          */
/* ────────────────────────────────────────────────────────────────────────── */

interface OAToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OAMessageOut {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: OAToolCall[];
  tool_call_id?: string;
}

interface OAChoice {
  index: number;
  message: OAMessageOut;
  finish_reason: string | null;
}

interface OAUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OAResponse {
  id: string;
  model: string;
  choices: OAChoice[];
  usage?: OAUsage;
  /** OpenRouter extension: actual cost in USD (sometimes present). */
  cost?: number;
}

interface OAStreamDelta {
  role?: string;
  content?: string;
  tool_calls?: {
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }[];
}

interface OAStreamChunk {
  id: string;
  model: string;
  choices: { index: number; delta: OAStreamDelta; finish_reason: string | null }[];
  usage?: OAUsage;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Adapter factory                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export function createOpenRouterAdapter(
  ctx: AdapterCtx,
  opts: OpenRouterAdapterOpts = {},
): LlmAdapter {
  const apiKey = opts.api_key ?? process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new LlmAuthError(
      "OPENROUTER_API_KEY is not set. Configure it in Doppler / env.",
      { provider: "openrouter" },
    );
  }
  const url = opts.base_url ?? OPENROUTER_URL;
  const referrer = opts.referrer ?? "https://autonomux.io";
  const appTitle = opts.app_title ?? "Autonomux";
  const fetchImpl: typeof fetch = opts.fetch_impl ?? globalThis.fetch;

  const buildHeaders = (req: CompleteRequest): Record<string, string> => {
    const h: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referrer,
      "X-Title": appTitle,
    };
    if (req.request_id) h["X-Request-Id"] = req.request_id;
    return h;
  };

  return {
    provider: "openrouter",

    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      const modelId = OPENROUTER_MODEL_MAP[req.model];
      const body = buildBody(req, modelId, false);
      const started = Date.now();

      const run = async (): Promise<CompleteResponse> => {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: buildHeaders(req),
          body: JSON.stringify(body),
          ...(req.signal ? { signal: req.signal } : {}),
        });
        if (!res.ok) {
          throw await translateHttpError(res, modelId, req.request_id);
        }
        const json = (await res.json()) as OAResponse;
        const usage = {
          input_tokens: json.usage?.prompt_tokens ?? 0,
          output_tokens: json.usage?.completion_tokens ?? 0,
        };
        const headerCost = parseCostHeader(res.headers);
        const cost_usd =
          headerCost ??
          (typeof json.cost === "number"
            ? json.cost
            : computeCostUsd(req.model, "openrouter", usage));
        req.budget?.charge(usage.input_tokens, usage.output_tokens, req.model);

        const choice = json.choices[0];
        if (!choice) {
          throw new LlmServerError("OpenRouter returned no choices", {
            provider: "openrouter",
            model: modelId,
            request_id: req.request_id,
          });
        }

        return {
          content: oaMessageToBlocks(choice.message),
          stop_reason: normalizeFinishReason(choice.finish_reason),
          usage,
          cost_usd,
          model_used: json.model,
          provider: "openrouter",
          latency_ms: Date.now() - started,
          id: json.id,
        };
      };

      return withRetry(run, {
        onRetry: (ev) => {
          ctx.logger?.warn(
            {
              attempt: ev.attempt,
              max_attempts: ev.max_attempts,
              delay_ms: ev.delay_ms,
              reason: ev.reason,
              provider: "openrouter",
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
      const modelId = OPENROUTER_MODEL_MAP[req.model];
      const body = buildBody(req, modelId, true);
      const started = Date.now();

      const res = await fetchImpl(url, {
        method: "POST",
        headers: { ...buildHeaders(req), Accept: "text/event-stream" },
        body: JSON.stringify(body),
        ...(req.signal ? { signal: req.signal } : {}),
      });
      if (!res.ok) {
        throw await translateHttpError(res, modelId, req.request_id);
      }
      if (!res.body) {
        throw new LlmServerError("OpenRouter stream has no body", {
          provider: "openrouter",
          model: modelId,
          request_id: req.request_id,
        });
      }

      let yieldedStart = false;
      let lastModel = modelId;
      let lastId = "";
      let aggregatedUsage: { input_tokens: number; output_tokens: number } = {
        input_tokens: 0,
        output_tokens: 0,
      };
      let aggregatedFinish: string | null = null;
      const toolCallsByIndex = new Map<number, { id: string; name?: string }>();

      for await (const event of sseLines(res.body)) {
        if (event === "[DONE]") break;
        let chunk: OAStreamChunk;
        try {
          chunk = JSON.parse(event) as OAStreamChunk;
        } catch {
          continue;
        }
        lastModel = chunk.model || lastModel;
        lastId = chunk.id || lastId;
        if (!yieldedStart) {
          yieldedStart = true;
          yield {
            type: "message_start",
            provider: "openrouter",
            model_used: lastModel,
            id: lastId,
          };
        }
        if (chunk.usage) {
          aggregatedUsage = {
            input_tokens: chunk.usage.prompt_tokens,
            output_tokens: chunk.usage.completion_tokens,
          };
        }
        const choice = chunk.choices[0];
        if (!choice) continue;
        if (choice.finish_reason) aggregatedFinish = choice.finish_reason;

        const delta = choice.delta;
        if (typeof delta.content === "string" && delta.content.length > 0) {
          yield { type: "text_delta", text: delta.content };
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCallsByIndex.get(tc.index);
            if (!existing) {
              const id =
                tc.id ?? `tool_${tc.index}_${Math.random().toString(36).slice(2, 8)}`;
              const next: { id: string; name?: string } = { id };
              if (tc.function?.name) next.name = tc.function.name;
              toolCallsByIndex.set(tc.index, next);
              if (next.name) {
                yield { type: "tool_use_start", id, name: next.name };
              }
            } else if (tc.function?.name && !existing.name) {
              existing.name = tc.function.name;
              yield {
                type: "tool_use_start",
                id: existing.id,
                name: existing.name,
              };
            }
            const args = tc.function?.arguments;
            if (typeof args === "string" && args.length > 0) {
              const entry = toolCallsByIndex.get(tc.index);
              if (entry) {
                yield {
                  type: "tool_use_delta",
                  id: entry.id,
                  partial_json: args,
                };
              }
            }
          }
        }
      }

      const cost_usd = computeCostUsd(req.model, "openrouter", aggregatedUsage);
      req.budget?.charge(
        aggregatedUsage.input_tokens,
        aggregatedUsage.output_tokens,
        req.model,
      );

      yield {
        type: "message_stop",
        stop_reason: normalizeFinishReason(aggregatedFinish),
        usage: aggregatedUsage,
        cost_usd,
        latency_ms: Date.now() - started,
      };
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Request translation: our types → OpenAI shape                              */
/* ────────────────────────────────────────────────────────────────────────── */

interface OABody {
  model: string;
  messages: OAMessageOut[];
  max_tokens: number;
  temperature?: number;
  stream?: boolean;
  tools?: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Tool["input_schema"];
    };
  }[];
  /** Tell OpenRouter to include usage stats in the final stream chunk. */
  stream_options?: { include_usage: boolean };
  /** OpenRouter extension: include cost in response. */
  usage?: { include: boolean };
  /** OpenRouter extension: enable the built-in web-search plugin. */
  plugins?: { id: string; max_results?: number }[];
}

/**
 * Web search is ON unless OPENROUTER_WEB_SEARCH is explicitly "0"/"false"/"off".
 * When on, OpenRouter runs a live web search per request and folds the results
 * into the model's context (~$0.02/search). Turn it off by setting the env var
 * to "0" if you want to cut that cost.
 */
function webSearchEnabled(): boolean {
  const raw = process.env["OPENROUTER_WEB_SEARCH"]?.trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function buildBody(
  req: CompleteRequest,
  modelId: string,
  stream: boolean,
): OABody {
  const messages: OAMessageOut[] = [];
  if (req.system) {
    messages.push({ role: "system", content: req.system });
  }
  for (const m of req.messages) {
    messages.push(...messageToOA(m));
  }

  const body: OABody = {
    model: modelId,
    messages,
    max_tokens: req.max_tokens,
    usage: { include: true },
  };
  // Live web search via OpenRouter's built-in plugin — lets the model pull
  // current info (news, prices, standings) instead of only training data.
  if (webSearchEnabled()) {
    body.plugins = [{ id: "web", max_results: 3 }];
  }
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }
  return body;
}

function messageToOA(m: Message): OAMessageOut[] {
  if (typeof m.content === "string") {
    return [{ role: m.role, content: m.content }];
  }
  // Block content — split into text/tool_use/tool_result.
  const textPieces: string[] = [];
  const toolCalls: OAToolCall[] = [];
  const toolResults: OAMessageOut[] = [];
  for (const block of m.content) {
    if (block.type === "text") {
      textPieces.push(block.text);
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    } else if (block.type === "tool_result") {
      const content =
        typeof block.content === "string"
          ? block.content
          : block.content.map((t) => t.text).join("\n");
      toolResults.push({
        role: "tool",
        content,
        tool_call_id: block.tool_use_id,
      });
    }
  }
  const out: OAMessageOut[] = [];
  if (textPieces.length > 0 || toolCalls.length > 0) {
    const msg: OAMessageOut = {
      role: m.role,
      content: textPieces.length > 0 ? textPieces.join("\n") : null,
    };
    if (toolCalls.length > 0) msg.tool_calls = toolCalls;
    out.push(msg);
  }
  out.push(...toolResults);
  return out;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Response translation: OpenAI shape → our types                             */
/* ────────────────────────────────────────────────────────────────────────── */

function oaMessageToBlocks(msg: OAMessageOut): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (typeof msg.content === "string" && msg.content.length > 0) {
    blocks.push({ type: "text", text: msg.content });
  }
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      let input: Record<string, unknown> = {};
      try {
        input = tc.function.arguments
          ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
          : {};
      } catch {
        input = { _raw: tc.function.arguments };
      }
      const block: ToolUseBlock = {
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input,
      };
      blocks.push(block);
    }
  }
  return blocks;
}

function normalizeFinishReason(reason: string | null): StopReason {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "content_filter":
      return "stop_sequence";
    default:
      return "end_turn";
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  HTTP error translation                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

async function translateHttpError(
  res: Response,
  model: string,
  request_id: string | undefined,
): Promise<Error> {
  const ctx = {
    provider: "openrouter" as const,
    model,
    request_id,
    status: res.status,
  };
  let message = `OpenRouter ${res.status}`;
  try {
    const body = await res.text();
    if (body) message = `OpenRouter ${res.status}: ${body.slice(0, 500)}`;
  } catch {
    /* no body */
  }
  if (res.status === 401 || res.status === 403) {
    return new LlmAuthError(message, ctx);
  }
  if (res.status === 429) {
    const retry_after_ms = parseRetryAfterHeader(res.headers);
    return new LlmRateLimitError(message, {
      ...ctx,
      ...(retry_after_ms !== undefined ? { retry_after_ms } : {}),
    });
  }
  if (res.status >= 500) {
    return new LlmServerError(message, ctx);
  }
  return new LlmInvalidRequestError(message, ctx);
}

function parseRetryAfterHeader(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

function parseCostHeader(headers: Headers): number | undefined {
  // OpenRouter sometimes returns `x-cost` or `openrouter-cost`.
  const raw = headers.get("x-cost") ?? headers.get("openrouter-cost");
  if (!raw) return undefined;
  const cost = Number(raw);
  return Number.isFinite(cost) ? cost : undefined;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  SSE line iterator                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

async function* sseLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, void> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data.length > 0) yield data;
        }
        nl = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
