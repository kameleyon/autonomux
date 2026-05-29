/**
 * Redaction smoke tests.
 *
 * We don't exercise the transport path here — `pino.transport` would
 * spin up a worker thread, which makes capture racy. Instead, we feed
 * the same `REDACT_PATHS` and censor into a pino instance bound to an
 * in-memory writable stream and assert on the serialized output.
 *
 * If REDACT_PATHS regresses (someone removes `password` or
 * `req.body.password`), these tests fail loudly.
 */

import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";
import { pino } from "pino";

import { REDACT_PATHS } from "../logger.js";

const REDACT_CENSOR = "[REDACTED]";

/**
 * Build a pino logger that writes JSON lines into an array we can
 * inspect synchronously after each `.info(...)` call.
 */
function buildCapturingLogger(): {
  logger: ReturnType<typeof pino>;
  records: Array<Record<string, unknown>>;
} {
  const records: Array<Record<string, unknown>> = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      // pino emits one JSON object per newline-delimited line.
      const text: string = chunk.toString("utf8");
      for (const line of text.split("\n")) {
        if (!line) continue;
        try {
          records.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // ignore non-JSON noise
        }
      }
      cb();
    },
  });

  const logger = pino(
    {
      level: "trace",
      redact: {
        paths: [...REDACT_PATHS],
        censor: REDACT_CENSOR,
        remove: false,
      },
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    },
    sink,
  );

  return { logger, records };
}

describe("logger redaction", () => {
  it("redacts top-level `password` field", () => {
    const { logger, records } = buildCapturingLogger();

    logger.info({ password: "hunter2", note: "login attempt" }, "auth");

    const rec = records[0];
    expect(rec).toBeDefined();
    expect(rec?.["password"]).toBe(REDACT_CENSOR);
    // Non-PII field must survive.
    expect(rec?.["note"]).toBe("login attempt");
  });

  it("redacts `authorization: Bearer ...` style headers", () => {
    const { logger, records } = buildCapturingLogger();

    logger.info(
      {
        authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
        path: "/api/agents",
      },
      "incoming request",
    );

    const rec = records[0];
    expect(rec).toBeDefined();
    expect(rec?.["authorization"]).toBe(REDACT_CENSOR);
    expect(rec?.["path"]).toBe("/api/agents");
  });

  it("redacts nested `req.body.password`", () => {
    const { logger, records } = buildCapturingLogger();

    logger.info(
      {
        req: {
          method: "POST",
          url: "/auth/signin",
          body: {
            email: "user@example.com",
            password: "hunter2",
          },
        },
      },
      "request received",
    );

    const rec = records[0];
    expect(rec).toBeDefined();
    const req = rec?.["req"] as Record<string, unknown> | undefined;
    expect(req).toBeDefined();
    const body = req?.["body"] as Record<string, unknown> | undefined;
    expect(body).toBeDefined();
    // password must be redacted; method/url must survive.
    expect(body?.["password"]).toBe(REDACT_CENSOR);
    expect(req?.["method"]).toBe("POST");
    expect(req?.["url"]).toBe("/auth/signin");
    // email is on the cipher PII path list — must also be redacted.
    expect(body?.["email"]).toBe(REDACT_CENSOR);
  });

  it("redacts nested `job.data.token` (BullMQ payload shape)", () => {
    const { logger, records } = buildCapturingLogger();

    logger.info(
      {
        job: {
          id: "abc-123",
          name: "mailroom.send",
          data: {
            token: "ya29.opaque-google-oauth-token",
            recipient_count: 12,
          },
        },
      },
      "job started",
    );

    const rec = records[0];
    expect(rec).toBeDefined();
    const job = rec?.["job"] as Record<string, unknown> | undefined;
    const data = job?.["data"] as Record<string, unknown> | undefined;
    expect(data?.["token"]).toBe(REDACT_CENSOR);
    // Non-secret field passes through.
    expect(data?.["recipient_count"]).toBe(12);
    expect(job?.["id"]).toBe("abc-123");
  });

  it("preserves non-PII structured fields", () => {
    const { logger, records } = buildCapturingLogger();

    logger.info(
      {
        request_id: "00000000-0000-4000-8000-000000000000",
        tenant_id: "11111111-1111-4111-8111-111111111111",
        method: "GET",
        path: "/api/health",
        status: 200,
        latency_ms: 7,
      },
      "http access",
    );

    const rec = records[0];
    expect(rec).toBeDefined();
    expect(rec?.["request_id"]).toBe("00000000-0000-4000-8000-000000000000");
    expect(rec?.["method"]).toBe("GET");
    expect(rec?.["path"]).toBe("/api/health");
    expect(rec?.["status"]).toBe(200);
    expect(rec?.["latency_ms"]).toBe(7);
  });
});
