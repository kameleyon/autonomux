/**
 * Pricing table — $ per 1M tokens.
 *
 * Sources (verified 2026-05):
 *   - Anthropic direct: https://www.anthropic.com/pricing
 *   - OpenRouter:       https://openrouter.ai/anthropic/claude-sonnet-4.6
 *                       (OpenRouter takes ~10% markup over Anthropic list)
 *
 * Update this table when prices change. The orchestrator's monthly
 * usage roll-up relies on these numbers being current.
 */

import type { ModelName, Provider, Usage } from "./types.js";

interface ProviderPricing {
  /** $ per 1M input tokens */
  in: number;
  /** $ per 1M output tokens */
  out: number;
}

export const PRICING = {
  "sonnet-4.6": {
    anthropic: { in: 3, out: 15 },
    openrouter: { in: 3.3, out: 16.5 },
  },
  "haiku-4.5": {
    anthropic: { in: 1, out: 5 },
    openrouter: { in: 1.1, out: 5.5 },
  },
} as const satisfies Record<ModelName, Record<Provider, ProviderPricing>>;

/**
 * Compute cost in USD for a given (model, provider, usage).
 * Always returns a number — never NaN, never undefined.
 */
export function computeCostUsd(
  model: ModelName,
  provider: Provider,
  usage: Usage,
): number {
  const rate = PRICING[model][provider];
  const inputCost = (usage.input_tokens / 1_000_000) * rate.in;
  const outputCost = (usage.output_tokens / 1_000_000) * rate.out;
  // Round to 6 decimal places — sufficient for fractional cents, avoids
  // float-precision noise propagating into the usage_meters table.
  return Math.round((inputCost + outputCost) * 1e6) / 1e6;
}
