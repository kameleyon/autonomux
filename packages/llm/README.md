# `@autonomux/llm`

Pluggable LLM adapter for Autonomux. **OpenRouter is the v1 default; one env-var swaps to Anthropic direct.** Same code path either way — callers never know which provider ran.

Owned by **[Forge]**.

---

## Quick start

```ts
import { createLlmClient } from "@autonomux/llm";

const client = createLlmClient({ logger });

const res = await client.complete({
  model: "sonnet-4.6",
  system: "You are AlterEgo, the founder's daily operator.",
  messages: [{ role: "user", content: "Summarize today's inbox." }],
  max_tokens: 1024,
});

console.log(res.content, res.usage, res.cost_usd, res.provider);
```

---

## Provider switching

| `LLM_PROVIDER` | Adapter used | Required env |
|---|---|---|
| `openrouter` (default, or unset) | `adapters/openrouter.ts` | `OPENROUTER_API_KEY` |
| `anthropic` | `adapters/anthropic.ts` | `ANTHROPIC_API_KEY` |

Anything else throws `LlmInvalidRequestError` at client construction.

No silent fallback: if OpenRouter is configured and a request fails, we throw — we do **not** quietly retry against Anthropic. The orchestrator decides what to do.

---

## Model mapping

Callers pass an abstract model name. The adapter maps it.

| Abstract name | OpenRouter id | Anthropic direct id |
|---|---|---|
| `sonnet-4.6` | `anthropic/claude-sonnet-4.6` | `claude-sonnet-4-6` |
| `haiku-4.5` | `anthropic/claude-haiku-4.5` | `claude-haiku-4-5-20251001` |

Use `sonnet-4.6` for the main agent loop. Use `haiku-4.5` for triage (Mailroom rank, Scheduler conflict check) to keep cost low. PRD §4.2.

---

## Pricing table

`$ per 1M tokens` — kept current in `src/pricing.ts`.

| Model | Anthropic in | Anthropic out | OpenRouter in | OpenRouter out |
|---|---|---|---|---|
| `sonnet-4.6` | $3.00 | $15.00 | $3.30 | $16.50 |
| `haiku-4.5` | $1.00 | $5.00 | $1.10 | $5.50 |

`computeCostUsd(model, provider, usage)` is exported so the orchestrator's usage roll-up can recompute historic costs if the pricing changes.

`CompleteResponse.cost_usd` is **always** populated — from headers when OpenRouter provides them, else from the table.

---

## Cost tracking

Every response includes:

```ts
{
  usage:    { input_tokens, output_tokens },
  cost_usd: number,        // always computed
  model_used: string,      // exact provider model id
  provider: "openrouter" | "anthropic",
  latency_ms: number,
}
```

These map directly to `agent_runs.input_tokens`, `agent_runs.output_tokens`, `agent_runs.cost_usd`, `agent_runs.latency_ms` (PRD §8.4).

---

## Retry policy

`util/retry.ts` — exponential backoff with jitter, max 3 attempts.

- Retries: `429` (rate limit) + `5xx` (server errors) + network errors
- Honors `Retry-After` header when present
- Bails immediately on `LlmAuthError` and `LlmInvalidRequestError`
- Every retry logs a structured event: `{ attempt, max_attempts, delay_ms, reason, provider, model, request_id, err }`

---

## Budget enforcement

```ts
import { TokenBudget } from "@autonomux/llm";

const budget = new TokenBudget({
  tenant_id: "...",
  limit_tokens: 5_000_000,       // monthly cap, Sonnet-equivalent
  used_tokens: meter.consumed,   // load from usage_meters
});

await client.complete({
  ...req,
  budget,                        // charged automatically after the call
});
```

The budget normalizes Haiku usage to Sonnet-equivalent input tokens (via the price ratio) so one counter covers mixed-model runs — matching how we bill tenants on overage.

When `limit_tokens` is exceeded, `LlmBudgetExceededError` is thrown — the orchestrator catches this and surfaces an upgrade prompt.

---

## Typed errors

All errors extend `LlmError` and carry `{ provider, model, request_id, status, cause }`.

- `LlmAuthError` — 401 / 403, never retried
- `LlmRateLimitError` — 429, retried with `Retry-After` if present
- `LlmServerError` — 5xx, retried
- `LlmInvalidRequestError` — 400 / 422, never retried (caller bug)
- `LlmBudgetExceededError` — tenant out of monthly tokens

---

## Streaming

```ts
for await (const chunk of client.stream(req)) {
  switch (chunk.type) {
    case "message_start":     /* setup */ break;
    case "text_delta":        /* append to UI */ break;
    case "tool_use_start":    /* announce tool */ break;
    case "tool_use_delta":    /* accumulate partial JSON */ break;
    case "message_stop":      /* finalize usage + cost */ break;
  }
}
```

`StreamChunk` is a discriminated union — exhaustive `switch` is type-checked.

---

## Tests

`vitest`, fully mocked. No real API calls in CI.

```bash
pnpm --filter @autonomux/llm test
pnpm --filter @autonomux/llm typecheck
```
