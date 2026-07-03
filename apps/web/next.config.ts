import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [],
  },
  /* Security headers (Phase 0 Blocker B4). The prototype iframes are gone
   * (landing + /app are native now), so we lock framing down hard:
   * `frame-ancestors 'none'` + `X-Frame-Options: DENY` (no one may embed us),
   * `frame-src https://cdn.plaid.com` (only Plaid Link may be embedded BY us,
   * Phase 1), plus COOP for cross-origin isolation of the browsing context.
   *
   * A full `script-src`/`connect-src` CSP is deliberately NOT here yet: Next's
   * inline hydration bootstrap needs nonces and `connect-src` must enumerate
   * Supabase + Upstash + Plaid exactly. Per the ledger that lands as
   * report-only → enforce against a preview URL, gated on grade A. */
  async headers() {
    const securityHeaders = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), geolocation=(), browsing-topics=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      {
        key: "Content-Security-Policy",
        value:
          "frame-ancestors 'none'; frame-src https://cdn.plaid.com; object-src 'none'; base-uri 'self'",
      },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /* Workspace packages consumed as TypeScript source (package.json main
   * points at ./src/index.ts, not a built dist/). Next webpack won't
   * transpile node_modules by default — opt them in explicitly or it
   * chokes on bare `.ts` imports with "Module parse failed". */
  transpilePackages: [
    "@autonomux/auth",
    "@autonomux/cipher",
    "@autonomux/db",
    "@autonomux/flags",
    "@autonomux/llm",
    "@autonomux/logger",
    "@autonomux/orchestrator",
    "@autonomux/ui",
  ],
  // OTel Node SDK is heavy + uses dynamic require — keep it external so
  // Next doesn't try to bundle it for the server runtime. Auto-loaded
  // by `instrumentation.ts`. Phase 1.0-B10 (Watch).
  serverExternalPackages: [
    "@opentelemetry/api",
    "@opentelemetry/sdk-node",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/resources",
    "@opentelemetry/semantic-conventions",
    "@autonomux/telemetry",
    // Vercel build fix 2026-05-29: transitive deps of
    // @opentelemetry/auto-instrumentations-node webpack can't bundle
    // (require Node-only `net`/`tls`/`fs`/`stream`). Stay external.
    "@grpc/grpc-js",
    "@grpc/proto-loader",
    "protobufjs",
    "require-in-the-middle",
    "import-in-the-middle",
    "@opentelemetry/instrumentation",
    "@opentelemetry/instrumentation-http",
    "@opentelemetry/instrumentation-undici",
    "@opentelemetry/instrumentation-ioredis",
    "@opentelemetry/instrumentation-pg",
    "@opentelemetry/instrumentation-pino",
  ],
};

export default config;
