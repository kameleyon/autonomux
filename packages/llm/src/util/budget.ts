/**
 * TokenBudget — per-tenant monthly cap enforcement.
 *
 * The orchestrator instantiates one per agent run with the tenant's
 * remaining monthly token allowance (or a generous default for system
 * runs). Every adapter call charges the budget after the response is
 * received. When the budget is exhausted, subsequent `charge()` calls
 * throw `LlmBudgetExceededError` immediately.
 *
 * Charging accounts for the model: a 1k-token Sonnet call counts more
 * against budget than a 1k-token Haiku call, because we normalize to
 * Sonnet-equivalent tokens using the input-token price ratio. This
 * matches how we bill tenants on overage (one rate, one meter).
 */

import { LlmBudgetExceededError } from "../errors";
import { PRICING } from "../pricing";
import type { ModelName, TokenBudgetLike } from "../types";

export interface TokenBudgetOpts {
  /** Tenant monthly cap, in Sonnet-equivalent input tokens. */
  limit_tokens: number;
  /** Already-consumed tokens (loaded from `usage_meters` at run start). */
  used_tokens?: number;
  /** Tenant id, used only for the thrown error context. */
  tenant_id?: string;
}

const NORMALIZATION_BASE: ModelName = "sonnet-4.6";

export class TokenBudget implements TokenBudgetLike {
  public readonly limit_tokens: number;
  public readonly tenant_id: string | undefined;
  private _used_tokens: number;

  public constructor(opts: TokenBudgetOpts) {
    this.limit_tokens = opts.limit_tokens;
    this._used_tokens = opts.used_tokens ?? 0;
    this.tenant_id = opts.tenant_id;
  }

  public get used_tokens(): number {
    return this._used_tokens;
  }

  public get remaining(): number {
    return Math.max(0, this.limit_tokens - this._used_tokens);
  }

  /**
   * Pre-flight check. Callers may use this before issuing a request
   * with a large expected output. Does NOT mutate state.
   */
  public assert(expected_tokens = 0): void {
    if (this._used_tokens + expected_tokens > this.limit_tokens) {
      throw new LlmBudgetExceededError(
        `Token budget exceeded for tenant ${this.tenant_id ?? "<anon>"}: ` +
          `${this._used_tokens + expected_tokens}/${this.limit_tokens}`,
        {
          provider: "openrouter",
          limit_tokens: this.limit_tokens,
          used_tokens: this._used_tokens,
        },
      );
    }
  }

  /**
   * Charge actual usage from an `Usage` result. Normalizes to
   * Sonnet-equivalent input tokens so a single counter covers
   * mixed-model runs.
   */
  public charge(
    input_tokens: number,
    output_tokens: number,
    model: ModelName,
  ): void {
    const normalized = this.normalize(input_tokens, output_tokens, model);
    this._used_tokens += normalized;
    if (this._used_tokens > this.limit_tokens) {
      throw new LlmBudgetExceededError(
        `Token budget exhausted for tenant ${this.tenant_id ?? "<anon>"}: ` +
          `${this._used_tokens}/${this.limit_tokens}`,
        {
          provider: "openrouter",
          limit_tokens: this.limit_tokens,
          used_tokens: this._used_tokens,
          model,
        },
      );
    }
  }

  private normalize(
    input_tokens: number,
    output_tokens: number,
    model: ModelName,
  ): number {
    const baseRate = PRICING[NORMALIZATION_BASE].anthropic;
    const modelRate = PRICING[model].anthropic;
    // Weight by the model's input/output rates relative to Sonnet input rate.
    const equivalentInput = input_tokens * (modelRate.in / baseRate.in);
    const equivalentOutput = output_tokens * (modelRate.out / baseRate.in);
    return Math.ceil(equivalentInput + equivalentOutput);
  }
}
