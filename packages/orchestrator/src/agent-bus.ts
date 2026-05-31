/**
 * @autonomux/orchestrator — agent-bus.
 *
 * Redis pub/sub bridge between:
 *   - the web process (`AlterEgoRuntime` streaming a chat reply); and
 *   - the worker process (BullMQ `mailroom` queue processor and any
 *     future sub-agent).
 *
 * Why a dedicated channel and not BullMQ events: BullMQ events are coarse
 * (waiting/active/completed) and don't carry the structured payload the
 * orchestrator needs to render a `sub_agent_result` block. We publish a
 * narrowly-typed `AgentBusMessage` keyed by `requestId` (the per-job
 * idempotency token). One channel per `requestId` → no fan-out noise.
 *
 * Connection ownership:
 *   This module DOES NOT create its own Redis client. Callers pass an
 *   IORedis instance built with `createQueueConnection()` from
 *   `apps/worker/src/lib/redis.ts`. A second subscriber connection is
 *   spun off via `redis.duplicate()` because IORedis enters subscribe
 *   mode on the underlying socket and that mode forbids ordinary
 *   commands (see ioredis docs §Pub/Sub).
 *
 * Wire shape: JSON, validated on receive with zod. Never log payloads —
 * sub-agent results may carry sender names / subjects (PRD §8.2).
 */
import "server-only";

import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { z } from "zod";

import type { ContentBlock } from "@autonomux/llm";

/** Channel namespace — keep narrow so prod debug `PUBSUB CHANNELS` is grep-friendly. */
const CHANNEL_PREFIX = "autonomux:agent-bus";

function channelFor(requestId: string): string {
  return `${CHANNEL_PREFIX}:${requestId}`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Wire types                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Messages the worker publishes back to the runtime over Redis.
 *
 * `progress` is optional UI sugar — runtimes that don't care can drop it.
 * `complete` is terminal; the subscriber MUST unsubscribe + resolve on it.
 * `error` is terminal-failure; same lifecycle as `complete`.
 */
export type AgentBusMessage =
  | {
      readonly kind: "progress";
      readonly requestId: string;
      readonly sub_agent_name: string;
      readonly message: string;
      readonly progress?: number;
    }
  | {
      readonly kind: "complete";
      readonly requestId: string;
      readonly sub_agent_name: string;
      readonly content: ContentBlock[];
      readonly duration_ms: number;
    }
  | {
      readonly kind: "error";
      readonly requestId: string;
      readonly sub_agent_name: string;
      readonly error_class: string;
      readonly message: string;
      readonly duration_ms: number;
    };

const contentBlockSchema: z.ZodType<ContentBlock> = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.union([z.string(), z.array(z.object({ type: z.literal("text"), text: z.string() }))]),
    is_error: z.boolean().optional(),
  }),
]);

const messageSchema: z.ZodType<AgentBusMessage> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("progress"),
    requestId: z.string().min(1),
    sub_agent_name: z.string().min(1),
    message: z.string(),
    progress: z.number().min(0).max(1).optional(),
  }),
  z.object({
    kind: z.literal("complete"),
    requestId: z.string().min(1),
    sub_agent_name: z.string().min(1),
    content: z.array(contentBlockSchema),
    duration_ms: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("error"),
    requestId: z.string().min(1),
    sub_agent_name: z.string().min(1),
    error_class: z.string().min(1),
    message: z.string(),
    duration_ms: z.number().int().nonnegative(),
  }),
]);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Publisher (called by the worker)                                           */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Publish one message on the per-request channel.
 *
 * The caller — typically a BullMQ processor — owns the publisher
 * connection. We do not create one here so we don't leak a socket per
 * job (workers process many jobs per process).
 */
export async function publishJobEvent(
  publisher: Redis,
  message: AgentBusMessage,
): Promise<void> {
  const validated = messageSchema.parse(message);
  await publisher.publish(channelFor(validated.requestId), JSON.stringify(validated));
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Subscriber (called by the runtime)                                         */
/* ────────────────────────────────────────────────────────────────────────── */

export interface SubscribeOptions {
  /** Hard cap on the wait. After this elapses, the iterator yields a synthetic timeout error and ends. */
  readonly timeoutMs?: number;
  /** Optional logger child — receives only structural noise (no payloads). */
  readonly logger?: Logger;
  /** Abort hook; on signal the subscription unsubscribes and the iterator ends. */
  readonly signal?: AbortSignal;
}

/**
 * Subscribe to all messages for `requestId` and yield them as they arrive.
 *
 * Terminates on the first `complete` or `error` message, on timeout, or
 * on signal abort. ALWAYS unsubscribes + quits the duplicate client on
 * exit (try/finally), so we never leak Redis connections.
 *
 * The caller passes a base IORedis instance; we `.duplicate()` it for
 * the subscriber socket — required by IORedis since subscribe mode is
 * incompatible with ordinary commands.
 */
export async function* subscribeToJob(
  base: Redis,
  requestId: string,
  opts: SubscribeOptions = {},
): AsyncGenerator<AgentBusMessage, void, void> {
  const channel = channelFor(requestId);
  const sub = base.duplicate();
  const log = opts.logger?.child({ component: "agent-bus", channel });

  // Buffered queue + a `notify` promise the consumer awaits.
  const queue: AgentBusMessage[] = [];
  let resolveWait: (() => void) | null = null;
  let waitPromise: Promise<void> = new Promise<void>((r) => {
    resolveWait = r;
  });
  let ended = false;

  function notify(): void {
    if (resolveWait) {
      const r = resolveWait;
      resolveWait = null;
      r();
    }
  }
  function nextWait(): void {
    waitPromise = new Promise<void>((r) => {
      resolveWait = r;
    });
  }

  const onMessage = (incomingChannel: string, raw: string): void => {
    if (incomingChannel !== channel) return;
    try {
      const parsed = messageSchema.parse(JSON.parse(raw) as unknown);
      queue.push(parsed);
      if (parsed.kind === "complete" || parsed.kind === "error") {
        ended = true;
      }
    } catch (err) {
      log?.warn({ err }, "agent-bus: malformed message dropped");
    }
    notify();
  };

  sub.on("message", onMessage);

  const onAbort = (): void => {
    ended = true;
    notify();
  };
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  let timer: NodeJS.Timeout | null = null;
  let timedOut = false;
  if (opts.timeoutMs && opts.timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      ended = true;
      notify();
    }, opts.timeoutMs);
  }

  try {
    await sub.subscribe(channel);

    while (true) {
      while (queue.length > 0) {
        const msg = queue.shift() as AgentBusMessage;
        yield msg;
        if (msg.kind === "complete" || msg.kind === "error") {
          return;
        }
      }
      if (ended) {
        if (timedOut) {
          yield {
            kind: "error",
            requestId,
            sub_agent_name: "unknown",
            error_class: "sub_agent.timeout",
            message: `agent-bus: no completion within ${String(opts.timeoutMs)}ms`,
            duration_ms: opts.timeoutMs ?? 0,
          };
        }
        return;
      }
      await waitPromise;
      nextWait();
    }
  } finally {
    if (timer) clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
    sub.off("message", onMessage);
    try {
      await sub.unsubscribe(channel);
    } catch (err) {
      log?.warn({ err }, "agent-bus: unsubscribe failed");
    }
    try {
      sub.disconnect();
    } catch (err) {
      log?.warn({ err }, "agent-bus: subscriber disconnect failed");
    }
  }
}
