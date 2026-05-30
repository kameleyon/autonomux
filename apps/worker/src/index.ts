/**
 * @autonomux/worker — entry point.
 *
 * Boot order:
 *   0. Boot OpenTelemetry  (instrumentation.ts — MUST be first)
 *   1. Load + assert env  (env.ts)
 *   2. Build root logger  (logger.ts, with PII redaction)
 *   3. Open Redis (queue + worker connections, IORedis)
 *   4. Build the queue registry (one Queue + stub Worker per sub-agent)
 *   5. Start the sample worker (reference pattern)
 *   6. Register cron jobs (heartbeat)
 *   7. Wait for SIGTERM / SIGINT, then close everything cleanly
 *
 * Production: Railway runs `node dist/index.js` via Procfile.
 * Local dev:  `npm run dev` runs `tsx watch src/index.ts`.
 */

// MUST be the first import — boots OTel before any auto-instrumented
// module (ioredis, undici, pg, http) loads. Don't move this.
import { bootTelemetry } from "./instrumentation.js";

import process from "node:process";

import { assertEnv } from "./lib/env.js";
import { createLogger } from "./lib/logger.js";
import {
  createQueueConnection,
  createWorkerConnection,
} from "./lib/redis.js";
import {
  closeQueueRegistry,
  createQueueRegistry,
  type QueueRegistry,
} from "./queues/index.js";
import {
  startSampleWorker,
  type SampleWorkerHandle,
} from "./workers/sample.js";
import { registerCronJobs } from "./jobs/cron.js";
import { startHealthServer, type HealthServer } from "./lib/health.js";

import type { TelemetryHandle } from "@autonomux/telemetry";

type Shutdownable = {
  shuttingDown: boolean;
  registry: QueueRegistry;
  sample: SampleWorkerHandle;
  closeRedis: () => Promise<void>;
  telemetry: TelemetryHandle;
  health: HealthServer;
};

async function main(): Promise<void> {
  // Boot telemetry first — no env reads, no logger needed.
  // initTelemetry hard-fails in production if OTEL_EXPORTER_OTLP_ENDPOINT
  // is missing, so this is the right place to surface that.
  const telemetry = bootTelemetry();

  const env = assertEnv();

  const logger = createLogger({
    service: env.SERVICE_NAME,
    env: env.NODE_ENV,
    level: env.LOG_LEVEL,
  });

  logger.info(
    {
      node: process.version,
      env: env.NODE_ENV,
      telemetry_enabled: telemetry.enabled,
    },
    "autonomux worker booting",
  );

  // ---- Redis ----
  const queueConnection = createQueueConnection(env.REDIS_URL, logger);
  const workerConnection = createWorkerConnection(env.REDIS_URL, logger);

  const closeRedis = async (): Promise<void> => {
    try {
      await queueConnection.quit();
    } catch (err) {
      logger.error({ err }, "queue redis quit failed");
    }
    try {
      await workerConnection.quit();
    } catch (err) {
      logger.error({ err }, "worker redis quit failed");
    }
  };

  // ---- Queue registry ----
  const registry = createQueueRegistry({
    queueConnection,
    workerConnection,
    logger,
  });
  logger.info(
    { queues: Object.keys(registry) },
    "queue registry initialized",
  );

  // ---- Sample worker (reference pattern, runs on its own queue) ----
  const sample = startSampleWorker({
    queueConnection,
    workerConnection,
    logger,
  });

  // ---- Cron registration ----
  try {
    await registerCronJobs({
      cronQueue: registry.cron,
      logger,
    });
  } catch (err) {
    logger.error({ err }, "cron registration failed");
    // Cron registration is best-effort at boot; do not abort the worker.
  }

  // ---- Health endpoint (Railway/Vercel/etc require a bound port) ----
  const health = startHealthServer(logger);

  // ---- Shutdown wiring ----
  const state: Shutdownable = {
    shuttingDown: false,
    registry,
    sample,
    closeRedis,
    telemetry,
    health,
  };

  installShutdownHandlers(state, logger);

  logger.info("autonomux worker ready");
}

function installShutdownHandlers(
  state: Shutdownable,
  logger: ReturnType<typeof createLogger>,
): void {
  const shutdown = async (signal: NodeJS.Signals | "uncaught"): Promise<void> => {
    if (state.shuttingDown) {
      logger.warn({ signal }, "shutdown already in progress");
      return;
    }
    state.shuttingDown = true;

    logger.info({ signal }, "shutting down");

    try {
      await state.health.close();
    } catch (err) {
      logger.error({ err }, "health server close failed");
    }

    try {
      await state.sample.close();
    } catch (err) {
      logger.error({ err }, "sample worker close failed");
    }

    try {
      await closeQueueRegistry(state.registry, logger);
    } catch (err) {
      logger.error({ err }, "queue registry close failed");
    }

    try {
      await state.closeRedis();
    } catch (err) {
      logger.error({ err }, "redis close failed");
    }

    // Flush telemetry LAST so shutdown-path spans get exported.
    try {
      await state.telemetry.shutdown();
    } catch (err) {
      logger.error({ err }, "telemetry shutdown failed");
    }

    logger.info("shutdown complete");
    // Flush pino's async transport buffer where possible.
    process.exit(signal === "uncaught" ? 1 : 0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("uncaughtException", (err: Error) => {
    logger.fatal({ err }, "uncaughtException");
    void shutdown("uncaught");
  });
  process.on("unhandledRejection", (reason: unknown) => {
    logger.fatal({ reason }, "unhandledRejection");
    void shutdown("uncaught");
  });
}

main().catch((err: unknown) => {
  // Boot-time failure: env missing, redis unreachable on first try, etc.
  // No logger may be available — use stderr + structured JSON.
  const message =
    err instanceof Error ? err.message : String(err);
  const payload = {
    level: "fatal",
    time: new Date().toISOString(),
    service: "autonomux-worker",
    msg: "boot failed",
    err: message,
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exit(1);
});
