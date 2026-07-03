import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [],
  },
  /* Security headers (Phase 0 Blocker). `frame-ancestors 'self'` blocks
   * cross-origin clickjacking while still allowing the same-origin /app iframe
   * bridge; a full script-src CSP lands with the native AppShell port, once the
   * eval + unpkg-CDN prototype is removed. */
  async headers() {
    const securityHeaders = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), geolocation=(), browsing-topics=()" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
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
