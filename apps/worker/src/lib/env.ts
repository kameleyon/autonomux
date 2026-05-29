/**
 * Strict env loader for @autonomux/worker.
 *
 * Boot-time assertion: every key in REQUIRED_ENV must be defined and
 * non-empty. Missing or blank vars throw immediately so the worker
 * crashes fast in CI / Railway rather than running half-configured.
 *
 * Never log raw env values — pass them through the redacted logger.
 */

import { config as loadDotenv } from "dotenv";

loadDotenv();

/** Valid NODE_ENV values for this worker. */
export type NodeEnv = "development" | "test" | "staging" | "production";

const VALID_NODE_ENVS: readonly NodeEnv[] = [
  "development",
  "test",
  "staging",
  "production",
] as const;

/**
 * Required env vars. Add to this list as new sub-agents come online.
 * REDIS_URL: BullMQ / IORedis connection string.
 * NODE_ENV:  Standard runtime selector.
 */
const REQUIRED_ENV = ["REDIS_URL", "NODE_ENV"] as const;
type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

export type WorkerEnv = {
  readonly REDIS_URL: string;
  readonly NODE_ENV: NodeEnv;
  /** Optional log level override; falls back to "info". */
  readonly LOG_LEVEL: string;
  /** Optional service tag emitted on every log line. */
  readonly SERVICE_NAME: string;
};

/**
 * Read + validate process.env. Throws AggregateError-style Error
 * listing every missing var (don't drip-fail).
 */
export function assertEnv(): WorkerEnv {
  const missing: RequiredEnvKey[] = [];

  for (const key of REQUIRED_ENV) {
    const raw = process.env[key];
    if (raw === undefined || raw.trim() === "") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[@autonomux/worker] Missing required env var(s): ${missing.join(", ")}. ` +
        `See apps/worker/.env.example.`,
    );
  }

  const nodeEnvRaw = process.env["NODE_ENV"];
  if (nodeEnvRaw === undefined) {
    // Already covered by REQUIRED_ENV; this satisfies the type narrowing.
    throw new Error("[@autonomux/worker] NODE_ENV missing after assertion.");
  }
  if (!isValidNodeEnv(nodeEnvRaw)) {
    throw new Error(
      `[@autonomux/worker] Invalid NODE_ENV "${nodeEnvRaw}". ` +
        `Expected one of: ${VALID_NODE_ENVS.join(", ")}.`,
    );
  }

  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl === undefined) {
    throw new Error("[@autonomux/worker] REDIS_URL missing after assertion.");
  }

  return {
    REDIS_URL: redisUrl,
    NODE_ENV: nodeEnvRaw,
    LOG_LEVEL: process.env["LOG_LEVEL"] ?? "info",
    SERVICE_NAME: process.env["SERVICE_NAME"] ?? "autonomux-worker",
  };
}

function isValidNodeEnv(value: string): value is NodeEnv {
  return (VALID_NODE_ENVS as readonly string[]).includes(value);
}
