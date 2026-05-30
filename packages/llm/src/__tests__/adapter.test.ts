/**
 * Adapter parity tests.
 *
 * Verify both adapters:
 *  - expose the same structural interface
 *  - compute identical cost from identical usage (modulo the OR markup)
 *  - normalize tool_use response shapes consistently
 *
 * No real API calls — fetch is mocked, the Anthropic SDK is hit against
 * a custom base_url + injected fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterAdapter } from "../adapters/openrouter";
import { createAnthropicAdapter } from "../adapters/anthropic";
import type { AdapterCtx, LlmAdapter } from "../adapters/types";
import { createLlmClient } from "../client";
import {
  LlmAuthError,
  LlmInvalidRequestError,
  LlmRateLimitError,
  LlmServerError,
} from "../errors";
import { PRICING, computeCostUsd } from "../pricing";
import type { CompleteRequest, CompleteResponse } from "../types";
import { TokenBudget } from "../util/budget";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Helpers — mock providers                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

const ctx: AdapterCtx = {};

const baseReq: CompleteRequest = {
  model: "sonnet-4.6",
  messages: [{ role: "user", content: "ping" }],
  max_tokens: 256,
};

function mockFetchJson(body: unknown, init: ResponseInit = {}): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    }),
  ) as unknown as typeof fetch;
}

function mockFetchText(text: string, init: ResponseInit = {}): typeof fetch {
  return vi.fn(async () =>
    new Response(text, { status: 200, ...init }),
  ) as unknown as typeof fetch;
}

const ORIG_ENV = { ...process.env };
beforeEach(() => {
  process.env["OPENROUTER_API_KEY"] = "or-test";
  process.env["ANTHROPIC_API_KEY"] = "ant-test";
});
afterEach(() => {
  process.env = { ...ORIG_ENV };
  vi.restoreAllMocks();
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Structural parity                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

describe("adapter parity — structural", () => {
  it("both adapters expose the same surface", () => {
    const or: LlmAdapter = createOpenRouterAdapter(ctx, {
      api_key: "or-test",
      fetch_impl: mockFetchJson({}),
    });
    const an: LlmAdapter = createAnthropicAdapter(ctx, { api_key: "ant-test" });
    expect(typeof or.complete).toBe("function");
    expect(typeof an.complete).toBe("function");
    expect(typeof or.stream).toBe("function");
    expect(typeof an.stream).toBe("function");
    expect(or.provider).toBe("openrouter");
    expect(an.provider).toBe("anthropic");
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Cost parity                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

describe("cost computation", () => {
  it("computes anthropic vs openrouter cost from the pricing table", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 500_000 };

    const anthropicCost = computeCostUsd("sonnet-4.6", "anthropic", usage);
    const openrouterCost = computeCostUsd("sonnet-4.6", "openrouter", usage);

    expect(anthropicCost).toBeCloseTo(
      PRICING["sonnet-4.6"].anthropic.in +
        PRICING["sonnet-4.6"].anthropic.out * 0.5,
      6,
    );
    expect(openrouterCost).toBeCloseTo(
      PRICING["sonnet-4.6"].openrouter.in +
        PRICING["sonnet-4.6"].openrouter.out * 0.5,
      6,
    );
    // OpenRouter is more expensive by the markup.
    expect(openrouterCost).toBeGreaterThan(anthropicCost);
  });

  it("both adapters report cost on identical usage", async () => {
    const usage = { input_tokens: 1234, output_tokens: 5678 };

    // --- OpenRouter mock returns OpenAI-shape with usage. ---
    const orFetch = mockFetchJson({
      id: "or-1",
      model: "anthropic/claude-sonnet-4.6",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "hi" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: usage.input_tokens,
        completion_tokens: usage.output_tokens,
        total_tokens: usage.input_tokens + usage.output_tokens,
      },
    });
    const or = createOpenRouterAdapter(ctx, {
      api_key: "or-test",
      fetch_impl: orFetch,
    });
    const orRes = await or.complete(baseReq);
    expect(orRes.usage).toEqual(usage);
    expect(orRes.cost_usd).toBeCloseTo(
      computeCostUsd("sonnet-4.6", "openrouter", usage),
      6,
    );
    expect(orRes.provider).toBe("openrouter");

    // --- Anthropic mock via SDK custom fetch. ---
    const anthropicResponse = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn",
      stop_sequence: null,
      content: [{ type: "text", text: "hi" }],
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      },
    };
    const anFetch = mockFetchJson(anthropicResponse);
    // Stub the global fetch the Anthropic SDK uses internally.
    vi.stubGlobal("fetch", anFetch);

    const an = createAnthropicAdapter(ctx, { api_key: "ant-test" });
    const anRes = await an.complete(baseReq);
    expect(anRes.usage).toEqual(usage);
    expect(anRes.cost_usd).toBeCloseTo(
      computeCostUsd("sonnet-4.6", "anthropic", usage),
      6,
    );
    expect(anRes.provider).toBe("anthropic");
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Tool-use shape parity                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

describe("tool_use normalization", () => {
  const toolReq: CompleteRequest = {
    ...baseReq,
    tools: [
      {
        name: "get_weather",
        description: "Get weather",
        input_schema: { type: "object", properties: { city: { type: "string" } } },
      },
    ],
    messages: [{ role: "user", content: "weather in paris?" }],
  };

  it("openrouter tool_calls → ToolUseBlock", async () => {
    const orFetch = mockFetchJson({
      id: "or-2",
      model: "anthropic/claude-sonnet-4.6",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: JSON.stringify({ city: "Paris" }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
    const or = createOpenRouterAdapter(ctx, {
      api_key: "or-test",
      fetch_impl: orFetch,
    });
    const res: CompleteResponse = await or.complete(toolReq);
    expect(res.stop_reason).toBe("tool_use");
    expect(res.content).toHaveLength(1);
    const block = res.content[0]!;
    expect(block.type).toBe("tool_use");
    if (block.type === "tool_use") {
      expect(block.id).toBe("call_1");
      expect(block.name).toBe("get_weather");
      expect(block.input).toEqual({ city: "Paris" });
    }
  });

  it("anthropic tool_use block passes through unchanged", async () => {
    const anthropicResponse = {
      id: "msg_2",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      stop_reason: "tool_use",
      stop_sequence: null,
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "get_weather",
          input: { city: "Paris" },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    };
    vi.stubGlobal("fetch", mockFetchJson(anthropicResponse));
    const an = createAnthropicAdapter(ctx, { api_key: "ant-test" });
    const res: CompleteResponse = await an.complete(toolReq);
    expect(res.stop_reason).toBe("tool_use");
    expect(res.content).toHaveLength(1);
    const block = res.content[0]!;
    expect(block.type).toBe("tool_use");
    if (block.type === "tool_use") {
      expect(block.name).toBe("get_weather");
      expect(block.input).toEqual({ city: "Paris" });
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Error translation                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

describe("error translation (openrouter)", () => {
  it("401 → LlmAuthError", async () => {
    const fetchImpl = mockFetchText("unauthorized", { status: 401 });
    const or = createOpenRouterAdapter(ctx, {
      api_key: "or-test",
      fetch_impl: fetchImpl,
    });
    await expect(or.complete(baseReq)).rejects.toBeInstanceOf(LlmAuthError);
  });

  it("400 → LlmInvalidRequestError (no retry)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("bad", { status: 400 }),
    ) as unknown as typeof fetch;
    const or = createOpenRouterAdapter(ctx, {
      api_key: "or-test",
      fetch_impl: fetchImpl,
    });
    await expect(or.complete(baseReq)).rejects.toBeInstanceOf(
      LlmInvalidRequestError,
    );
    // Only one call — no retry.
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls)
      .toHaveLength(1);
  });

  it("429 → LlmRateLimitError with retry-after parsed", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("slow down", {
        status: 429,
        headers: { "retry-after": "2" },
      }),
    ) as unknown as typeof fetch;
    const or = createOpenRouterAdapter(ctx, {
      api_key: "or-test",
      fetch_impl: fetchImpl,
    });
    // Disable real retry sleep by aborting after first error — we just want
    // to verify the typed error surfaces.
    await expect(
      or.complete({ ...baseReq, request_id: "test-429" }),
    ).rejects.toBeInstanceOf(LlmRateLimitError);
  }, 20_000);

  it("500 → LlmServerError after retries exhausted", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("boom", { status: 500 }),
    ) as unknown as typeof fetch;
    const or = createOpenRouterAdapter(ctx, {
      api_key: "or-test",
      fetch_impl: fetchImpl,
    });
    await expect(or.complete(baseReq)).rejects.toBeInstanceOf(LlmServerError);
  }, 30_000);
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Provider selection via env                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

describe("createLlmClient — provider resolution", () => {
  it("defaults to openrouter", () => {
    delete process.env["LLM_PROVIDER"];
    const client = createLlmClient({
      openrouter_api_key: "or-test",
      fetch_impl: mockFetchJson({}),
    });
    expect(client.provider).toBe("openrouter");
  });

  it("switches to anthropic when LLM_PROVIDER=anthropic", () => {
    process.env["LLM_PROVIDER"] = "anthropic";
    const client = createLlmClient({ anthropic_api_key: "ant-test" });
    expect(client.provider).toBe("anthropic");
  });

  it("rejects unknown providers", () => {
    process.env["LLM_PROVIDER"] = "openai";
    expect(() => createLlmClient()).toThrow(LlmInvalidRequestError);
  });

  it("throws LlmAuthError when key is missing", () => {
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["LLM_PROVIDER"];
    expect(() => createLlmClient()).toThrow(LlmAuthError);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Budget                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

describe("TokenBudget", () => {
  it("charges and tracks remaining", () => {
    const b = new TokenBudget({ limit_tokens: 10_000, tenant_id: "t1" });
    b.charge(1000, 500, "sonnet-4.6");
    expect(b.used_tokens).toBeGreaterThan(0);
    expect(b.remaining).toBeLessThan(10_000);
  });

  it("throws when exceeded", () => {
    const b = new TokenBudget({ limit_tokens: 100, tenant_id: "t1" });
    expect(() => b.charge(10_000, 10_000, "sonnet-4.6")).toThrow();
  });

  it("haiku consumes fewer normalized tokens than sonnet for same raw counts", () => {
    const a = new TokenBudget({ limit_tokens: 10_000_000 });
    const b = new TokenBudget({ limit_tokens: 10_000_000 });
    a.charge(1000, 1000, "sonnet-4.6");
    b.charge(1000, 1000, "haiku-4.5");
    expect(b.used_tokens).toBeLessThan(a.used_tokens);
  });

  it("integrates with adapter — usage is charged after call", async () => {
    const usage = { input_tokens: 100, output_tokens: 50 };
    const orFetch = mockFetchJson({
      id: "or-3",
      model: "anthropic/claude-sonnet-4.6",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: usage.input_tokens,
        completion_tokens: usage.output_tokens,
        total_tokens: 150,
      },
    });
    const or = createOpenRouterAdapter(ctx, {
      api_key: "or-test",
      fetch_impl: orFetch,
    });
    const budget = new TokenBudget({ limit_tokens: 1_000_000 });
    await or.complete({ ...baseReq, budget });
    expect(budget.used_tokens).toBeGreaterThan(0);
  });
});
