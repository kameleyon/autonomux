/**
 * @autonomux/orchestrator — AlterEgoRuntime.
 *
 * Streams a chat turn:
 *   1. Persist `agent_runs` row (status='running'). If `requestId` was
 *      seen before (UNIQUE index) we short-circuit: re-read the prior
 *      row + replay its `tools_called` as events, then return — no
 *      second LLM call. This is the contract for §1 acceptance #3.
 *   2. Compose the system prompt.
 *   3. Loop:
 *      a. Call `llm.stream(...)` with current messages + tools.
 *      b. Forward `text_delta`s as `OrchestratorEvent`s.
 *      c. On `tool_use_start` + final `message_stop` with
 *         stop_reason=tool_use, accumulate the tool's input JSON,
 *         emit `sub_agent_start`, run the registered sub-agent,
 *         emit `sub_agent_result`, append the result to the conversation,
 *         and loop again.
 *      d. On stop_reason=end_turn, exit the loop.
 *   4. Persist `agent_runs` final state (status, tokens, cost, tools_called).
 *   5. Bump `usage_meters` by the LLM cost (sub-agent LLM costs are
 *      rolled up by the worker side; this layer only knows the
 *      orchestrator's own LLM spend).
 *   6. Yield the `final_usage` event.
 *
 * Safety brakes:
 *   - ORCHESTRATOR_MAX_TOOL_HOPS env (default 6) — hard cap on loop iterations.
 *   - `signal.aborted` checked between hops; aborted runs persist status='cancelled'.
 *
 * Test affordances: the constructor takes an `LlmClient`, a `Redis`,
 * a `Logger`, an optional `dbClient` (defaults to service-role client),
 * and a `SubAgentRegistry`. Everything injectable, no module-level
 * singletons.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import type { Redis } from "ioredis";
import type { Logger } from "pino";

import {
  LlmAuthError,
  LlmBudgetExceededError,
  LlmInvalidRequestError,
  LlmRateLimitError,
  LlmServerError,
  computeCostUsd,
  type ContentBlock,
  type LlmClient,
  type Message,
  type ModelName,
  type StreamChunk,
  type StopReason,
  type Usage,
} from "@autonomux/llm";
import {
  bumpUsageMeter,
  recordAgentRun,
  recordSubAgentRun,
  type AgentRunToolCall,
  type AgentRunTriggerKind,
} from "@autonomux/db";

import { subscribeToJob, type AgentBusMessage } from "./agent-bus";
import type { OrchestratorErrorClass, OrchestratorEvent } from "./events";
import {
  type EnqueueAndAwaitArgs,
  type SubAgentEntry,
  type SubAgentInvokeContext,
  SubAgentRegistry,
} from "./sub-agents/registry";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Public types                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

/** Default model id passed to `@autonomux/llm`. */
export const DEFAULT_MODEL: ModelName = "sonnet-4.6";

const MAX_TOOL_HOPS_DEFAULT = 6;
const MAX_TOKENS_DEFAULT = 4096;
/** Hard cap on a single sub-agent invocation. PRD §1 acceptance: <90s end-to-end. */
const SUB_AGENT_TIMEOUT_MS_DEFAULT = 90_000;

export interface AlterEgoRuntimeOpts {
  readonly llm: LlmClient;
  readonly registry: SubAgentRegistry;
  readonly redis: Redis;
  readonly logger: Logger;
  /**
   * Injection point for tests. Defaults to a service-role enqueuer that
   * uses the worker's BullMQ queues. Production wires this in `apps/web`
   * or `apps/worker` boot.
   */
  readonly enqueue?: BullMqEnqueuer;
  /**
   * Persistence layer. Defaults to live `@autonomux/db` helpers; tests
   * pass in-memory stubs.
   */
  readonly persistence?: PersistenceLayer;
  /** Override default model. */
  readonly model?: ModelName;
  /** Override `ORCHESTRATOR_MAX_TOOL_HOPS`. */
  readonly maxToolHops?: number;
  /** Override max_tokens forwarded to the LLM. */
  readonly maxTokens?: number;
  /** Override per-sub-agent timeout. */
  readonly subAgentTimeoutMs?: number;
}

export interface RunStreamArgs {
  readonly tenantId: string;
  readonly userId: string;
  readonly messages: Message[];
  /** Idempotency token. SAME id = SAME run. New uuid per fresh turn. */
  readonly requestId: string;
  /** Optional pre-composed system prompt. If absent, runtime falls back to a neutral default. */
  readonly system?: string;
  /** Optional parent run id (chat-thread linkage; added in migration 0009). */
  readonly parentRunId?: string;
  readonly triggerKind?: AgentRunTriggerKind;
  readonly signal?: AbortSignal;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Injection seams                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Injection point for the BullMQ enqueue + agent-bus wait. The default
 * implementation lives in `apps/worker` / `apps/web` (which can import
 * the queue registry); the orchestrator package itself never imports
 * BullMQ to keep the dependency surface small and testable.
 */
export type BullMqEnqueuer = (args: {
  readonly tenantId: string;
  readonly requestId: string;
  readonly queueName: string;
  readonly jobName: string;
  readonly payload: Readonly<Record<string, unknown>>;
}) => Promise<void>;

/**
 * Persistence operations the runtime needs. Mirrors the helpers exported
 * from `@autonomux/db`; broken out so tests can swap in a fake.
 */
export interface PersistenceLayer {
  recordAgentRun(args: Parameters<typeof recordAgentRun>[0]): ReturnType<typeof recordAgentRun>;
  recordSubAgentRun(args: Parameters<typeof recordSubAgentRun>[0]): ReturnType<typeof recordSubAgentRun>;
  bumpUsageMeter(args: Parameters<typeof bumpUsageMeter>[0]): ReturnType<typeof bumpUsageMeter>;
}

const defaultPersistence: PersistenceLayer = {
  recordAgentRun,
  recordSubAgentRun,
  bumpUsageMeter,
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  The runtime                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

export class AlterEgoRuntime {
  private readonly llm: LlmClient;
  private readonly registry: SubAgentRegistry;
  private readonly redis: Redis;
  private readonly logger: Logger;
  private readonly enqueue: BullMqEnqueuer | undefined;
  private readonly persistence: PersistenceLayer;
  private readonly model: ModelName;
  private readonly maxToolHops: number;
  private readonly maxTokens: number;
  private readonly subAgentTimeoutMs: number;

  constructor(opts: AlterEgoRuntimeOpts) {
    this.llm = opts.llm;
    this.registry = opts.registry;
    this.redis = opts.redis;
    this.logger = opts.logger.child({ component: "AlterEgoRuntime" });
    this.enqueue = opts.enqueue;
    this.persistence = opts.persistence ?? defaultPersistence;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxToolHops =
      opts.maxToolHops ??
      parseEnvInt("ORCHESTRATOR_MAX_TOOL_HOPS", MAX_TOOL_HOPS_DEFAULT);
    this.maxTokens = opts.maxTokens ?? MAX_TOKENS_DEFAULT;
    this.subAgentTimeoutMs = opts.subAgentTimeoutMs ?? SUB_AGENT_TIMEOUT_MS_DEFAULT;
  }

  /**
   * Stream a chat turn. The caller iterates the returned AsyncIterable
   * and forwards each event to the SSE bridge (or any transport).
   */
  runStream(args: RunStreamArgs): AsyncIterable<OrchestratorEvent> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<OrchestratorEvent> {
        return self.run(args)[Symbol.asyncIterator]();
      },
    };
  }

  /** Implementation generator — the actual streaming loop. */
  private async *run(args: RunStreamArgs): AsyncGenerator<OrchestratorEvent, void, void> {
    const start = Date.now();
    const trigger: AgentRunTriggerKind = args.triggerKind ?? "user_chat";

    // ---- 1. Persist agent_runs row (with idempotency on request_id). ----
    let agentRunId: string;
    let isReplay = false;
    let priorRun: Awaited<ReturnType<typeof recordAgentRun>> | null = null;
    try {
      priorRun = await this.persistence.recordAgentRun({
        tenantId: args.tenantId,
        requestId: args.requestId,
        triggerKind: trigger,
        model: this.model,
        parentRunId: args.parentRunId ?? null,
      });
      agentRunId = priorRun.id;
      isReplay = priorRun.replayed;
    } catch (err) {
      // If we can't even open the run, the only thing left is to emit an error.
      // No agentRunId yet → use the requestId so the client can correlate.
      this.logger.error({ err, requestId: args.requestId }, "agent_runs insert failed");
      yield {
        type: "error",
        agent_run_id: args.requestId,
        error_class: "internal",
        message: "could not open agent_runs row",
      };
      return;
    }

    if (isReplay) {
      this.logger.info(
        { agentRunId, requestId: args.requestId },
        "replaying prior agent_runs row (idempotency hit)",
      );
      yield* this.replayPriorRun(agentRunId, priorRun);
      return;
    }

    // ---- 2. Build conversation + tools. ----
    const messages: Message[] = args.messages.map((m) => ({ ...m }));
    const tools = this.registry.toolList();
    const systemPrompt = args.system ?? DEFAULT_SYSTEM_FALLBACK;

    let hops = 0;
    let aggregateUsage: Usage = { input_tokens: 0, output_tokens: 0 };
    let aggregateCostUsd = 0;
    const toolsCalled: AgentRunToolCall[] = [];
    let finalStopReason: StopReason = "end_turn";

    try {
      // ---- 3. Tool-call loop. ----
      while (true) {
        if (args.signal?.aborted) {
          throw new AbortedError("client cancelled before next LLM call");
        }
        if (hops > this.maxToolHops) {
          throw new MaxHopsExceededError(
            `tool-call loop exceeded MAX_TOOL_HOPS=${String(this.maxToolHops)}`,
          );
        }

        const hopResult = await this.runOneHop({
          agentRunId,
          requestId: args.requestId,
          messages,
          tools,
          systemPrompt,
          signal: args.signal,
        });

        // Roll up usage + cost into the orchestrator's billing snapshot.
        aggregateUsage = {
          input_tokens: aggregateUsage.input_tokens + hopResult.usage.input_tokens,
          output_tokens: aggregateUsage.output_tokens + hopResult.usage.output_tokens,
        };
        aggregateCostUsd += hopResult.costUsd;
        finalStopReason = hopResult.stopReason;

        // Yield the buffered text deltas + tool-use events from this hop.
        for (const ev of hopResult.events) yield ev;

        if (hopResult.stopReason !== "tool_use") {
          // end_turn / max_tokens / stop_sequence — we're done.
          break;
        }

        // Append the assistant message containing the tool_use blocks.
        messages.push({
          role: "assistant",
          content: hopResult.assistantContent,
        });

        // ---- 3c. Execute each tool_use block from this hop. ----
        const toolResults: ContentBlock[] = [];
        for (const tu of hopResult.toolUses) {
          if (args.signal?.aborted) {
            throw new AbortedError("client cancelled mid sub-agent");
          }
          const entry = this.registry.get(tu.name);
          if (!entry) {
            const msg = `Unknown tool "${tu.name}"`;
            this.logger.warn({ toolName: tu.name }, msg);
            yield this.errorEvent(agentRunId, "sub_agent.unknown", msg);
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: msg,
              is_error: true,
            });
            continue;
          }

          const subAgentRunId = randomUUID();
          const subRequestId = `${args.requestId}.${String(hops)}.${tu.id}`;
          const subStart = Date.now();

          // Persist a pending sub_agent_run row.
          await this.persistence.recordSubAgentRun({
            id: subAgentRunId,
            agentRunId,
            tenantId: args.tenantId,
            subAgentName: entry.name,
            status: "running",
            input: tu.input as never,
          });

          yield {
            type: "sub_agent_start",
            agent_run_id: agentRunId,
            sub_agent_run_id: subAgentRunId,
            sub_agent_name: entry.name,
            tool_use_id: tu.id,
            request_id: subRequestId,
            input: tu.input,
          };

          // Invoke the sub-agent. Errors are caught + materialised as
          // is_error tool_result blocks per the SubAgent contract.
          let content: ContentBlock[];
          let isError = false;
          try {
            content = await entry.invoke(tu.input, this.buildInvokeContext({
              tenantId: args.tenantId,
              userId: args.userId,
              agentRunId,
              subAgentRunId,
              requestId: subRequestId,
              signal: args.signal,
              onProgress: (msg: AgentBusMessage) => {
                if (msg.kind === "progress") {
                  // Cannot yield from the inner callback (different generator);
                  // we buffer the progress event by attaching it via the
                  // `progressBuffer` closure below. See note on this design.
                  progressBuffer.push({
                    type: "sub_agent_progress",
                    agent_run_id: agentRunId,
                    sub_agent_run_id: subAgentRunId,
                    sub_agent_name: entry.name,
                    message: msg.message,
                    ...(msg.progress !== undefined ? { progress: msg.progress } : {}),
                  });
                }
              },
            }));
          } catch (err) {
            isError = true;
            const msg = err instanceof Error ? err.message : String(err);
            content = [
              {
                type: "tool_result",
                tool_use_id: tu.id,
                content: `sub_agent.threw: ${msg}`,
                is_error: true,
              },
            ];
          }

          // Patch tool_use_id into any block the sub-agent left blank.
          content = content.map((b) =>
            b.type === "tool_result" && (b.tool_use_id === "" || b.tool_use_id === undefined)
              ? { ...b, tool_use_id: tu.id }
              : b,
          );

          // Drain any progress events that landed during invoke().
          while (progressBuffer.length > 0) {
            const next = progressBuffer.shift();
            if (next) yield next;
          }

          const duration = Date.now() - subStart;
          isError = isError || hasErrorBlock(content);
          await this.persistence.recordSubAgentRun({
            id: subAgentRunId,
            agentRunId,
            tenantId: args.tenantId,
            subAgentName: entry.name,
            status: isError ? "failed" : "success",
            output: content as never,
            durationMs: duration,
            finishedAt: new Date().toISOString(),
          });

          toolsCalled.push({
            name: tu.name,
            sub_agent: entry.name,
            duration_ms: duration,
            status: isError ? "failed" : "success",
            request_id: subRequestId,
          });

          yield {
            type: "sub_agent_result",
            agent_run_id: agentRunId,
            sub_agent_run_id: subAgentRunId,
            sub_agent_name: entry.name,
            tool_use_id: tu.id,
            content,
            is_error: isError,
            duration_ms: duration,
          };

          toolResults.push(...content);
        }

        // Append a user-role message carrying the tool_result blocks
        // (Anthropic convention) and loop.
        messages.push({ role: "user", content: toolResults });
        hops++;
      }

      // ---- 4. Persist final agent_runs state. ----
      const latency = Date.now() - start;
      const costCents = usdToCents(aggregateCostUsd);
      await this.persistence.recordAgentRun({
        id: agentRunId,
        tenantId: args.tenantId,
        requestId: args.requestId,
        triggerKind: trigger,
        model: this.model,
        status: "success",
        inputTokens: aggregateUsage.input_tokens,
        outputTokens: aggregateUsage.output_tokens,
        costUsdCents: costCents,
        durationMs: latency,
        toolsCalled,
        finishedAt: new Date().toISOString(),
      });

      // ---- 5. Roll up usage meter. ----
      if (costCents > 0) {
        await this.persistence.bumpUsageMeter({
          tenantId: args.tenantId,
          deltaUsdCents: costCents,
          deltaTokensIn: aggregateUsage.input_tokens,
          deltaTokensOut: aggregateUsage.output_tokens,
        });
      }

      yield {
        type: "final_usage",
        agent_run_id: agentRunId,
        usage: aggregateUsage,
        cost_usd: aggregateCostUsd,
        latency_ms: latency,
        stop_reason: finalStopReason,
        tool_hops: hops,
      };
    } catch (err) {
      const latency = Date.now() - start;
      const { errorClass, message, status } = classifyError(err);
      try {
        await this.persistence.recordAgentRun({
          id: agentRunId,
          tenantId: args.tenantId,
          requestId: args.requestId,
          triggerKind: trigger,
          model: this.model,
          status,
          inputTokens: aggregateUsage.input_tokens,
          outputTokens: aggregateUsage.output_tokens,
          costUsdCents: usdToCents(aggregateCostUsd),
          durationMs: latency,
          toolsCalled,
          error: message,
          finishedAt: new Date().toISOString(),
        });
      } catch (persistErr) {
        this.logger.error(
          { err: persistErr, agentRunId },
          "failed to persist terminal agent_runs row",
        );
      }
      yield this.errorEvent(agentRunId, errorClass, message);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Hop runner
  // ────────────────────────────────────────────────────────────────────────

  private async runOneHop(args: {
    agentRunId: string;
    requestId: string;
    messages: Message[];
    tools: ReturnType<SubAgentRegistry["toolList"]>;
    systemPrompt: string;
    signal: AbortSignal | undefined;
  }): Promise<HopResult> {
    const events: OrchestratorEvent[] = [];
    const toolUses: ToolUseAccumulator[] = [];
    const assistantContent: ContentBlock[] = [];
    let usage: Usage = { input_tokens: 0, output_tokens: 0 };
    let costUsd = 0;
    let stopReason: StopReason = "end_turn";
    let bufferedText = "";

    // Walk the stream. We accumulate text + tool_use partial JSON, then
    // materialize the assistant message at message_stop.
    const reqOpts: Parameters<LlmClient["stream"]>[0] = {
      model: this.model,
      messages: args.messages,
      system: args.systemPrompt,
      tools: args.tools,
      max_tokens: this.maxTokens,
      request_id: args.requestId,
    };
    if (args.signal !== undefined) {
      reqOpts.signal = args.signal;
    }
    const stream = this.llm.stream(reqOpts);

    for await (const chunk of stream as AsyncIterable<StreamChunk>) {
      if (args.signal?.aborted) {
        throw new AbortedError("client cancelled mid-stream");
      }
      switch (chunk.type) {
        case "message_start":
          // No-op for the orchestrator; spans capture this.
          break;
        case "text_delta":
          bufferedText += chunk.text;
          events.push({
            type: "text_delta",
            agent_run_id: args.agentRunId,
            text: chunk.text,
          });
          break;
        case "tool_use_start":
          toolUses.push({
            id: chunk.id,
            name: chunk.name,
            partialJson: "",
          });
          break;
        case "tool_use_delta": {
          const tu = toolUses.find((t) => t.id === chunk.id);
          if (tu) tu.partialJson += chunk.partial_json;
          break;
        }
        case "message_stop":
          stopReason = chunk.stop_reason;
          usage = chunk.usage;
          costUsd = chunk.cost_usd > 0
            ? chunk.cost_usd
            : computeCostUsd(this.model, this.llm.provider, chunk.usage);
          break;
      }
    }

    if (bufferedText.length > 0) {
      assistantContent.push({ type: "text", text: bufferedText });
    }
    const resolvedToolUses: ToolUseBlockResolved[] = toolUses.map((t) => {
      let input: Record<string, unknown> = {};
      if (t.partialJson.length > 0) {
        try {
          input = JSON.parse(t.partialJson) as Record<string, unknown>;
        } catch {
          input = { _raw: t.partialJson };
        }
      }
      return { id: t.id, name: t.name, input };
    });
    for (const tu of resolvedToolUses) {
      assistantContent.push({
        type: "tool_use",
        id: tu.id,
        name: tu.name,
        input: tu.input,
      });
    }

    return {
      events,
      assistantContent,
      toolUses: resolvedToolUses,
      usage,
      costUsd,
      stopReason,
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Replay path (idempotency hit)
  // ────────────────────────────────────────────────────────────────────────

  /**
   * On `request_id` hit, we don't re-run the LLM. Instead we replay the
   * prior row's `tools_called` + final usage as orchestrator events so
   * the client sees a coherent stream (just instant).
   */
  private async *replayPriorRun(
    agentRunId: string,
    prior: Awaited<ReturnType<typeof recordAgentRun>>,
  ): AsyncGenerator<OrchestratorEvent, void, void> {
    if (prior.replaySnapshot) {
      for (const t of prior.replaySnapshot.toolsCalled) {
        // We don't have the original tool_use_id on a replay — synthesize one
        // so the client can render the card without breaking its key.
        const fakeId = `replay-${t.request_id}`;
        yield {
          type: "sub_agent_start",
          agent_run_id: agentRunId,
          sub_agent_run_id: fakeId,
          sub_agent_name: String(t.sub_agent),
          tool_use_id: fakeId,
          request_id: t.request_id,
          input: {},
        };
        yield {
          type: "sub_agent_result",
          agent_run_id: agentRunId,
          sub_agent_run_id: fakeId,
          sub_agent_name: String(t.sub_agent),
          tool_use_id: fakeId,
          content: [],
          is_error: t.status === "failed",
          duration_ms: t.duration_ms,
        };
      }
      yield {
        type: "final_usage",
        agent_run_id: agentRunId,
        usage: {
          input_tokens: prior.replaySnapshot.inputTokens,
          output_tokens: prior.replaySnapshot.outputTokens,
        },
        cost_usd: prior.replaySnapshot.costUsdCents / 100,
        latency_ms: prior.replaySnapshot.durationMs,
        stop_reason: "end_turn",
        tool_hops: prior.replaySnapshot.toolsCalled.length,
      };
    } else {
      yield {
        type: "final_usage",
        agent_run_id: agentRunId,
        usage: { input_tokens: 0, output_tokens: 0 },
        cost_usd: 0,
        latency_ms: 0,
        stop_reason: "end_turn",
        tool_hops: 0,
      };
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────

  private errorEvent(
    agentRunId: string,
    errorClass: OrchestratorErrorClass,
    message: string,
  ): OrchestratorEvent {
    return { type: "error", agent_run_id: agentRunId, error_class: errorClass, message };
  }

  private buildInvokeContext(args: {
    tenantId: string;
    userId: string;
    agentRunId: string;
    subAgentRunId: string;
    requestId: string;
    signal: AbortSignal | undefined;
    onProgress: (msg: AgentBusMessage) => void;
  }): SubAgentInvokeContext {
    const signal = args.signal ?? new AbortController().signal;

    const enqueueAndAwait = async (eArgs: EnqueueAndAwaitArgs): Promise<ContentBlock[]> => {
      if (!this.enqueue) {
        throw new Error(
          "[AlterEgoRuntime] no BullMQ enqueuer wired; cannot dispatch sub-agent job",
        );
      }
      // Fire the BullMQ enqueue first; worker may publish before this resolves,
      // but the subscriber doesn't care about ordering — it's keyed by requestId.
      await this.enqueue({
        tenantId: args.tenantId,
        requestId: args.requestId,
        queueName: eArgs.queueName,
        jobName: eArgs.jobName,
        payload: eArgs.payload,
      });

      const timeoutMs = eArgs.timeoutMs ?? this.subAgentTimeoutMs;
      const result: ContentBlock[] = [];
      let sawTerminal = false;

      for await (const msg of subscribeToJob(this.redis, args.requestId, {
        timeoutMs,
        logger: this.logger,
        signal,
      })) {
        if (msg.kind === "progress") {
          args.onProgress(msg);
          continue;
        }
        if (msg.kind === "complete") {
          sawTerminal = true;
          result.push(...msg.content);
          break;
        }
        if (msg.kind === "error") {
          sawTerminal = true;
          result.push({
            type: "tool_result",
            tool_use_id: "",
            content: `sub_agent.${msg.error_class}: ${msg.message}`,
            is_error: true,
          });
          break;
        }
      }
      if (!sawTerminal) {
        result.push({
          type: "tool_result",
          tool_use_id: "",
          content: `sub_agent.timeout: no completion within ${String(timeoutMs)}ms`,
          is_error: true,
        });
      }
      return result;
    };

    return {
      tenantId: args.tenantId,
      userId: args.userId,
      agentRunId: args.agentRunId,
      subAgentRunId: args.subAgentRunId,
      requestId: args.requestId,
      signal,
      logger: this.logger.child({ sub_agent_run_id: args.subAgentRunId }),
      redis: this.redis,
      enqueueAndAwait,
    };
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Functional factory                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

/** Convenience: `createAlterEgo(opts).runStream(...)`. */
export function createAlterEgo(opts: AlterEgoRuntimeOpts): AlterEgoRuntime {
  return new AlterEgoRuntime(opts);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Internal types + helpers                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

interface ToolUseAccumulator {
  readonly id: string;
  readonly name: string;
  partialJson: string;
}

interface ToolUseBlockResolved {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

interface HopResult {
  readonly events: OrchestratorEvent[];
  readonly assistantContent: ContentBlock[];
  readonly toolUses: ToolUseBlockResolved[];
  readonly usage: Usage;
  readonly costUsd: number;
  readonly stopReason: StopReason;
}

/**
 * Default system prompt used when the caller doesn't pass one. The
 * web SSE route is expected to compose a richer prompt via
 * `composeSystemPrompt()`; this fallback exists so the runtime is
 * still usable from tests / cron contexts.
 */
const DEFAULT_SYSTEM_FALLBACK = "You are the user's AlterEgo. Reply briefly and helpfully.";

/** Used inside runOneHop to gate yields on the outer signal. */
const progressBuffer: OrchestratorEvent[] = [];

class AbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbortedError";
  }
}
class MaxHopsExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaxHopsExceededError";
  }
}

function hasErrorBlock(blocks: ContentBlock[]): boolean {
  for (const b of blocks) {
    if (b.type === "tool_result" && b.is_error === true) return true;
  }
  return false;
}

function usdToCents(usd: number): number {
  // Round half-up to the nearest cent. We track sub-cent in cost_usd_cents
  // by storing whole cents; bumpUsageMeter aggregates these.
  return Math.round(usd * 100);
}

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function classifyError(err: unknown): {
  errorClass: OrchestratorErrorClass;
  message: string;
  status: "failed" | "cancelled";
} {
  if (err instanceof AbortedError) {
    return { errorClass: "internal", message: err.message, status: "cancelled" };
  }
  if (err instanceof MaxHopsExceededError) {
    return { errorClass: "internal", message: err.message, status: "failed" };
  }
  if (err instanceof LlmAuthError) {
    return { errorClass: "llm.auth", message: err.message, status: "failed" };
  }
  if (err instanceof LlmRateLimitError) {
    return { errorClass: "llm.rate_limited", message: err.message, status: "failed" };
  }
  if (err instanceof LlmInvalidRequestError) {
    return { errorClass: "llm.invalid_request", message: err.message, status: "failed" };
  }
  if (err instanceof LlmBudgetExceededError) {
    return { errorClass: "llm.budget_exceeded", message: err.message, status: "failed" };
  }
  if (err instanceof LlmServerError) {
    return { errorClass: "llm.server_error", message: err.message, status: "failed" };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { errorClass: "internal", message, status: "failed" };
}
