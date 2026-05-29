/**
 * apps/worker — logger shim.
 *
 * Phase 1.0-B5: the worker now uses the shared `@autonomux/logger`
 * factory. This file is a thin compatibility wrapper that preserves
 * the historical `createLogger({ service, env, level })` call shape
 * used in `src/index.ts` so we didn't have to rewrite the boot path.
 *
 * Add new redaction paths in `packages/logger/src/logger.ts`, NOT here.
 *
 * Owner: [Watch]
 */

import {
  createLogger as createSharedLogger,
  type Logger,
} from "@autonomux/logger";

export type { Logger };

export type LoggerContext = {
  readonly service: string;
  readonly env: string;
  readonly level?: string;
};

/**
 * Build the worker's root logger. Call once at boot in `index.ts` and
 * pass child loggers (`logger.child({ component: "..." })`) into queues
 * and workers.
 */
export function createLogger(ctx: LoggerContext): Logger {
  return createSharedLogger({
    service: ctx.service,
    env: ctx.env,
    ...(ctx.level !== undefined ? { level: ctx.level } : {}),
    ...(process.env["AXIOM_TOKEN"] !== undefined
      ? { axiomToken: process.env["AXIOM_TOKEN"] }
      : {}),
    ...(process.env["AXIOM_DATASET"] !== undefined
      ? { axiomDataset: process.env["AXIOM_DATASET"] }
      : {}),
  });
}
