import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [],
  },
  /* Workspace packages are consumed as TypeScript source (their
   * package.json `main` points at ./src/index.ts, not a built dist/).
   * Next.js does not transpile node_modules by default — we have to
   * opt these in explicitly, or webpack chokes on the bare `.ts` files
   * with "Module parse failed: Unexpected token". 2026-05-30 */
  transpilePackages: [
    "@autonomux/db",
    "@autonomux/flags",
    "@autonomux/logger",
    "@autonomux/ui",
  ],
};

export default config;
