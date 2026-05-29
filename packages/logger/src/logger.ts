/**
 * Pino logger factory for Autonomux services.
 *
 * Three-tier logging (PRD §8):
 *   - 8.1 activity_log: user-facing, written to DB by callers (not here)
 *   - 8.2 system log:   structured JSON → Axiom in prod, pretty in dev (this file)
 *   - 8.3 audit log:    Postgres signed chain (see ./audit.ts)
 *
 * Redaction:
 *   Pino's `redact.paths` is the SOC 2 backstop. Even if an engineer
 *   forgets to scrub a field manually, the logger drops it before
 *   serialization. The path list is union of:
 *     - The platform PII names from @autonomux/cipher (pinoRedactPaths)
 *     - HTTP-header / BullMQ-job paths specific to this monorepo
 *
 * Transport:
 *   - dev/test:    pino-pretty on stdout
 *   - prod + AXIOM_TOKEN: pino.transport target → @axiomhq/pino
 *     (lazily resolved at runtime; the @axiomhq/pino package is an
 *     optional peer that prod Docker images install. If absent, we
 *     fall back to raw JSON on stdout — Railway/Vercel will still
 *     scrape it.)
 *   - prod without AXIOM_TOKEN: raw JSON on stdout (same fallback)
 *
 * All timestamps are ISO8601 UTC via pino.stdTimeFunctions.isoTime.
 */

import { pino, type Logger, type LoggerOptions } from "pino";
import { pinoRedactPaths as cipherRedactPaths } from "@autonomux/cipher";

/** Service tag attached to every log line — used for Axiom filtering. */
export type Service = "apps/web" | "apps/worker" | "apps/admin" | (string & {});

export type CreateLoggerOptions = {
  /** Required. Filters in Axiom: `service == "apps/web"`. */
  readonly service: Service;
  /** Pino level. Defaults to LOG_LEVEL env or "info". */
  readonly level?: string;
  /** Axiom ingest token. If absent, logger writes JSON to stdout. */
  readonly axiomToken?: string;
  /** Axiom dataset name. Required when axiomToken is set. */
  readonly axiomDataset?: string;
  /**
   * Optional runtime environment tag. Defaults to NODE_ENV.
   * Used to gate pretty-print (only in development/test).
   */
  readonly env?: string;
  /**
   * Optional extra base fields stamped onto every record
   * (e.g. `{ region: "iad1" }`).
   */
  readonly base?: Record<string, unknown>;
};

export type { Logger };

/**
 * Pino redact paths — union of @autonomux/cipher PII names and the
 * HTTP-header / BullMQ-job paths native to this monorepo.
 *
 * Exported so tests + downstream consumers can inspect the surface.
 */
export const REDACT_PATHS: readonly string[] = Object.freeze([
  // ---- cipher-managed PII (auto: name + *.name + *.*.name) -------------
  ...cipherRedactPaths,
  // ---- HTTP header conventions (express, fetch, Next.js) ---------------
  // Note: fast-redact requires bracket notation for keys that contain
  // characters that aren't valid JS identifiers (e.g. dashes). That's
  // why `set-cookie` is written as `["set-cookie"]`.
  "authorization",
  "Authorization",
  '["set-cookie"]',
  '["Set-Cookie"]',
  "headers.authorization",
  "headers.Authorization",
  "headers.cookie",
  "headers.Cookie",
  'headers["set-cookie"]',
  'headers["Set-Cookie"]',
  "req.headers.authorization",
  "req.headers.Authorization",
  "req.headers.cookie",
  "req.headers.Cookie",
  'res.headers["set-cookie"]',
  // ---- common request-body shapes --------------------------------------
  "req.body.password",
  "req.body.passwd",
  "req.body.pwd",
  "req.body.token",
  "req.body.api_key",
  "req.body.apiKey",
  "req.body.secret",
  "req.body.authorization",
  // ---- BullMQ job payload variants -------------------------------------
  "job.data.password",
  "job.data.token",
  "job.data.api_key",
  "job.data.apiKey",
  "job.data.secret",
  "job.data.authorization",
  "job.data.access_token",
  "job.data.refresh_token",
  "job.opts.token",
]);

const REDACT_CENSOR = "[REDACTED]";

/**
 * Build a logger. Call once per service at boot, then pass child
 * loggers (`logger.child({ component: "..." })`) downstream.
 *
 * Hot-path: avoid per-request creation. Use child loggers instead.
 */
export function createLogger(opts: CreateLoggerOptions): Logger {
  const env = opts.env ?? process.env["NODE_ENV"] ?? "development";
  const level = opts.level ?? process.env["LOG_LEVEL"] ?? "info";
  const isProd = env === "production" || env === "staging";

  const base: Record<string, unknown> = {
    service: opts.service,
    env,
    pid: process.pid,
    ...(opts.base ?? {}),
  };

  const options: LoggerOptions = {
    level,
    base,
    redact: {
      paths: [...REDACT_PATHS],
      censor: REDACT_CENSOR,
      remove: false,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string): { level: string } {
        return { level: label };
      },
    },
  };

  // ---- Dev / test: pretty-print to stdout ---------------------------
  if (!isProd) {
    try {
      const transport = pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          singleLine: false,
          ignore: "pid,hostname",
        },
      });
      return pino(options, transport);
    } catch {
      // pino-pretty not installed (e.g. test sandbox) — fall through
      // to raw JSON on stdout, which is still valid structured output.
      return pino(options);
    }
  }

  // ---- Prod: Axiom transport when token present ---------------------
  if (opts.axiomToken && opts.axiomDataset) {
    try {
      const transport = pino.transport({
        target: "@axiomhq/pino",
        options: {
          token: opts.axiomToken,
          dataset: opts.axiomDataset,
        },
      });
      return pino(options, transport);
    } catch {
      // @axiomhq/pino not installed in this image — fall through to
      // stdout JSON. Railway/Vercel still scrape it; Axiom can be
      // wired via Vector/Fluent Bit at the platform level if needed.
      return pino(options);
    }
  }

  // ---- Prod fallback: raw JSON on stdout ----------------------------
  return pino(options);
}
