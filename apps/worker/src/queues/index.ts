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

import { withSpan } from "@autonomux/telemetry";

import { acquireIdempotencyLock } from "../lib/redis.js";
import { processGdprJob } from "./gdpr.js";
import {
  processMailroomJob,
  type MailroomWorkerDeps,
} from "../workers/mailroom.js";
import {
  processSchedulerJob,
  type SchedulerWorkerDeps,
} from "../workers/scheduler.js";

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
  gdpr: "gdpr",
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
  /**
   * Per-sub-agent dependency bundles. Each is optional so non-mailroom
   * deployments (e.g. tests) can boot the registry without Gmail creds.
   * The dispatcher only consults these when the matching job arrives.
   */
  readonly mailroom?: MailroomWorkerDeps;
  readonly scheduler?: SchedulerWorkerDeps;
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
 *
 * Two-pass init: queue handles are created first (so each processor can
 * reference its own QueueHandle — e.g. gdpr.deletion.soft enqueues a delayed
 * gdpr.deletion.hard via the same queue). Then the registry object is frozen
 * and returned.
 */
export function createQueueRegistry(deps: QueueDeps): QueueRegistry {
  // Forward-reference holder so each processor can resolve sibling queues
  // (used by gdpr soft-delete → schedule delayed hard-delete on `gdpr`).
  const registryRef: { current: QueueRegistry | null } = { current: null };

  const entries: Array<[QueueName, QueueHandle]> = (
    Object.values(QUEUE_NAMES) as QueueName[]
  ).map((name) => [name, createQueueHandle(name, deps, registryRef)]);

  const registry = Object.fromEntries(entries) as Record<
    QueueName,
    QueueHandle
  >;
  registryRef.current = registry;
  return registry;
}

function createQueueHandle(
  name: QueueName,
  deps: QueueDeps,
  registryRef: { current: QueueRegistry | null },
): QueueHandle {
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
      // Wrap every job in a span — Axiom queries like
      // `job.${name}` give per-queue p95 latency + error rate.
      // Attribute hygiene: job.id, tenant.id, request_id are safe;
      // job.data payloads are NOT added (may contain PII per PRD §8.2).
      return withSpan(
        `job.${name}`,
        () => dispatchJob(job, deps, name, registryRef),
        {
          tracer: "@autonomux/worker",
          attributes: {
            "queue.name": name,
            "job.id": job.id ?? "unknown",
            "job.name": job.name,
            "job.attempts_made": job.attemptsMade,
            "tenant.id": job.data.tenantId,
            "request.id": job.data.requestId,
          },
        },
      );
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
 * Per-queue dispatcher. Routes to real processors when implemented,
 * falls through to `processStubJob` otherwise.
 *
 * Idempotency lock is acquired at this layer (once per queueName) so each
 * processor sees only the work it should actually do.
 */
async function dispatchJob(
  job: Job<BaseJobPayload, BaseJobResult>,
  deps: QueueDeps,
  queueName: QueueName,
  registryRef: { current: QueueRegistry | null },
): Promise<BaseJobResult> {
  const log = deps.logger.child({
    component: "processor",
    queue: queueName,
    jobId: job.id,
    jobName: job.name,
    requestId: job.data.requestId,
    tenantId: job.data.tenantId,
  });

  // Idempotency lock — same as the legacy stub path. Bypassed for system
  // tenant (heartbeat/cron) and for the gdpr.deletion.hard re-run (the
  // delayed job intentionally fires once, no dedup needed past the lock).
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

  if (queueName === "gdpr") {
    const reg = registryRef.current;
    if (reg === null) {
      throw new Error("[queues] registry not yet initialized");
    }
    return processGdprJob(job, log, reg.gdpr);
  }

  if (queueName === "mailroom") {
    if (deps.mailroom === undefined) {
      // Boot order issue — mailroom job arrived before the worker handed
      // deps to the registry. Treat as a transient failure so BullMQ retries.
      log.error("mailroom job arrived but mailroom deps not registered");
      throw new Error(
        "[queues] mailroom processor invoked without MailroomWorkerDeps; check boot wiring",
      );
    }
    return processMailroomJob({
      logger: log,
      job,
      deps: deps.mailroom,
    });
  }

  if (queueName === "scheduler") {
    if (deps.scheduler === undefined) {
      // Boot order issue — scheduler job arrived before the worker handed
      // deps to the registry. Treat as a transient failure so BullMQ retries.
      log.error("scheduler job arrived but scheduler deps not registered");
      throw new Error(
        "[queues] scheduler processor invoked without SchedulerWorkerDeps; check boot wiring",
      );
    }
    return processSchedulerJob({
      logger: log,
      job,
      deps: deps.scheduler,
    });
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
