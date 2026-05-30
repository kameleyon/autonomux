import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [],
  },
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
