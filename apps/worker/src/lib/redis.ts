/**
 * IORedis connection factory for @autonomux/worker.
 *
 * BullMQ requires:
 *  - `maxRetriesPerRequest: null`
 *  - `enableReadyCheck: false`
 * on the connection it uses for blocking commands. We expose two
 * factories:
 *   - createQueueConnection() → for adding/inspecting jobs (default IORedis)
 *   - createWorkerConnection() → for Worker (blocking) consumers
 *
 * Both use the same REDIS_URL but with the BullMQ-required tuning
 * on the worker side. Errors are logged, not swallowed.
 */

import { Redis, type RedisOptions } from "ioredis";
import type { Logger } from "pino";

const RECONNECT_MAX_DELAY_MS = 5_000;
const RECONNECT_BASE_DELAY_MS = 250;

/** Default backoff: capped exponential. */
function reconnectOnError(err: Error): boolean {
  // Reconnect on common transient cases; bubble up otherwise.
  const transientPatterns = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
  return transientPatterns.some((p) => err.message.includes(p));
}

function retryStrategy(times: number): number {
  return Math.min(RECONNECT_BASE_DELAY_MS * 2 ** times, RECONNECT_MAX_DELAY_MS);
}

function baseOptions(): RedisOptions {
  return {
    lazyConnect: false,
    retryStrategy,
    reconnectOnError,
  };
}

/**
 * Connection for Queue / QueueEvents / job inspection.
 * Safe defaults; non-blocking.
 */
export function createQueueConnection(
  redisUrl: string,
  logger: Logger,
): Redis {
  const client = new Redis(redisUrl, {
    ...baseOptions(),
  });

  attachLifecycleLogs(client, logger, "queue");
  return client;
}

/**
 * Connection for BullMQ Workers. BullMQ docs require
 * `maxRetriesPerRequest: null` and `enableReadyCheck: false`
 * when the connection is passed to a Worker.
 */
export function createWorkerConnection(
  redisUrl: string,
  logger: Logger,
): Redis {
  const client = new Redis(redisUrl, {
    ...baseOptions(),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  attachLifecycleLogs(client, logger, "worker");
  return client;
}

function attachLifecycleLogs(
  client: Redis,
  logger: Logger,
  kind: "queue" | "worker",
): void {
  const log = logger.child({ component: "redis", kind });

  client.on("connect", () => log.info("redis connecting"));
  client.on("ready", () => log.info("redis ready"));
  client.on("close", () => log.warn("redis connection closed"));
  client.on("reconnecting", (delay: number) =>
    log.warn({ delay }, "redis reconnecting"),
  );
  client.on("end", () => log.warn("redis connection ended"));
  client.on("error", (err: Error) => {
    // Don't swallow — let pino capture the full error.
    log.error({ err }, "redis error");
  });
}

/**
 * Acquire a per-job idempotency lock via SETNX with TTL.
 * Returns true if the caller owns the lock (first writer wins).
 *
 * Used by every queue's processor before doing real work, so retries
 * carrying the same `requestId` no-op gracefully.
 */
export async function acquireIdempotencyLock(
  client: Redis,
  requestId: string,
  ttlSeconds: number,
): Promise<boolean> {
  const key = `idempotency:${requestId}`;
  // NX = only set if not exists; EX = TTL in seconds.
  const result = await client.set(key, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}
