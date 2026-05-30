/**
 * @autonomux/telemetry — public barrel.
 *
 * Single import surface for the rest of the monorepo. The sub-paths
 * (./sdk, ./tracer, ./spans, ./llm) remain exported in package.json
 * for callers that want narrower imports.
 */

/* Vercel build fix 2026-05-29: dropped `.js` extensions on relative
 * imports. tsc resolves fine without them; webpack chokes on `./sdk.js`
 * because the file is `sdk.ts` and the workspace package isn't pre-built
 * (Vercel imports source directly via the workspace exports field). */

export {
  initTelemetry,
  type InitTelemetryOptions,
  type TelemetryHandle,
} from "./sdk";

export { DEFAULT_TRACER_NAME, getTracer } from "./tracer";

export {
  addAttributes,
  withSpan,
  type WithSpanOptions,
} from "./spans";

export {
  traceLlmCall,
  type LlmResponseLike,
  type TraceLlmCallContext,
} from "./llm";
