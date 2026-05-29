/**
 * Generic span helpers.
 *
 * `withSpan` is the workhorse — wrap any async fn in a span, errors are
 * recorded as exceptions and the span status is set to ERROR. Callers
 * just `throw` as usual; nothing about error handling changes.
 *
 * Attribute hygiene (Watch B10 constraint):
 *   - NO secrets, tokens, OAuth credentials, raw email bodies,
 *     plaintext PII. Attributes land in Axiom + are queryable.
 *   - Keep < ~10 attrs per span. More = exporter overhead + dashboard noise.
 */

import {
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type AttributeValue,
  type Span,
} from "@opentelemetry/api";

import { getTracer } from "./tracer.js";

export type WithSpanOptions = {
  /** Tracer name (lib that's emitting the span). */
  readonly tracer?: string;
  /** SpanKind override (default: INTERNAL). */
  readonly kind?: SpanKind;
  /** Initial attributes set before fn runs. */
  readonly attributes?: Attributes;
};

/**
 * Run `fn` inside a span. Errors propagate untouched; the span records
 * them as exceptions + sets ERROR status. On success the span is closed
 * cleanly.
 *
 * Usage:
 *   await withSpan("queue.mailroom.process", () => doWork(), {
 *     attributes: { "job.id": jobId, "tenant.id": tenantId },
 *   });
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  opts: WithSpanOptions = {},
): Promise<T> {
  const tracer = getTracer(opts.tracer);
  return tracer.startActiveSpan(
    name,
    {
      kind: opts.kind ?? SpanKind.INTERNAL,
      attributes: opts.attributes,
    },
    async (span: Span): Promise<T> => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Type-safe attribute setter. Drops undefined values (Span.setAttribute
 * accepts undefined but it surfaces as the literal string "undefined" in
 * some backends — better to skip).
 */
export function addAttributes(
  span: Span,
  attrs: Readonly<Record<string, AttributeValue | undefined>>,
): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    span.setAttribute(key, value);
  }
}
