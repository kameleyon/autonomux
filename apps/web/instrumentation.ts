/**
 * Next.js instrumentation entry point.
 *
 * Next.js calls `register()` exactly once per server runtime (Node or
 * Edge) before any route is served. We boot OpenTelemetry here so the
 * auto-instrumentations can patch http/undici BEFORE any handler runs.
 *
 * Node runtime only — the OTel Node SDK isn't compatible with the Edge
 * runtime. We gate on `NEXT_RUNTIME` so this no-ops on Edge.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") {
    return;
  }

  // Dynamic import so the OTel Node SDK never lands in an Edge bundle.
  const { initTelemetry } = await import("@autonomux/telemetry");

  initTelemetry({
    service: "apps/web",
    version: process.env["NEXT_PUBLIC_VERSION"] ?? "0.1.0",
  });
}
