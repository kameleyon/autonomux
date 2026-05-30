/**
 * Request-scoped logging middleware.
 *
 * Two flavors:
 *   1. createNextRequestLogger(baseLogger):
 *      Returns a function compatible with Next.js Edge / Node middleware
 *      that:
 *        - generates a request_id (UUID v4) if x-request-id absent
 *        - attaches it as an `x-request-id` response header
 *        - returns a child logger bound to that request_id
 *      Caller uses the child logger inside the request handler chain
 *      and emits the access-log line on response.
 *
 *   2. logHttpAccess(logger, info):
 *      A pure function any framework can call after the response is
 *      finalized. Selects the level by status code (info / warn / error)
 *      and writes the access record.
 *
 * OpenTelemetry: when @opentelemetry/api is loaded in the process,
 * we attach `trace_id` + `span_id` to the child logger so log lines
 * correlate with traces. The package is NOT a hard dependency — we
 * lazily resolve it via `globalThis` and skip silently if absent.
 */

import type { Logger } from "pino";

/* Vercel build fix 2026-05-29: replaced `node:crypto.randomUUID` with
 * the Web Crypto `crypto.randomUUID()` (present in Node 19+ and the
 * Edge runtime) so this module bundles cleanly for Next.js middleware. */
const randomUUID: () => string = () => crypto.randomUUID();

const REQUEST_ID_HEADER = "x-request-id";

/** Minimal subset of NextRequest / Fetch Request that the middleware needs. */
type RequestLike = {
  readonly method: string;
  readonly url: string;
  readonly headers: {
    get(name: string): string | null;
  };
};

/** Minimal subset of NextResponse / Fetch Response we attach headers to. */
type ResponseLike = {
  readonly headers: {
    set(name: string, value: string): void;
  };
};

export type RequestContext = {
  /** Stable per-request UUID v4. */
  readonly request_id: string;
  /** Child logger pre-bound with request_id + method + path. */
  readonly logger: Logger;
  /** Monotonic start (perf.now()) — caller computes latency_ms on finish. */
  readonly startedAt: number;
};

export type AccessLogInfo = {
  readonly request_id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly latency_ms: number;
  readonly user_agent?: string | undefined;
  readonly remote_addr?: string | undefined;
};

/**
 * Build a Next.js-compatible request logger.
 *
 * Usage in `middleware.ts`:
 *
 *   const requestLogger = createNextRequestLogger(logger);
 *
 *   export function middleware(req: NextRequest) {
 *     const { request_id, logger: log, startedAt } = requestLogger.begin(req);
 *     const res = NextResponse.next();
 *     requestLogger.attach(res, request_id);
 *     // … downstream code uses `log` …
 *     return res;
 *   }
 */
export function createNextRequestLogger(baseLogger: Logger): {
  begin: (req: RequestLike) => RequestContext;
  attach: (res: ResponseLike, request_id: string) => void;
  finish: (ctx: RequestContext, status: number, extras?: Partial<AccessLogInfo>) => void;
} {
  return {
    begin(req: RequestLike): RequestContext {
      const existing = req.headers.get(REQUEST_ID_HEADER);
      const request_id =
        existing && isLikelyUuid(existing) ? existing : randomUUID();

      const { pathname } = safeParseUrl(req.url);
      const traceFields = captureTraceContext();

      const logger = baseLogger.child({
        request_id,
        method: req.method,
        path: pathname,
        ...traceFields,
      });

      return {
        request_id,
        logger,
        startedAt: nowMs(),
      };
    },

    attach(res: ResponseLike, request_id: string): void {
      res.headers.set(REQUEST_ID_HEADER, request_id);
    },

    finish(ctx: RequestContext, status: number, extras): void {
      const latency_ms = Math.max(0, Math.round(nowMs() - ctx.startedAt));
      logHttpAccess(ctx.logger, {
        request_id: ctx.request_id,
        method:
          (ctx.logger.bindings()["method"] as string | undefined) ?? "UNKNOWN",
        path:
          (ctx.logger.bindings()["path"] as string | undefined) ?? "/",
        status,
        latency_ms,
        user_agent: extras?.user_agent,
        remote_addr: extras?.remote_addr,
      });
    },
  };
}

/**
 * Generic access-log emitter. Framework-agnostic; pure.
 *   - 1xx / 2xx / 3xx → info
 *   - 4xx              → warn
 *   - 5xx              → error
 */
export function logHttpAccess(logger: Logger, info: AccessLogInfo): void {
  const level: "info" | "warn" | "error" =
    info.status >= 500 ? "error" : info.status >= 400 ? "warn" : "info";

  logger[level](
    {
      request_id: info.request_id,
      method: info.method,
      path: info.path,
      status: info.status,
      latency_ms: info.latency_ms,
      user_agent: info.user_agent,
      remote_addr: info.remote_addr,
    },
    "http access",
  );
}

/** Header name used to propagate the request_id across services. */
export const REQUEST_ID_HEADER_NAME = REQUEST_ID_HEADER;

// ---------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------

function nowMs(): number {
  // perf.now exists on Node 16+. Fall back to Date.now if a runtime
  // somehow lacks performance (e.g. older edge runtimes).
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf?.now ? perf.now() : Date.now();
}

function safeParseUrl(raw: string): { pathname: string } {
  try {
    return { pathname: new URL(raw, "http://internal.local").pathname };
  } catch {
    return { pathname: "/" };
  }
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isLikelyUuid(value: string): boolean {
  return UUID_V4_RE.test(value);
}

/**
 * Best-effort OpenTelemetry span context capture.
 *
 * We do NOT take a hard dependency on @opentelemetry/api. If a host
 * process has it loaded (e.g. Next.js with the OTel SDK), we read the
 * active span via the global accessor. Otherwise return empty fields.
 */
function captureTraceContext(): {
  readonly trace_id?: string;
  readonly span_id?: string;
} {
  type OtelApi = {
    trace?: {
      getActiveSpan?: () => {
        spanContext?: () => { traceId?: string; spanId?: string };
      } | undefined;
    };
  };

  const otel = (globalThis as { __OTEL_API__?: OtelApi }).__OTEL_API__;
  const span = otel?.trace?.getActiveSpan?.();
  const ctx = span?.spanContext?.();
  if (!ctx) return {};

  const out: { trace_id?: string; span_id?: string } = {};
  if (ctx.traceId) out.trace_id = ctx.traceId;
  if (ctx.spanId) out.span_id = ctx.spanId;
  return out;
}
