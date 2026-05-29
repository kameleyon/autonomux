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
  ],
};

export default config;
