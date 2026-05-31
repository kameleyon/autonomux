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
 * GMAIL_OAUTH_CLIENT_ID + GMAIL_OAUTH_CLIENT_SECRET: needed by the Mailroom
 *   worker (lib/gmail-client.ts) to refresh expired access tokens via
 *   Google's OAuth refresh_token flow. Shared with apps/web (start flow).
 */
const REQUIRED_ENV = [
  "REDIS_URL",
  "NODE_ENV",
  "GMAIL_OAUTH_CLIENT_ID",
  "GMAIL_OAUTH_CLIENT_SECRET",
] as const;
type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

/** Default Mailroom triage batch size if the caller doesn't override. */
const DEFAULT_MAILROOM_TRIAGE_MAX_MESSAGES = 25;

export type WorkerEnv = {
  readonly REDIS_URL: string;
  readonly NODE_ENV: NodeEnv;
  /** Optional log level override; falls back to "info". */
  readonly LOG_LEVEL: string;
  /** Optional service tag emitted on every log line. */
  readonly SERVICE_NAME: string;
  /** Gmail OAuth client id — required, used to refresh access tokens. */
  readonly GMAIL_OAUTH_CLIENT_ID: string;
  /** Gmail OAuth client secret — required, used to refresh access tokens. */
  readonly GMAIL_OAUTH_CLIENT_SECRET: string;
  /** Max messages the Mailroom triage job pulls from Gmail per run. */
  readonly MAILROOM_TRIAGE_MAX_MESSAGES: number;
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

  const gmailClientId = process.env["GMAIL_OAUTH_CLIENT_ID"];
  if (gmailClientId === undefined) {
    throw new Error(
      "[@autonomux/worker] GMAIL_OAUTH_CLIENT_ID missing after assertion.",
    );
  }

  const gmailClientSecret = process.env["GMAIL_OAUTH_CLIENT_SECRET"];
  if (gmailClientSecret === undefined) {
    throw new Error(
      "[@autonomux/worker] GMAIL_OAUTH_CLIENT_SECRET missing after assertion.",
    );
  }

  // Optional with sane default; reject non-integers / non-positive values
  // so misconfiguration fails fast at boot rather than at first job.
  let triageMax = DEFAULT_MAILROOM_TRIAGE_MAX_MESSAGES;
  const triageMaxRaw = process.env["MAILROOM_TRIAGE_MAX_MESSAGES"];
  if (triageMaxRaw !== undefined && triageMaxRaw.trim() !== "") {
    const parsed = Number.parseInt(triageMaxRaw.trim(), 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 500) {
      throw new Error(
        `[@autonomux/worker] Invalid MAILROOM_TRIAGE_MAX_MESSAGES "${triageMaxRaw}". ` +
          "Expected a positive integer ≤ 500.",
      );
    }
    triageMax = parsed;
  }

  return {
    REDIS_URL: redisUrl,
    NODE_ENV: nodeEnvRaw,
    LOG_LEVEL: process.env["LOG_LEVEL"] ?? "info",
    SERVICE_NAME: process.env["SERVICE_NAME"] ?? "autonomux-worker",
    GMAIL_OAUTH_CLIENT_ID: gmailClientId,
    GMAIL_OAUTH_CLIENT_SECRET: gmailClientSecret,
    MAILROOM_TRIAGE_MAX_MESSAGES: triageMax,
  };
}

function isValidNodeEnv(value: string): value is NodeEnv {
  return (VALID_NODE_ENVS as readonly string[]).includes(value);
}
