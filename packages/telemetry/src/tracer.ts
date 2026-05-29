/**
 * Convenience wrapper around `trace.getTracer`. Centralized so a future
 * switch to a non-default TracerProvider (e.g. for testing) only
 * touches one file.
 */

import { trace, type Tracer } from "@opentelemetry/api";

/** Default tracer name used when no caller-specific name is needed. */
export const DEFAULT_TRACER_NAME = "@autonomux/telemetry";

/**
 * Get a Tracer scoped to a logical component (e.g. "@autonomux/llm",
 * "apps/worker:queues"). The version arg lands on the InstrumentationScope
 * which lets Axiom group spans per emitting library.
 */
export function getTracer(name: string = DEFAULT_TRACER_NAME, version?: string): Tracer {
  return trace.getTracer(name, version);
}
