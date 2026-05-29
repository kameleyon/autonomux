/**
 * @autonomux/telemetry — public barrel.
 *
 * Single import surface for the rest of the monorepo. The sub-paths
 * (./sdk, ./tracer, ./spans, ./llm) remain exported in package.json
 * for callers that want narrower imports.
 */

export {
  initTelemetry,
  type InitTelemetryOptions,
  type TelemetryHandle,
} from "./sdk.js";

export { DEFAULT_TRACER_NAME, getTracer } from "./tracer.js";

export {
  addAttributes,
  withSpan,
  type WithSpanOptions,
} from "./spans.js";

export {
  traceLlmCall,
  type LlmResponseLike,
  type TraceLlmCallContext,
} from "./llm.js";
