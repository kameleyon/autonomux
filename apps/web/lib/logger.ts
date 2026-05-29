/**
 * apps/web — singleton structured logger.
 *
 * One Pino instance per Node process. Server Components, Server Actions,
 * Route Handlers, and middleware all import this same `logger`. Never
 * use `console.log` — it bypasses redaction and Axiom shipping.
 *
 * The transport is selected inside @autonomux/logger:
 *   - dev:  pino-pretty on stdout
 *   - prod: @axiomhq/pino → Axiom (with stdout JSON fallback when
 *           AXIOM_TOKEN is unset)
 *
 * Owner: [Watch]
 */

import { createLogger, type Logger } from "@autonomux/logger";

/**
 * Resolved at module load. Edge runtime + Node runtime both share the
 * same instance (Next bundles per-route, but redaction config and
 * service tag are identical across runtimes).
 */
export const logger: Logger = createLogger({
  service: "apps/web",
  level: process.env["LOG_LEVEL"],
  axiomToken: process.env["AXIOM_TOKEN"],
  axiomDataset: process.env["AXIOM_DATASET"] ?? "autonomux-prod",
});

/**
 * Convenience for tagged child loggers in Server Actions / Route Handlers:
 *
 *   const log = childLogger({ component: "auth.sign-in", request_id });
 *   log.info({ user_id }, "signed in");
 */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
