/**
 * Cron job scheduler — placeholder.
 *
 * At Phase 1.0-A4 this registers ONE cron: a one-minute heartbeat
 * so we can verify the worker is alive end-to-end (Railway → Redis →
 * BullMQ → log line in Axiom).
 *
 * Real crons (morning briefing trigger, daily audit-log checkpoint,
 * Treasurer Plaid sync) land in later phases on top of this scaffold.
 */

import type { Job } from "bullmq";
import type { Logger } from "pino";

import type {
  BaseJobPayload,
  BaseJobResult,
  QueueHandle,
} from "../queues/index.js";

export const HEARTBEAT_JOB_NAME = "heartbeat" as const;
export const HEARTBEAT_CRON = "* * * * *" as const; // every minute
export const HEARTBEAT_REPEAT_KEY = "cron:heartbeat" as const;

export type CronDeps = {
  readonly cronQueue: QueueHandle;
  readonly logger: Logger;
};

/**
 * Register the heartbeat cron. Idempotent — repeated calls reuse the
 * same `jobId` so re-deploys don't pile up duplicate repeatables.
 */
export async function registerCronJobs(deps: CronDeps): Promise<void> {
  const log = deps.logger.child({ component: "cron" });

  // The cron queue's stub processor (queues/index.ts) handles heartbeat
  // jobs — it logs them and returns. When real heartbeat semantics are
  // needed, swap the cron queue's processor or split it off here.
  await deps.cronQueue.queue.add(
    HEARTBEAT_JOB_NAME,
    {
      // Heartbeat uses a stable requestId per-tick window via job opts
      // below; the payload doesn't carry real idempotency since the cron
      // expects to run each minute.
      requestId: `heartbeat-${HEARTBEAT_REPEAT_KEY}`,
      tenantId: "system",
      data: { kind: "heartbeat" },
    } satisfies BaseJobPayload,
    {
      repeat: { pattern: HEARTBEAT_CRON },
      // Unique key so re-deploys don't pile up duplicate repeatables.
      jobId: HEARTBEAT_REPEAT_KEY,
      removeOnComplete: { age: 3600, count: 60 },
      removeOnFail: { age: 24 * 3600, count: 100 },
    },
  );

  log.info({ pattern: HEARTBEAT_CRON }, "heartbeat cron registered");
}

/**
 * Pure helper exported for unit tests + alternate registration sites.
 * Currently unused by the boot path but keeps the contract callable.
 */
export function isHeartbeatJob(
  job: Job<BaseJobPayload, BaseJobResult>,
): boolean {
  return job.name === HEARTBEAT_JOB_NAME;
}
