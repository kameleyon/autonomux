/**
 * @autonomux/orchestrator — sub-agent registry.
 *
 * A `SubAgentRegistry` maps a sub-agent's tool name (the LLM sees
 * `tool_use.name`) to:
 *   - its `Tool` schema (shape forwarded to `LlmClient.stream({ tools })`)
 *   - an `invoke()` function that runs the work and returns the
 *     Anthropic-shaped content blocks the runtime will splice into a
 *     `tool_result` message for the next LLM hop.
 *
 * The runtime is intentionally registry-agnostic: it sees `tool_use.name`,
 * looks up the entry, runs `invoke()`, packs the result. New sub-agents
 * (Scheduler, Oracle, Scribe, …) plug in by adding entries — no runtime
 * edits required.
 *
 * Invocation contract:
 *   - `invoke()` MUST be cancellation-aware via `ctx.signal`. The web
 *     SSE bridge cancels on tab close; the runtime forwards that.
 *   - `invoke()` MUST NOT throw on application errors; instead return a
 *     `tool_result`-shaped block with `is_error: true`. The runtime
 *     re-feeds errors to the LLM (so it can recover) rather than
 *     aborting the whole turn.
 *   - `invoke()` MAY publish `progress` messages to the agent-bus
 *     (relayed by the runtime as `sub_agent_progress` events).
 *   - `invoke()` is responsible for its own request_id propagation
 *     (BullMQ jobs use it as the idempotency key per
 *     apps/worker/src/queues/index.ts).
 */
import type { ContentBlock, Tool } from "@autonomux/llm";
import type { SubAgentName } from "@autonomux/db";
import type { Logger } from "pino";
import type { Redis } from "ioredis";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Invocation context                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Everything a sub-agent's `invoke()` needs to do its job without
 * reaching for module-level globals.
 *
 * `redis` is the *queue* connection from `apps/worker/src/lib/redis.ts`;
 * sub-agents that need a subscriber duplicate it themselves via
 * `agent-bus.subscribeToJob()`.
 *
 * `enqueue` lets the sub-agent push work onto a BullMQ queue without
 * importing the worker's queue registry types directly (loose coupling
 * keeps the orchestrator package independent of `apps/worker`).
 */
export interface SubAgentInvokeContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly agentRunId: string;
  readonly subAgentRunId: string;
  /** Per-invocation idempotency key. Use this as the BullMQ jobId. */
  readonly requestId: string;
  /** Cancellation token — propagate to long-running awaits. */
  readonly signal: AbortSignal;
  readonly logger: Logger;
  /** Shared queue/publisher Redis connection. */
  readonly redis: Redis;
  /**
   * Enqueue a BullMQ job and return when the worker publishes a
   * terminal `complete` / `error` on the agent-bus. The runtime fills
   * this in when constructing the context. Mailroom is the sole caller
   * today, but the contract is shared.
   */
  readonly enqueueAndAwait: (args: EnqueueAndAwaitArgs) => Promise<ContentBlock[]>;
}

export interface EnqueueAndAwaitArgs {
  readonly queueName: SubAgentName;
  readonly jobName: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Hard cap. Default 90s, matching the §1 acceptance criterion. */
  readonly timeoutMs?: number;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Registry entry shape                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export type SubAgentInvoke = (
  input: Record<string, unknown>,
  ctx: SubAgentInvokeContext,
) => Promise<ContentBlock[]>;

export interface SubAgentEntry {
  /** The sub-agent's canonical name (matches `sub_agent_name` CHECK in DB). */
  readonly name: SubAgentName;
  /** Tool schema passed to the LLM. `tool.name` is what the model emits. */
  readonly tool: Tool;
  readonly invoke: SubAgentInvoke;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Registry class                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * In-process registry. Construct once at boot, share with every runtime.
 *
 * The registry is keyed by `tool.name` (what the LLM emits) because that
 * is the lookup path on the hot loop. `name` (sub_agent_name DB enum) is
 * a separate field on the entry so the runtime can write the right
 * value into `sub_agent_runs.sub_agent_name`.
 */
export class SubAgentRegistry {
  private readonly byToolName: Map<string, SubAgentEntry> = new Map();

  constructor(entries: readonly SubAgentEntry[] = []) {
    for (const e of entries) this.register(e);
  }

  /** Add or replace an entry. Throws on duplicate registration of the same tool name. */
  register(entry: SubAgentEntry): void {
    if (this.byToolName.has(entry.tool.name)) {
      throw new Error(
        `[SubAgentRegistry] duplicate registration for tool "${entry.tool.name}"`,
      );
    }
    this.byToolName.set(entry.tool.name, entry);
  }

  get(toolName: string): SubAgentEntry | undefined {
    return this.byToolName.get(toolName);
  }

  /** Tools array suitable for `LlmClient.stream({ tools })`. */
  toolList(): Tool[] {
    return Array.from(this.byToolName.values()).map((e) => e.tool);
  }

  /** Iterate entries (e.g. for diagnostics / cpanel). */
  entries(): SubAgentEntry[] {
    return Array.from(this.byToolName.values());
  }

  has(toolName: string): boolean {
    return this.byToolName.has(toolName);
  }
}
