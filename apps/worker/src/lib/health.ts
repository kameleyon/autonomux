/**
 * Minimal HTTP health endpoint for the worker.
 *
 * Background workers don't expose an HTTP API — but Railway (and most
 * PaaS providers) require a listening port to consider the container
 * "healthy"; otherwise they assume the deploy is broken and restart
 * the container in a loop. This file gives us:
 *   - GET /     → 200 OK + JSON heartbeat (service, version, uptime)
 *   - any other → 404
 *
 * We deliberately use the built-in `node:http` module instead of
 * Express/Fastify so the worker still ships a "nothing extra" footprint.
 *
 * Owner: [Pipeline]
 */

import { createServer, type Server } from "node:http";
import type { Logger } from "pino";

const DEFAULT_PORT = 8080;
const startedAtMs = Date.now();

export type HealthServer = {
  readonly port: number;
  close(): Promise<void>;
};

export function startHealthServer(logger: Logger): HealthServer {
  /* Railway injects PORT automatically. Fall back to 8080 for local
   * runs so `npm run dev` doesn't fail when PORT isn't set. */
  const portRaw = process.env["PORT"];
  const port = portRaw !== undefined && portRaw.length > 0
    ? Number.parseInt(portRaw, 10)
    : DEFAULT_PORT;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`[health] invalid PORT env: ${String(portRaw)}`);
  }

  const log = logger.child({ component: "health" });

  const server: Server = createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "apps/worker",
          uptime_ms: Date.now() - startedAtMs,
        }),
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  server.listen(port, "0.0.0.0", () => {
    log.info({ port }, "health server listening");
  });

  server.on("error", (err) => {
    log.error({ err }, "health server error");
  });

  return {
    port,
    close(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err !== undefined) reject(err);
          else resolve();
        });
      });
    },
  };
}
