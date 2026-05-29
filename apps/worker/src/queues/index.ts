/**
 * Central queue + worker registry for @autonomux/worker.
 *
 * Each sub-agent gets its own BullMQ queue (PRD §4.1):
 *   - agentQueue      — AlterEgo orchestration runs (root)
 *   - mailroomQueue   — Email triage
 *   - schedulerQueue  — Calendar scans
 *   - scribeQueue     — Article drafting + publishing
 *   - oracleQueue     — Daily cardology/astrology/tarot reading
 *   - treasurerQueue  — Plaid sync + bill checks
 *   - briefingQueue   — Morning briefing composition + delivery
 *   - auditQueue      — Audit log signed-chain checkpoints
 *   - cronQueue       — Time-triggered jobs (heartbeat, daily checkpoint)
 *
 * At Phase 1.0-A4 each queue ships with a placeholder Worker that
 * logs the job and returns success. Real processors land per-sub-agent
 * in later phases. The shape (job payload type, addJob helper,
 * idempotency guard) is locked NOW so callers can be built against it.
 */

import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";
import type { Logger } from "pino";

import { acquireIdempotencyLock } from "../lib/redis.js";

// ---------------------------------------------------------------------------
// Queue names (string-typed so they survive minification / lib boundaries)
// ---------------------------------------------------------------------------

export const QUEUE_NAMES = {
  agent: "agent",
  mailroom: "mailroom",
  scheduler: "scheduler",
  scribe: "scribe",
  oracle: "oracle",
  treasurer: "treasurer",
  briefing: "briefing",
  audit: "audit",
  cron: "cron",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ---------------------------------------------------------------------------
// Job payload contract (all sub-agent jobs share this base)
// ---------------------------------------------------------------------------

/**
 * Every job carries a `requestId` so retries are idempotent
 * (PRD §4.2). Sub-agents extend `BaseJobPayload` with their own
 * typed `data`.
 */
export type BaseJobPayload = {
  /** Idempotency key — same retry = same id. UUIDv4 from caller. */
  readonly requestId: string;
  /** Tenant id (NOT user-identifying PII — see PRD §8.2). */
  readonly tenantId: string;
  /** Free-form structured payload owned by the sub-agent. */
  readonly data: Readonly<Record<string, unknown>>;
};

export type BaseJobResult = {
  readonly requestId: string;
  readonly status: "ok" | "deduped" | "stub";
  readonly note?: string;
};

/**
 * Sane defaults for every queue:
 *   - exponential backoff
 *   - 5 attempts before final fail
 *   - keep 1k completed / 5k failed for observability
 *   - removeOnComplete: true after window
 */
const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 5_000 },
};

/** Idempotency TTL (24h) — matches PRD §5 Short-term memory window. */
const IDEMPOTENCY_TTL_SECONDS = 24 * 3600;

// ---------------------------------------------------------------------------
// Public registry types
// ---------------------------------------------------------------------------

export type QueueDeps = {
  readonly queueConnection: Redis;
  readonly workerConnection: Redis;
  readonly logger: Logger;
};

export type QueueHandle = {
  readonly name: QueueName;
  readonly queue: Queue<BaseJobPayload, BaseJobResult>;
  readonly worker: Worker<BaseJobPayload, BaseJobResult>;
  addJob(
    jobName: string,
    payload: BaseJobPayload,
    opts?: JobsOptions,
  ): Promise<Job<BaseJobPayload, BaseJobResult>>;
};

export type QueueRegistry = Readonly<Record<QueueName, QueueHandle>>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the full registry. Returns one handle per queue.
 * Caller is responsible for `closeQueueRegistry(...)` on shutdown.
 */
export function createQueueRegistry(deps: QueueDeps): QueueRegistry {
  const entries: Array<[QueueName, QueueHandle]> = (
    Object.values(QUEUE_NAMES) as QueueName[]
  ).map((name) => [name, createQueueHandle(name, deps)]);

  const registry = Object.fromEntries(entries) as Record<
    QueueName,
    QueueHandle
  >;
  return registry;
}

function createQueueHandle(name: QueueName, deps: QueueDeps): QueueHandle {
  const log = deps.logger.child({ component: "queue", queue: name });

  const queue = new Queue<BaseJobPayload, BaseJobResult>(name, {
    connection: deps.queueConnection,
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });

  queue.on("error", (err: Error) => {
    log.error({ err }, "queue error");
  });

  const worker = new Worker<BaseJobPayload, BaseJobResult>(
    name,
    async (job: Job<BaseJobPayload, BaseJobResult>): Promise<BaseJobResult> => {
      return processStubJob(job, deps, name);
    },
    {
      connection: deps.workerConnection,
      concurrency: 1,
      // BullMQ stalled jobs guard — let stalled jobs go back to the queue.
      stalledInterval: 30_000,
      maxStalledCount: 2,
    },
  );

  worker.on("ready", () => log.info("worker ready"));
  worker.on("active", (job) =>
    log.debug({ jobId: job.id, name: job.name }, "job active"),
  );
  worker.on("completed", (job, result) =>
    log.info(
      { jobId: job.id, name: job.name, status: result.status },
      "job completed",
    ),
  );
  worker.on("failed", (job, err) =>
    log.error(
      { jobId: job?.id, name: job?.name, err },
      "job failed",
    ),
  );
  worker.on("error", (err) => log.error({ err }, "worker error"));

  return {
    name,
    queue,
    worker,
    async addJob(
      jobName: string,
      payload: BaseJobPayload,
      opts?: JobsOptions,
    ): Promise<Job<BaseJobPayload, BaseJobResult>> {
      // Use the requestId as the BullMQ job id when present so BullMQ
      // also dedupes at the queue layer.
      const merged: JobsOptions = {
        ...DEFAULT_JOB_OPTS,
        jobId: payload.requestId,
        ...opts,
      };
      const job = await queue.add(jobName, payload, merged);
      log.info(
        { jobId: job.id, jobName, requestId: payload.requestId, tenantId: payload.tenantId },
        "job enqueued",
      );
      return job;
    },
  };
}

/**
 * Placeholder processor used by every queue until its real
 * sub-agent ships. Honest — labeled `stub`, not faked-success.
 *
 * Guarantees:
 *   - idempotency lock via requestId
 *   - structured log entry
 *   - returns `BaseJobResult` so future processors are drop-in
 */
async function processStubJob(
  job: Job<BaseJobPayload, BaseJobResult>,
  deps: QueueDeps,
  queueName: QueueName,
): Promise<BaseJobResult> {
  const log = deps.logger.child({
    component: "processor",
    queue: queueName,
    jobId: job.id,
    jobName: job.name,
    requestId: job.data.requestId,
    tenantId: job.data.tenantId,
  });

  // Jury F-Trace-02 fix 2026-05-29: bypass idempotency for system-tenant
  // recurring jobs (heartbeat, daily checkpoint, etc.) — they intentionally
  // re-fire on a fixed cadence with the same requestId, so the 24h dedup
  // window would silence them after the first run. Real tenant jobs still
  // get full idempotency protection.
  if (job.data.tenantId !== "system") {
    const acquired = await acquireIdempotencyLock(
      deps.queueConnection,
      job.data.requestId,
      IDEMPOTENCY_TTL_SECONDS,
    );

    if (!acquired) {
      log.warn("duplicate requestId — deduped");
      return {
        requestId: job.data.requestId,
        status: "deduped",
        note: "requestId already processed within idempotency TTL",
      };
    }
  }

  log.info("received job — no processor yet (Phase 1.0-A4 stub)");
  return {
    requestId: job.data.requestId,
    status: "stub",
    note: `${queueName} processor not implemented`,
  };
}

/**
 * Graceful shutdown — close every worker then every queue.
 * Call on SIGTERM / SIGINT.
 */
export async function closeQueueRegistry(
  registry: QueueRegistry,
  logger: Logger,
): Promise<void> {
  const log = logger.child({ component: "queue-registry" });

  log.info("closing workers");
  await Promise.all(
    Object.values(registry).map(async (h) => {
      try {
        await h.worker.close();
      } catch (err) {
        log.error({ err, queue: h.name }, "worker close failed");
      }
    }),
  );

  log.info("closing queues");
  await Promise.all(
    Object.values(registry).map(async (h) => {
      try {
        await h.queue.close();
      } catch (err) {
        log.error({ err, queue: h.name }, "queue close failed");
      }
    }),
  );

  log.info("queue registry closed");
}
