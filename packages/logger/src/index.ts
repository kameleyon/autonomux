/**
 * @autonomux/logger
 *
 * Shared structured logger for every Autonomux service.
 *
 * Public surface:
 *   - `createLogger`            — service-scoped Pino logger factory
 *   - `Logger` / `Service`      — types
 *   - `REDACT_PATHS`            — full Pino redact path list (read-only)
 *   - `createNextRequestLogger` — Next.js / generic HTTP request logger
 *   - `logHttpAccess`           — framework-agnostic access log emitter
 *   - `REQUEST_ID_HEADER_NAME`  — `x-request-id`
 *   - `writeAuditEvent`         — non-throwing audit_log writer (PRD §8.3)
 *
 * No console.log anywhere in Autonomux. Use `createLogger({...}).info(...)`.
 */

export {
  createLogger,
  REDACT_PATHS,
  type CreateLoggerOptions,
  type Logger,
  type Service,
} from "./logger.js";

export {
  createNextRequestLogger,
  logHttpAccess,
  REQUEST_ID_HEADER_NAME,
  type AccessLogInfo,
  type RequestContext,
} from "./middleware.js";

export {
  writeAuditEvent,
  type AuditActorKind,
  type AuditSupabaseClient,
  type WriteAuditEventInput,
} from "./audit.js";
