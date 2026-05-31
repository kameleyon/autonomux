/**
 * @autonomux/orchestrator — Scheduler sub-agent tool tests.
 *
 * Exercises the registry entry exported by `sub-agents/scheduler.tool.ts`
 * without spinning up Redis/BullMQ:
 *   1. Valid `read_today` input is forwarded to `enqueueAndAwait` with the
 *      correct queue + job name, and the worker's content blocks are
 *      returned verbatim.
 *   2. Invalid input (bad action) returns a single `tool_result` block
 *      with `is_error: true` and does NOT throw.
 *   3. A thrown error from `enqueueAndAwait` is caught and converted to a
 *      `tool_result` block with `is_error: true`.
 */
import { describe, expect, it, vi } from "vitest";

import type { Redis } from "ioredis";
import type { Logger } from "pino";

import type { ContentBlock } from "@autonomux/llm";

import { schedulerEntry } from "../sub-agents/scheduler.tool";
import {
  SubAgentRegistry,
  type EnqueueAndAwaitArgs,
  type SubAgentInvokeContext,
} from "../sub-agents/registry";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Test doubles                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

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

function makeCtx(
  enqueueAndAwait: (args: EnqueueAndAwaitArgs) => Promise<ContentBlock[]>,
): SubAgentInvokeContext {
  return {
    tenantId: "tenant-1",
    userId: "user-1",
    agentRunId: "run-1",
    subAgentRunId: "sub-1",
    requestId: "req-1",
    signal: new AbortController().signal,
    logger: makeLogger(),
    redis: {} as unknown as Redis,
    enqueueAndAwait,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Tests                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

describe("schedulerEntry", () => {
  it("registers cleanly on a SubAgentRegistry", () => {
    const registry = new SubAgentRegistry();
    registry.register(schedulerEntry);
    expect(registry.has("scheduler")).toBe(true);
    expect(registry.get("scheduler")).toBe(schedulerEntry);
  });

  it("forwards a valid read_today payload to enqueueAndAwait and returns the worker blocks verbatim", async () => {
    const workerBlocks: ContentBlock[] = [
      { type: "text", text: "3 events today" },
    ];
    const enqueueAndAwait = vi.fn(async (args: EnqueueAndAwaitArgs) => {
      expect(args.queueName).toBe("scheduler");
      expect(args.jobName).toBe("scheduler.read_today");
      expect(args.payload).toEqual({ action: "read_today" });
      return workerBlocks;
    });

    const result = await schedulerEntry.invoke(
      { action: "read_today" },
      makeCtx(enqueueAndAwait),
    );

    expect(enqueueAndAwait).toHaveBeenCalledTimes(1);
    expect(result).toBe(workerBlocks);
  });

  it("forwards a valid read_range payload with the right job name", async () => {
    const workerBlocks: ContentBlock[] = [
      { type: "text", text: "1 event in range" },
    ];
    const enqueueAndAwait = vi.fn(async (args: EnqueueAndAwaitArgs) => {
      expect(args.queueName).toBe("scheduler");
      expect(args.jobName).toBe("scheduler.read_range");
      return workerBlocks;
    });

    const result = await schedulerEntry.invoke(
      {
        action: "read_range",
        start_iso: "2026-05-31T00:00:00-05:00",
        end_iso: "2026-06-07T00:00:00-05:00",
      },
      makeCtx(enqueueAndAwait),
    );

    expect(enqueueAndAwait).toHaveBeenCalledTimes(1);
    expect(result).toBe(workerBlocks);
  });

  it("returns is_error tool_result on invalid input without throwing", async () => {
    const enqueueAndAwait = vi.fn(async () => {
      throw new Error("must not be called on invalid input");
    });

    const result = await schedulerEntry.invoke(
      { action: "garbage" },
      makeCtx(enqueueAndAwait),
    );

    expect(enqueueAndAwait).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    const block = result[0];
    expect(block?.type).toBe("tool_result");
    if (block?.type === "tool_result") {
      expect(block.is_error).toBe(true);
      expect(String(block.content)).toContain("scheduler.invalid_input");
    }
  });

  it("returns is_error tool_result when enqueueAndAwait throws", async () => {
    const enqueueAndAwait = vi.fn(async () => {
      throw new Error("redis down");
    });

    const result = await schedulerEntry.invoke(
      { action: "read_today" },
      makeCtx(enqueueAndAwait),
    );

    expect(enqueueAndAwait).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    const block = result[0];
    expect(block?.type).toBe("tool_result");
    if (block?.type === "tool_result") {
      expect(block.is_error).toBe(true);
      expect(String(block.content)).toContain("scheduler.failed");
      expect(String(block.content)).toContain("redis down");
    }
  });
});
