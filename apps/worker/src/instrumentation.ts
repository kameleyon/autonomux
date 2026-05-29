/**
 * Worker telemetry boot.
 *
 * Imported FIRST in src/index.ts so the OTel Node SDK starts before any
 * instrumented module (ioredis, pg, undici, http, ...). ESM hoists
 * imports in declaration order, so as long as this is the first import
 * line, the auto-instrumentations attach in time.
 *
 * Returns the handle so index.ts can flush spans on SIGTERM.
 */

import { initTelemetry, type TelemetryHandle } from "@autonomux/telemetry";

export function bootTelemetry(): TelemetryHandle {
  return initTelemetry({
    service: "apps/worker",
    version: "0.1.0",
  });
}
