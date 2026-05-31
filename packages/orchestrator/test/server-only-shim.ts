/**
 * Vitest shim: `server-only` no-ops in unit tests. The real package
 * throws at module-load time when imported from a Client Component
 * bundle. Vitest runs in Node, never bundles for the browser, so the
 * guard is correct to silence here. See packages/orchestrator/vitest.config.ts.
 */
export {};
