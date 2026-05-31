/**
 * Vitest config for @autonomux/orchestrator.
 *
 * Aliases the `server-only` runtime barrier to an empty module so unit
 * tests can import server-side modules. In production, Next.js / the
 * worker process enforces the boundary at build time; the package's
 * own tests run in Node, never in the browser.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": new URL("./test/server-only-shim.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
