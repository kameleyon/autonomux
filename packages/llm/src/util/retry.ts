/**
 * Exponential backoff retry — for transient LLM failures.
 *
 * Retries 429 (rate limit) + 5xx (server error). Honors `Retry-After`
 * when set by the provider. Caller-side AbortSignals short-circuit
 * the sleep.
 *
 * Auth errors and invalid-request errors are NEVER retried — those are
 * caller bugs.
 */

import {
  LlmAuthError,
  LlmError,
  LlmInvalidRequestError,
  LlmRateLimitError,
  LlmServerError,
} from "../errors.js";

export interface RetryOpts {
  max_attempts?: number;
  initial_delay_ms?: number;
  max_delay_ms?: number;
  /** Caller logger — receives one structured event per retry. */
  onRetry?: (event: RetryEvent) => void;
  signal?: AbortSignal;
}

export interface RetryEvent {
  attempt: number;
  max_attempts: number;
  delay_ms: number;
  reason: "rate_limit" | "server_error" | "network";
  error: LlmError | Error;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10_000;

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {},
): Promise<T> {
  const maxAttempts = opts.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
  const initialDelay = opts.initial_delay_ms ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelay = opts.max_delay_ms ?? DEFAULT_MAX_DELAY_MS;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      // Non-retryable: auth + invalid-request bail immediately.
      if (err instanceof LlmAuthError || err instanceof LlmInvalidRequestError) {
        throw err;
      }

      // No more attempts → re-throw.
      if (attempt >= maxAttempts) {
        throw err;
      }

      const reason: RetryEvent["reason"] =
        err instanceof LlmRateLimitError
          ? "rate_limit"
          : err instanceof LlmServerError
            ? "server_error"
            : "network";

      // Honor Retry-After if present, else exponential backoff with jitter.
      const providerDelay =
        err instanceof LlmRateLimitError ? err.retry_after_ms : undefined;
      const backoff = Math.min(maxDelay, initialDelay * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * (backoff / 2));
      const delay_ms = providerDelay ?? backoff + jitter;

      opts.onRetry?.({
        attempt,
        max_attempts: maxAttempts,
        delay_ms,
        reason,
        error: err instanceof Error ? err : new Error(String(err)),
      });

      await sleep(delay_ms, opts.signal);
    }
  }
  // Unreachable — the loop either returns or throws.
  throw lastErr instanceof Error ? lastErr : new Error("retry failed");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
