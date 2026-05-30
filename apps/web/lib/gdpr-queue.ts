/**
 * apps/web/lib/gdpr-queue.ts
 *
 * Thin BullMQ producer for the `gdpr` queue. Server Actions + the
 * /api/gdpr/cancel-deletion route use this to enqueue + remove jobs.
 *
 * The actual processors live in apps/worker. This file ONLY produces.
 *
 * Connection pooling: BullMQ keeps the IORedis client open for the lifetime
 * of the process. In Next.js this is a module-scoped singleton so the same
 * client is reused across Server Action invocations (no per-request reconnect).
 *
 * Owner: [Atlas + Comply]
 */

import "server-only";

import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const GDPR_QUEUE_NAME = "gdpr" as const;

// Stable jobName constants — must match what `processGdprJob` in
// apps/worker/src/queues/gdpr.ts switches on.
export const GDPR_JOB_EXPORT = "gdpr.export" as const;
export const GDPR_JOB_DELETION_SOFT = "gdpr.deletion.soft" as const;
export const GDPR_JOB_DELETION_HARD = "gdpr.deletion.hard" as const;

type GdprJobName =
  | typeof GDPR_JOB_EXPORT
  | typeof GDPR_JOB_DELETION_SOFT
  | typeof GDPR_JOB_DELETION_HARD;

interface GdprJobPayload {
  readonly requestId: string;
  readonly tenantId: string;
  readonly data: Readonly<{ requestId: string }>;
}

interface GdprJobResult {
  readonly requestId: string;
  readonly status: "ok" | "deduped" | "stub";
  readonly note?: string;
}

let cachedQueue: Queue<GdprJobPayload, GdprJobResult> | null = null;
let cachedConnection: Redis | null = null;

function requireRedisUrl(): string {
  const url = process.env["REDIS_URL"];
  if (url === undefined || url.length === 0) {
    throw new Error(
      "[gdpr-queue] REDIS_URL is required to enqueue GDPR jobs.",
    );
  }
  return url;
}

function getQueue(): Queue<GdprJobPayload, GdprJobResult> {
  if (cachedQueue !== null) return cachedQueue;
  cachedConnection = new Redis(requireRedisUrl(), {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  cachedQueue = new Queue<GdprJobPayload, GdprJobResult>(GDPR_QUEUE_NAME, {
    connection: cachedConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { age: 24 * 3600, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 3600, count: 5_000 },
    },
  });
  return cachedQueue;
}

/**
 * Enqueue a GDPR export job for an already-created `gdpr_requests` row.
 * Idempotent via BullMQ jobId = `gdpr.export:<requestId>`.
 */
export async function enqueueGdprExport(args: {
  tenantId: string;
  requestId: string;
}): Promise<void> {
  const queue = getQueue();
  await queue.add(
    GDPR_JOB_EXPORT,
    {
      requestId: `gdpr.export:${args.requestId}`,
      tenantId: args.tenantId,
      data: { requestId: args.requestId },
    },
    {
      jobId: `gdpr.export:${args.requestId}`,
    },
  );
}

/**
 * Enqueue the soft-delete phase of a GDPR deletion. The worker will then
 * schedule the T+30d hard-delete itself.
 */
export async function enqueueGdprDeletionSoft(args: {
  tenantId: string;
  requestId: string;
}): Promise<void> {
  const queue = getQueue();
  await queue.add(
    GDPR_JOB_DELETION_SOFT,
    {
      requestId: `gdpr.deletion.soft:${args.requestId}`,
      tenantId: args.tenantId,
      data: { requestId: args.requestId },
    },
    {
      jobId: `gdpr.deletion.soft:${args.requestId}`,
    },
  );
}

/**
 * Cancel a scheduled hard-delete by BullMQ jobId. Used by
 * /api/gdpr/cancel-deletion when a user clicks "cancel" inside the 30-day
 * grace window. Returns true if the job was found and removed.
 */
export async function cancelDelayedGdprJob(jobId: string): Promise<boolean> {
  const queue = getQueue();
  const job = await queue.getJob(jobId);
  if (job === undefined || job === null) return false;
  try {
    await job.remove();
    return true;
  } catch {
    return false;
  }
}
