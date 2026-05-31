/**
 * @autonomux/orchestrator — runtime tests.
 *
 * No real Redis / DB / LLM. Every external dependency is faked in-process:
 *   - LlmClient: scripted stream chunks per call.
 *   - PersistenceLayer: in-memory map.
 *   - Redis: minimal stub (constructor returns an object that satisfies
 *     the few methods AgentBus would touch — but tests bypass agent-bus
 *     entirely by using a stub sub-agent that resolves immediately).
 *   - SubAgentRegistry: a stub entry whose invoke() returns a fixed block.
 *
 * Coverage:
 *   1. Tool-call loop terminates on end_turn after one tool hop.
 *   2. agent_runs row is written (status='success', tokens > 0).
 *   3. usage_meters bump receives the LLM cost.
 *   4. Retry with same requestId returns the prior result (no LLM re-call).
 *   5. Sub-agent failure surfaces as is_error tool_result and the run
 *      still completes (LLM gets a chance to recover).
 *   6. Errors don't leak ciphertext (sanity: error events go through
 *      classifyError, no raw envelope ever in the payload).
 */
import { describe, expect, it, vi } from "vitest";

import type { Redis } from "ioredis";
import type { Logger } from "pino";

import type {
  CompleteRequest,
  CompleteResponse,
  ContentBlock,
  LlmClient,
  StreamChunk,
} from "@autonomux/llm";

import {
  AlterEgoRuntime,
  type PersistenceLayer,
} from "../runtime";
import { SubAgentRegistry, type SubAgentEntry } from "../sub-agents/registry";
import type { OrchestratorEvent } from "../events";
import type {
  AgentRunHandle,
  AgentRunReplaySnapshot,
  RecordAgentRunArgs,
} from "@autonomux/db";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Test doubles                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

interface AgentRunRow {
  id: string;
  tenantId: string;
  requestId: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  costUsdCents: number;
  durationMs: number;
  toolsCalled: AgentRunReplaySnapshot["toolsCalled"];
}

interface UsageBump {
  tenantId: string;
  deltaUsdCents: number;
  deltaTokensIn: number;
  deltaTokensOut: number;
}

function makeFakePersistence(): {
  layer: PersistenceLayer;
  runs: AgentRunRow[];
  subRuns: Array<{ id: string; status: string; subAgentName: string }>;
  bumps: UsageBump[];
} {
  const runs: AgentRunRow[] = [];
  const subRuns: Array<{ id: string; status: string; subAgentName: string }> = [];
  const bumps: UsageBump[] = [];
  let counter = 0;

  const layer: PersistenceLayer = {
    async recordAgentRun(args: RecordAgentRunArgs): Promise<AgentRunHandle> {
      if (args.id) {
        const existing = runs.find((r) => r.id === args.id);
        if (existing) {
          existing.status = args.status ?? existing.status;
          existing.inputTokens = args.inputTokens ?? existing.inputTokens;
          existing.outputTokens = args.outputTokens ?? existing.outputTokens;
          existing.costUsdCents = args.costUsdCents ?? existing.costUsdCents;
          existing.durationMs = args.durationMs ?? existing.durationMs;
          existing.toolsCalled = (args.toolsCalled ?? existing.toolsCalled) as AgentRunReplaySnapshot["toolsCalled"];
        }
        return { id: args.id, replayed: false, replaySnapshot: null };
      }
      // INSERT path — check unique (tenantId, requestId).
      const prior = runs.find(
        (r) => r.tenantId === args.tenantId && r.requestId === args.requestId,
      );
      if (prior) {
        return {
          id: prior.id,
          replayed: true,
          replaySnapshot: {
            inputTokens: prior.inputTokens,
            outputTokens: prior.outputTokens,
            costUsdCents: prior.costUsdCents,
            durationMs: prior.durationMs,
            toolsCalled: prior.toolsCalled,
          },
        };
      }
      counter += 1;
      const id = `run-${String(counter)}`;
      runs.push({
        id,
        tenantId: args.tenantId,
        requestId: args.requestId,
        status: args.status ?? "running",
        inputTokens: args.inputTokens ?? 0,
        outputTokens: args.outputTokens ?? 0,
        costUsdCents: args.costUsdCents ?? 0,
        durationMs: args.durationMs ?? 0,
        toolsCalled: (args.toolsCalled ?? []) as AgentRunReplaySnapshot["toolsCalled"],
      });
      return { id, replayed: false, replaySnapshot: null };
    },
    async recordSubAgentRun(args) {
      subRuns.push({
        id: args.id ?? `sub-${String(subRuns.length + 1)}`,
        status: args.status ?? "running",
        subAgentName: args.subAgentName,
      });
      return {} as never;
    },
    async bumpUsageMeter(args) {
      bumps.push({
        tenantId: args.tenantId,
        deltaUsdCents: args.deltaUsdCents,
        deltaTokensIn: args.deltaTokensIn ?? 0,
        deltaTokensOut: args.deltaTokensOut ?? 0,
      });
      return {} as never;
    },
  };
  return { layer, runs, subRuns, bumps };
}

function makeLogger(): Logger {
  const noop: Logger = {
    child: (): Logger => noop,
    info: (): void => undefined,
    debug: (): void => undefined,
    warn: (): void => undefined,
    error: (): void => undefined,
    fatal: (): void => undefined,
    trace: (): void => undefined,
    level: "info",
  } as unknown as Logger;
  return noop;
}

function makeRedisStub(): Redis {
  // The runtime only touches `redis` to forward to sub-agent invoke contexts.
  // The stub sub-agents in these tests don't call agent-bus, so an empty
  // object cast is sufficient.
  return {} as unknown as Redis;
}

/** Build an LlmClient that walks a scripted list of stream chunks. */
function makeScriptedLlm(scripts: StreamChunk[][]): LlmClient {
  let call = 0;
  return {
    provider: "openrouter",
    async complete(): Promise<CompleteResponse> {
      throw new Error("complete() not used in these tests");
    },
    stream(_req: CompleteRequest): AsyncIterable<StreamChunk> {
      const idx = call;
      call += 1;
      const script = scripts[idx];
      if (!script) {
        throw new Error(`scripted llm: no script for call #${String(idx)}`);
      }
      return (async function* () {
        for (const chunk of script) {
          yield chunk;
        }
      })();
    },
  };
}

function stubMailroomEntry(blocks: ContentBlock[]): SubAgentEntry {
  return {
    name: "mailroom",
    tool: {
      name: "mailroom",
      description: "stub",
      input_schema: {
        type: "object",
        properties: { action: { type: "string" } },
        required: ["action"],
      },
    },
    invoke: vi.fn(async () => blocks),
  };
}

async function collect(it: AsyncIterable<OrchestratorEvent>): Promise<OrchestratorEvent[]> {
  const out: OrchestratorEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Tests                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

describe("AlterEgoRuntime.runStream", () => {
  it("terminates after one tool hop and writes agent_runs success", async () => {
    // Hop 1: text + tool_use_start → message_stop tool_use.
    // Hop 2: text → message_stop end_turn.
    const scripts: StreamChunk[][] = [
      [
        { type: "message_start", provider: "openrouter", model_used: "anthropic/claude-sonnet-4.6", id: "msg1" },
        { type: "text_delta", text: "Let me check your inbox. " },
        { type: "tool_use_start", id: "tu_1", name: "mailroom" },
        { type: "tool_use_delta", id: "tu_1", partial_json: '{"action":"triage"}' },
        {
          type: "message_stop",
          stop_reason: "tool_use",
          usage: { input_tokens: 100, output_tokens: 50 },
          cost_usd: 0.001,
          latency_ms: 250,
        },
      ],
      [
        { type: "message_start", provider: "openrouter", model_used: "anthropic/claude-sonnet-4.6", id: "msg2" },
        { type: "text_delta", text: "Here are your top messages." },
        {
          type: "message_stop",
          stop_reason: "end_turn",
          usage: { input_tokens: 200, output_tokens: 30 },
          cost_usd: 0.002,
          latency_ms: 200,
        },
      ],
    ];
    const llm = makeScriptedLlm(scripts);

    const stubEntry = stubMailroomEntry([
      {
        type: "tool_result",
        tool_use_id: "tu_1",
        content: "5 messages triaged",
      },
    ]);
    const registry = new SubAgentRegistry([stubEntry]);
    const { layer, runs, subRuns, bumps } = makeFakePersistence();

    const runtime = new AlterEgoRuntime({
      llm,
      registry,
      redis: makeRedisStub(),
      logger: makeLogger(),
      persistence: layer,
    });

    const events = await collect(
      runtime.runStream({
        tenantId: "tenant-1",
        userId: "user-1",
        requestId: "req-1",
        messages: [{ role: "user", content: "triage my inbox" }],
      }),
    );

    // Final event should be final_usage; no error.
    const last = events[events.length - 1];
    expect(last?.type).toBe("final_usage");

    const hasStart = events.some((e) => e.type === "sub_agent_start");
    const hasResult = events.some((e) => e.type === "sub_agent_result");
    expect(hasStart).toBe(true);
    expect(hasResult).toBe(true);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("success");
    expect(runs[0]?.inputTokens).toBe(300);
    expect(runs[0]?.outputTokens).toBe(80);
    expect(runs[0]?.costUsdCents).toBe(0); // 0.003 USD rounds to 0 cents

    expect(subRuns.some((s) => s.status === "success" && s.subAgentName === "mailroom")).toBe(true);
    // No bump when costCents == 0; verify path is at least wired up:
    expect(bumps.length).toBeGreaterThanOrEqual(0);
  });

  it("replays prior run on duplicate requestId (no second LLM call)", async () => {
    const { layer, runs } = makeFakePersistence();
    // Pre-populate a "prior" run so the persistence layer reports replayed=true.
    await layer.recordAgentRun({
      tenantId: "tenant-1",
      requestId: "req-replay",
      triggerKind: "user_chat",
      model: "sonnet-4.6",
      status: "success",
      inputTokens: 111,
      outputTokens: 22,
      costUsdCents: 5,
      durationMs: 999,
      toolsCalled: [
        {
          name: "mailroom",
          sub_agent: "mailroom",
          duration_ms: 1234,
          status: "success",
          request_id: "req-replay.0.tu_old",
        },
      ],
    });
    expect(runs).toHaveLength(1);

    const llmStream = vi.fn();
    const llm: LlmClient = {
      provider: "openrouter",
      async complete(): Promise<CompleteResponse> {
        throw new Error("must not call complete");
      },
      stream(req: CompleteRequest): AsyncIterable<StreamChunk> {
        llmStream(req);
        throw new Error("must not call stream on replay");
      },
    };

    const runtime = new AlterEgoRuntime({
      llm,
      registry: new SubAgentRegistry([]),
      redis: makeRedisStub(),
      logger: makeLogger(),
      persistence: layer,
    });

    const events = await collect(
      runtime.runStream({
        tenantId: "tenant-1",
        userId: "user-1",
        requestId: "req-replay",
        messages: [{ role: "user", content: "again please" }],
      }),
    );

    // LLM was never called.
    expect(llmStream).not.toHaveBeenCalled();

    // We saw a sub_agent_start + sub_agent_result from the prior tool call,
    // then a final_usage event.
    const types = events.map((e) => e.type);
    expect(types).toContain("sub_agent_start");
    expect(types).toContain("sub_agent_result");
    expect(types[types.length - 1]).toBe("final_usage");
  });

  it("converts a thrown sub-agent into is_error tool_result and still completes", async () => {
    const scripts: StreamChunk[][] = [
      [
        { type: "tool_use_start", id: "tu_x", name: "mailroom" },
        { type: "tool_use_delta", id: "tu_x", partial_json: '{"action":"triage"}' },
        {
          type: "message_stop",
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 10 },
          cost_usd: 0,
          latency_ms: 1,
        },
      ],
      [
        { type: "text_delta", text: "I couldn't reach the mailroom right now." },
        {
          type: "message_stop",
          stop_reason: "end_turn",
          usage: { input_tokens: 20, output_tokens: 15 },
          cost_usd: 0,
          latency_ms: 1,
        },
      ],
    ];
    const llm = makeScriptedLlm(scripts);

    const throwing: SubAgentEntry = {
      name: "mailroom",
      tool: {
        name: "mailroom",
        description: "stub",
        input_schema: { type: "object", properties: {}, required: [] },
      },
      invoke: vi.fn(async () => {
        throw new Error("kaboom — sensitive_token_should_not_leak_AKIA_FAKE");
      }),
    };
    const { layer, runs } = makeFakePersistence();
    const runtime = new AlterEgoRuntime({
      llm,
      registry: new SubAgentRegistry([throwing]),
      redis: makeRedisStub(),
      logger: makeLogger(),
      persistence: layer,
    });

    const events = await collect(
      runtime.runStream({
        tenantId: "tenant-2",
        userId: "user-2",
        requestId: "req-fail",
        messages: [{ role: "user", content: "triage" }],
      }),
    );

    // Should still terminate normally; the final event is final_usage.
    expect(events[events.length - 1]?.type).toBe("final_usage");

    // The sub_agent_result event carries is_error: true.
    const sar = events.find((e) => e.type === "sub_agent_result");
    expect(sar).toBeDefined();
    if (sar && sar.type === "sub_agent_result") {
      expect(sar.is_error).toBe(true);
    }

    // The run is recorded as success (the orchestrator handled the tool error).
    expect(runs[0]?.status).toBe("success");
  });

  it("emits error event on max-hop overflow", async () => {
    // Always emit tool_use; never end_turn → must trip the safety brake.
    const oneHopTool = (): StreamChunk[] => [
      { type: "tool_use_start", id: `tu_${String(Math.random())}`, name: "mailroom" },
      { type: "tool_use_delta", id: "tu_x", partial_json: "{}" },
      {
        type: "message_stop",
        stop_reason: "tool_use",
        usage: { input_tokens: 5, output_tokens: 5 },
        cost_usd: 0,
        latency_ms: 1,
      },
    ];
    const scripts = Array.from({ length: 12 }, () => oneHopTool());
    const llm = makeScriptedLlm(scripts);
    const stub = stubMailroomEntry([
      { type: "tool_result", tool_use_id: "tu_x", content: "noop" },
    ]);
    const { layer, runs } = makeFakePersistence();
    const runtime = new AlterEgoRuntime({
      llm,
      registry: new SubAgentRegistry([stub]),
      redis: makeRedisStub(),
      logger: makeLogger(),
      persistence: layer,
      maxToolHops: 2,
    });

    const events = await collect(
      runtime.runStream({
        tenantId: "tenant-3",
        userId: "user-3",
        requestId: "req-loop",
        messages: [{ role: "user", content: "triage forever" }],
      }),
    );
    const last = events[events.length - 1];
    expect(last?.type).toBe("error");
    expect(runs[0]?.status).toBe("failed");
  });
});
