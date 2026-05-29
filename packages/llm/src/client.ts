/**
 * Public LLM client.
 *
 * `createLlmClient()` reads `LLM_PROVIDER` from env (defaults to
 * "openrouter"), instantiates the matching adapter, and returns a
 * provider-agnostic interface.
 *
 * Callers should program against `LlmClient` only — never reach for the
 * adapters directly.
 */

import type { Logger } from "pino";
import { z } from "zod";
import { createAnthropicAdapter } from "./adapters/anthropic.js";
import { createOpenRouterAdapter } from "./adapters/openrouter.js";
import type { AdapterCtx, LlmAdapter } from "./adapters/types.js";
import { LlmInvalidRequestError } from "./errors.js";
import type {
  CompleteRequest,
  CompleteResponse,
  Provider,
  StreamChunk,
} from "./types.js";

export interface LlmClient {
  readonly provider: Provider;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
  stream(req: CompleteRequest): AsyncIterable<StreamChunk>;
}

export interface CreateLlmClientOpts {
  /** Override env-derived provider. */
  provider?: Provider;
  /** Override OpenRouter API key (falls back to OPENROUTER_API_KEY). */
  openrouter_api_key?: string;
  /** Override Anthropic API key (falls back to ANTHROPIC_API_KEY). */
  anthropic_api_key?: string;
  /** Custom base URLs (used by tests against mock servers). */
  openrouter_base_url?: string;
  anthropic_base_url?: string;
  /** Logger for retries, errors, etc. */
  logger?: Logger;
  /** OpenRouter HTTP-Referer / X-Title — passed for analytics. */
  referrer?: string;
  app_title?: string;
  /** Custom fetch (testing). */
  fetch_impl?: typeof fetch;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Request validation                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

const ModelSchema = z.union([z.literal("sonnet-4.6"), z.literal("haiku-4.5")]);
const RoleSchema = z.union([
  z.literal("user"),
  z.literal("assistant"),
  z.literal("system"),
]);
const RequestSchema = z.object({
  model: ModelSchema,
  messages: z
    .array(
      z.object({
        role: RoleSchema,
        content: z.unknown(),
      }),
    )
    .min(1),
  system: z.string().optional(),
  tools: z.array(z.unknown()).optional(),
  max_tokens: z.number().int().positive(),
  temperature: z.number().min(0).max(2).optional(),
  request_id: z.string().optional(),
});

function validateRequest(req: CompleteRequest): void {
  const result = RequestSchema.safeParse(req);
  if (!result.success) {
    throw new LlmInvalidRequestError(
      `Invalid CompleteRequest: ${result.error.message}`,
      { provider: "openrouter" },
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Factory                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

export function createLlmClient(opts: CreateLlmClientOpts = {}): LlmClient {
  const provider = resolveProvider(opts.provider);
  const ctx: AdapterCtx = { logger: opts.logger };

  let adapter: LlmAdapter;
  if (provider === "anthropic") {
    const anthOpts: Parameters<typeof createAnthropicAdapter>[1] = {};
    if (opts.anthropic_api_key !== undefined)
      anthOpts.api_key = opts.anthropic_api_key;
    if (opts.anthropic_base_url !== undefined)
      anthOpts.base_url = opts.anthropic_base_url;
    adapter = createAnthropicAdapter(ctx, anthOpts);
  } else {
    const orOpts: Parameters<typeof createOpenRouterAdapter>[1] = {};
    if (opts.openrouter_api_key !== undefined)
      orOpts.api_key = opts.openrouter_api_key;
    if (opts.openrouter_base_url !== undefined)
      orOpts.base_url = opts.openrouter_base_url;
    if (opts.referrer !== undefined) orOpts.referrer = opts.referrer;
    if (opts.app_title !== undefined) orOpts.app_title = opts.app_title;
    if (opts.fetch_impl !== undefined) orOpts.fetch_impl = opts.fetch_impl;
    adapter = createOpenRouterAdapter(ctx, orOpts);
  }

  return {
    provider: adapter.provider,
    async complete(req) {
      validateRequest(req);
      return adapter.complete(req);
    },
    stream(req) {
      validateRequest(req);
      return adapter.stream(req);
    },
  };
}

function resolveProvider(override: Provider | undefined): Provider {
  if (override) return override;
  const raw = process.env["LLM_PROVIDER"]?.trim().toLowerCase();
  if (raw === "anthropic") return "anthropic";
  if (raw === "openrouter" || raw === undefined || raw === "") {
    return "openrouter";
  }
  throw new LlmInvalidRequestError(
    `LLM_PROVIDER must be "openrouter" or "anthropic"; got "${raw}"`,
    { provider: "openrouter" },
  );
}
