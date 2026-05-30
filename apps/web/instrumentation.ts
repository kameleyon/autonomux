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

  /**
   * Vercel build fix 2026-05-29: `@opentelemetry/auto-instrumentations-
   * node` bundles 50+ sub-instrumentations (aws-lambda, net, prometheus,
   * etc.) that webpack can't externalize cleanly even with
   * `serverExternalPackages`. Gate the SDK boot on `OTEL_ENABLED=true`
   * so the production deploy can ship without it. When we're ready
   * to wire telemetry in v1.1+, replace the auto-instrumentation set
   * with a hand-picked minimal set (http + undici + ioredis + pg).
   */
  if (process.env["OTEL_ENABLED"] !== "true") {
    return;
  }

  // String-based dynamic import — webpack treats the path as opaque
  // and doesn't attempt to analyze/bundle @autonomux/telemetry's
  // transitive @opentelemetry/* tree at compile time.
  const modulePath = "@autonomux/telemetry";
  const telemetry = (await import(/* webpackIgnore: true */ modulePath)) as {
    initTelemetry: (opts: { service: string; version: string }) => unknown;
  };

  telemetry.initTelemetry({
    service: "apps/web",
    version: process.env["NEXT_PUBLIC_VERSION"] ?? "0.1.0",
  });
}
