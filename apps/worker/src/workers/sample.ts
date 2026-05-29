/**
 * Sample worker — the reference pattern for sub-agent processors.
 *
 * Honest scope: this is a SAMPLE. It runs on its own queue (`sample`)
 * and does nothing useful. New sub-agent workers (Mailroom processor,
 * Briefing composer, etc.) should follow this shape:
 *
 *   1. Build queue + worker via createQueueConnection / createWorkerConnection
 *   2. Acquire idempotency lock via acquireIdempotencyLock(requestId, ttl)
 *   3. Do work
 *   4. Return a typed result
 *   5. Export start/stop helpers
 *
 * NOT enabled by default. `startSampleWorker()` must be called
 * explicitly from `src/index.ts`.
 */

import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";
import type { Logger } from "pino";

import { acquireIdempotencyLock } from "../lib/redis.js";

export const SAMPLE_QUEUE_NAME = "sample" as const;

export type SampleJobPayload = {
  readonly requestId: string;
  readonly tenantId: string;
  readonly message: string;
};

export type SampleJobResult = {
  readonly requestId: string;
  readonly status: "ok" | "deduped";
  readonly echoed: string;
};

export type SampleWorkerHandle = {
  readonly queue: Queue<SampleJobPayload, SampleJobResult>;
  readonly worker: Worker<SampleJobPayload, SampleJobResult>;
  addJob(
    payload: SampleJobPayload,
    opts?: JobsOptions,
  ): Promise<Job<SampleJobPayload, SampleJobResult>>;
  close(): Promise<void>;
};

const SAMPLE_TTL_SECONDS = 3600;

export type SampleWorkerDeps = {
  readonly queueConnection: Redis;
  readonly workerConnection: Redis;
  readonly logger: Logger;
};

/**
 * Start the sample worker. Returns a handle for adding jobs +
 * a `close()` for graceful shutdown.
 */
export function startSampleWorker(deps: SampleWorkerDeps): SampleWorkerHandle {
  const log = deps.logger.child({
    component: "sample-worker",
    queue: SAMPLE_QUEUE_NAME,
  });

  const queue = new Queue<SampleJobPayload, SampleJobResult>(
    SAMPLE_QUEUE_NAME,
    {
      connection: deps.queueConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 24 * 3600, count: 500 },
      },
    },
  );

  queue.on("error", (err: Error) => log.error({ err }, "sample queue error"));

  const worker = new Worker<SampleJobPayload, SampleJobResult>(
    SAMPLE_QUEUE_NAME,
    async (
      job: Job<SampleJobPayload, SampleJobResult>,
    ): Promise<SampleJobResult> => {
      const acquired = await acquireIdempotencyLock(
        deps.queueConnection,
        job.data.requestId,
        SAMPLE_TTL_SECONDS,
      );

      if (!acquired) {
        log.warn(
          { jobId: job.id, requestId: job.data.requestId },
          "sample job deduped",
        );
        return {
          requestId: job.data.requestId,
          status: "deduped",
          echoed: job.data.message,
        };
      }

      log.info(
        {
          jobId: job.id,
          requestId: job.data.requestId,
          tenantId: job.data.tenantId,
          message: job.data.message,
        },
        "sample job processed",
      );

      return {
        requestId: job.data.requestId,
        status: "ok",
        echoed: job.data.message,
      };
    },
    {
      connection: deps.workerConnection,
      concurrency: 2,
    },
  );

  worker.on("ready", () => log.info("sample worker ready"));
  worker.on("completed", (job, result) =>
    log.info(
      { jobId: job.id, status: result.status },
      "sample job completed",
    ),
  );
  worker.on("failed", (job, err) =>
    log.error({ jobId: job?.id, err }, "sample job failed"),
  );
  worker.on("error", (err) => log.error({ err }, "sample worker error"));

  return {
    queue,
    worker,
    async addJob(
      payload: SampleJobPayload,
      opts?: JobsOptions,
    ): Promise<Job<SampleJobPayload, SampleJobResult>> {
      const job = await queue.add("sample", payload, {
        jobId: payload.requestId,
        ...opts,
      });
      log.info(
        { jobId: job.id, requestId: payload.requestId },
        "sample job enqueued",
      );
      return job;
    },
    async close(): Promise<void> {
      log.info("closing sample worker");
      try {
        await worker.close();
      } catch (err) {
        log.error({ err }, "sample worker close failed");
      }
      try {
        await queue.close();
      } catch (err) {
        log.error({ err }, "sample queue close failed");
      }
    },
  };
}
