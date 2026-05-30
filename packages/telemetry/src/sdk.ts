/**
 * @autonomux/telemetry — SDK bootstrap.
 *
 * One call (`initTelemetry`) configures:
 *   - resource (service.name, service.version, deployment.environment)
 *   - OTLP/HTTP exporter pointed at Axiom (or any OTLP collector)
 *   - auto-instrumentations for Node built-ins + popular libs
 *     (http, fs, dns, ioredis, pg, pino, undici, etc.)
 *
 * Degrade-gracefully behavior (PRD §8.2 + Watch B10 brief):
 *   - dev w/o OTEL_EXPORTER_OTLP_ENDPOINT  → no-op, no crash
 *   - prod w/o OTEL_EXPORTER_OTLP_ENDPOINT → hard-fail at boot
 *     (silent observability loss is unacceptable in production)
 *
 * Call BEFORE any other module that should be auto-instrumented.
 * Returns the SDK so the caller can `await sdk.shutdown()` on SIGTERM.
 *
 * Header format for OTEL_EXPORTER_OTLP_HEADERS follows the OTel spec:
 *   `Authorization=Bearer xaat-...,X-Axiom-Dataset=autonomux`
 * Comma-separated `k=v` pairs. We parse and forward them to the exporter.
 */

import process from "node:process";

import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

/**
 * deployment.environment is in the incubating namespace; pin the constant
 * here so consumers don't have to import from /incubating.
 */
const ATTR_DEPLOYMENT_ENVIRONMENT = "deployment.environment";

export type InitTelemetryOptions = {
  /** Service name emitted on every span (e.g. "apps/web", "apps/worker"). */
  readonly service: string;
  /** Service version (typically from package.json or build tag). */
  readonly version: string;
  /**
   * Optional override. Falls back to env.DEPLOYMENT_ENV → env.NODE_ENV →
   * "development". Production callers should always set this explicitly
   * via DEPLOYMENT_ENV so staging spans don't pollute production
   * dashboards.
   */
  readonly deploymentEnv?: string;
  /**
   * Optional explicit endpoint override. Falls back to
   * OTEL_EXPORTER_OTLP_ENDPOINT.
   */
  readonly endpoint?: string;
};

/**
 * Returned handle. Always present, even in the no-op dev path, so
 * callers can wire `shutdown()` to SIGTERM unconditionally.
 */
export type TelemetryHandle = {
  /** True if an exporter is actually flushing spans. False = no-op mode. */
  readonly enabled: boolean;
  /** Flush pending spans + tear down SDK. Safe to call multiple times. */
  shutdown(): Promise<void>;
};

let activeHandle: TelemetryHandle | null = null;

/**
 * Boot OpenTelemetry. Idempotent — repeat calls return the existing handle.
 *
 * @throws if production env has no OTLP endpoint configured.
 */
export function initTelemetry(opts: InitTelemetryOptions): TelemetryHandle {
  if (activeHandle !== null) {
    return activeHandle;
  }

  const deploymentEnv =
    opts.deploymentEnv ??
    process.env["DEPLOYMENT_ENV"] ??
    process.env["NODE_ENV"] ??
    "development";

  /* Escape hatch for production deploys that haven't wired Axiom yet
   * (e.g. early Railway/Vercel boots). Set OTEL_ENABLED=false to
   * intentionally skip the production hard-fail. Default behavior
   * (enabled in prod) is unchanged so silent observability loss
   * still requires an explicit operator decision.
   * 2026-05-30 — co-evolves with apps/web/instrumentation.ts gate. */
  if (process.env["OTEL_ENABLED"] === "false") {
    activeHandle = {
      enabled: false,
      async shutdown(): Promise<void> {},
    };
    return activeHandle;
  }

  const endpoint =
    opts.endpoint ?? process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];

  // Optional OTel internal diag — useful when chasing "why aren't spans
  // showing up". Off by default; flip OTEL_LOG_LEVEL=debug locally.
  const otelLogLevel = process.env["OTEL_LOG_LEVEL"];
  if (otelLogLevel !== undefined && otelLogLevel.trim() !== "") {
    diag.setLogger(new DiagConsoleLogger(), parseDiagLogLevel(otelLogLevel));
  }

  // No endpoint → decide between no-op and hard-fail.
  if (endpoint === undefined || endpoint.trim() === "") {
    if (isProduction(deploymentEnv)) {
      throw new Error(
        "[@autonomux/telemetry] OTEL_EXPORTER_OTLP_ENDPOINT is required in production. " +
          "Refusing to boot without observability. " +
          "See packages/telemetry/.env.example.",
      );
    }
    // Dev / test: no-op handle. Don't crash, don't spam.
    activeHandle = {
      enabled: false,
      async shutdown(): Promise<void> {
        // nothing to flush
      },
    };
    return activeHandle;
  }

  const headers = parseOtlpHeaders(
    process.env["OTEL_EXPORTER_OTLP_HEADERS"] ?? "",
  );

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: opts.service,
    [ATTR_SERVICE_VERSION]: opts.version,
    [ATTR_DEPLOYMENT_ENVIRONMENT]: deploymentEnv,
  });

  const traceExporter = new OTLPTraceExporter({
    url: endpoint,
    headers,
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs auto-instrument is noisy + low-value for our workloads.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // dns spans are mostly junk during cold-start; turn off.
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  });

  sdk.start();

  activeHandle = {
    enabled: true,
    async shutdown(): Promise<void> {
      try {
        await sdk.shutdown();
      } catch (err) {
        // Don't let telemetry shutdown break process exit.
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[@autonomux/telemetry] shutdown error: ${msg}\n`,
        );
      }
    },
  };

  return activeHandle;
}

/**
 * Test-only escape hatch — clears the cached handle so re-init works
 * in vitest. Not exported from the barrel.
 */
export function _resetTelemetryForTests(): void {
  activeHandle = null;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function isProduction(deploymentEnv: string): boolean {
  return deploymentEnv === "production";
}

/**
 * Parse the OTEL_EXPORTER_OTLP_HEADERS env-var spec format:
 *   "Authorization=Bearer xaat-...,X-Axiom-Dataset=autonomux"
 *
 * Values are URI-decoded so tokens with `=` or `,` can be encoded.
 */
function parseOtlpHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw.trim() === "") return out;

  for (const pair of raw.split(",")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key === "" || value === "") continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function parseDiagLogLevel(raw: string): DiagLogLevel {
  switch (raw.toLowerCase()) {
    case "verbose":
      return DiagLogLevel.VERBOSE;
    case "debug":
      return DiagLogLevel.DEBUG;
    case "info":
      return DiagLogLevel.INFO;
    case "warn":
      return DiagLogLevel.WARN;
    case "error":
      return DiagLogLevel.ERROR;
    case "none":
      return DiagLogLevel.NONE;
    default:
      return DiagLogLevel.INFO;
  }
}
