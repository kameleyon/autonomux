/**
 * Typed LLM errors.
 *
 * No silent fallbacks between providers — if a provider is configured
 * and fails, we throw one of these. The orchestrator decides whether
 * to surface, retry-other-model, or fail-the-run.
 */

import type { Provider } from "./types.js";

export interface LlmErrorOpts {
  provider: Provider;
  model?: string;
  request_id?: string;
  status?: number;
  cause?: unknown;
}

export abstract class LlmError extends Error {
  public readonly provider: Provider;
  public readonly model: string | undefined;
  public readonly request_id: string | undefined;
  public readonly status: number | undefined;
  public override readonly cause: unknown;

  protected constructor(message: string, opts: LlmErrorOpts) {
    super(message);
    this.name = new.target.name;
    this.provider = opts.provider;
    this.model = opts.model;
    this.request_id = opts.request_id;
    this.status = opts.status;
    this.cause = opts.cause;
  }
}

/** 401 / 403 — missing or invalid API key, or scope rejected. */
export class LlmAuthError extends LlmError {
  public constructor(message: string, opts: LlmErrorOpts) {
    super(message, opts);
  }
}

/** 429 — rate limit. Retry-After is set when the provider returned one. */
export class LlmRateLimitError extends LlmError {
  public readonly retry_after_ms: number | undefined;
  public constructor(
    message: string,
    opts: LlmErrorOpts & { retry_after_ms?: number },
  ) {
    super(message, opts);
    this.retry_after_ms = opts.retry_after_ms;
  }
}

/** 5xx — provider-side failure. Retryable. */
export class LlmServerError extends LlmError {
  public constructor(message: string, opts: LlmErrorOpts) {
    super(message, opts);
  }
}

/** 400 / 422 — request malformed (bad tool schema, prompt too long, etc.). */
export class LlmInvalidRequestError extends LlmError {
  public constructor(message: string, opts: LlmErrorOpts) {
    super(message, opts);
  }
}

/**
 * Tenant has exceeded its token budget. Thrown by `TokenBudget.charge()`.
 * The orchestrator catches this and surfaces an upgrade prompt to the user.
 */
export class LlmBudgetExceededError extends LlmError {
  public readonly limit_tokens: number;
  public readonly used_tokens: number;
  public constructor(
    message: string,
    opts: LlmErrorOpts & { limit_tokens: number; used_tokens: number },
  ) {
    super(message, opts);
    this.limit_tokens = opts.limit_tokens;
    this.used_tokens = opts.used_tokens;
  }
}
