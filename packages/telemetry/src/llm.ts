/**
 * LLM-call span helper.
 *
 * Implements PRD §8.4 "LLM-specific logging" at the trace layer: every
 * LLM call gets a span with the dimensions Axiom needs to roll up cost
 * + latency per tenant / model / provider.
 *
 * Attributes (all queryable in Axiom):
 *   llm.model         abstract model name ("sonnet-4.6", "haiku-4.5")
 *   llm.model_used    provider-specific model id actually invoked
 *   llm.provider      "anthropic" | "openrouter"
 *   llm.input_tokens  Anthropic billing dimension
 *   llm.output_tokens Same
 *   llm.cost_usd      computed by pricing.ts — required for tenant rollup
 *   llm.latency_ms    end-to-end latency from CompleteResponse
 *   llm.stop_reason   end_turn | max_tokens | stop_sequence | tool_use | error
 *   llm.request_id    optional; correlates spans → log lines (PRD §8.2)
 *   tenant.id         optional; required for per-tenant cost rollups
 *
 * Attribute hygiene: input/output text content is NEVER added — only
 * numeric metadata. Adapters keep raw prompts out of telemetry.
 */

import { SpanKind, type Span } from "@opentelemetry/api";

import { addAttributes, withSpan } from "./spans.js";

/** Inputs known BEFORE the call fires. */
export type TraceLlmCallContext = {
  readonly model: string;
  readonly provider: string;
  /** Optional correlation id (PRD §8.2). */
  readonly requestId?: string;
  /** Optional tenant id for cost-per-tenant rollups (PRD §8.4). */
  readonly tenantId?: string;
};

/** Subset of `CompleteResponse` the helper needs to record. */
export type LlmResponseLike = {
  readonly model_used: string;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
  readonly cost_usd: number;
  readonly latency_ms: number;
  readonly stop_reason: string;
};

/**
 * Wrap an LLM call. The fn must return a `CompleteResponse`-shaped object
 * so the helper can extract token + cost + latency attributes after the
 * call completes.
 *
 * Usage:
 *   const res = await traceLlmCall(
 *     { model: req.model, provider: "anthropic", tenantId, requestId },
 *     () => adapter.complete(req),
 *   );
 */
export async function traceLlmCall<T extends LlmResponseLike>(
  ctx: TraceLlmCallContext,
  fn: () => Promise<T>,
): Promise<T> {
  return withSpan(
    `llm.${ctx.provider}.complete`,
    async (span: Span): Promise<T> => {
      // Pre-call attributes (always set, even if call throws).
      addAttributes(span, {
        "llm.model": ctx.model,
        "llm.provider": ctx.provider,
        "llm.request_id": ctx.requestId,
        "tenant.id": ctx.tenantId,
      });

      const res = await fn();

      // Post-call attributes (only on success).
      addAttributes(span, {
        "llm.model_used": res.model_used,
        "llm.input_tokens": res.usage.input_tokens,
        "llm.output_tokens": res.usage.output_tokens,
        "llm.cost_usd": res.cost_usd,
        "llm.latency_ms": res.latency_ms,
        "llm.stop_reason": res.stop_reason,
      });

      return res;
    },
    {
      tracer: "@autonomux/llm",
      kind: SpanKind.CLIENT,
    },
  );
}
