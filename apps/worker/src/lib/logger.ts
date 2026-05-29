/**
 * Structured logger for @autonomux/worker.
 *
 * Pino JSON output → Axiom in prod (per PRD §8.2).
 * Redaction rules ported from studio-zero `lib/sentry-redaction.ts`
 * intent: never let secrets, auth headers, or PII trace into logs.
 *
 * Add new redaction paths here, NOT at the call site.
 */

import { pino, type Logger, type LoggerOptions } from "pino";

/** Paths Pino will replace with [Redacted] before serialization. */
const REDACT_PATHS: readonly string[] = [
  // Top-level keys
  "password",
  "token",
  "api_key",
  "apiKey",
  "secret",
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "set-cookie",
  "Set-Cookie",
  // Nested HTTP headers (express/fetch/node style)
  "*.password",
  "*.token",
  "*.api_key",
  "*.apiKey",
  "*.secret",
  "headers.authorization",
  "headers.Authorization",
  "headers.cookie",
  "headers.Cookie",
  "headers['set-cookie']",
  "headers['Set-Cookie']",
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  // Common BullMQ job payload shapes
  "job.data.password",
  "job.data.token",
  "job.data.api_key",
  "job.data.apiKey",
  "job.data.secret",
  "job.data.authorization",
];

export type LoggerContext = {
  readonly service: string;
  readonly env: string;
  readonly level?: string;
};

/**
 * Build the root logger. Call once at boot in `index.ts` and pass
 * child loggers (`logger.child({ component: "..." })`) into queues
 * and workers.
 */
export function createLogger(ctx: LoggerContext): Logger {
  const options: LoggerOptions = {
    level: ctx.level ?? "info",
    base: {
      service: ctx.service,
      env: ctx.env,
      pid: process.pid,
    },
    redact: {
      paths: [...REDACT_PATHS],
      censor: "[Redacted]",
      remove: false,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string): { level: string } {
        return { level: label };
      },
    },
  };

  return pino(options);
}
