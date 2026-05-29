# @autonomux/telemetry

Single source of truth for OpenTelemetry tracing across the Autonomux monorepo.
Spans flow over OTLP/HTTP to Axiom (or any OTLP collector).

Phase: **1.0-B10** (Watch).

## What it does

- **`initTelemetry({ service, version })`** — boots the OTel SDK with a
  pre-configured OTLP/HTTP exporter and the default Node
  auto-instrumentations (HTTP, ioredis, pg, undici, pino, fetch, etc.).
  Returns a `TelemetryHandle` whose `shutdown()` flushes pending spans on
  SIGTERM.
- **`withSpan(name, fn, opts?)`** — wraps any async function in a span.
  Errors are recorded as exceptions, span status is set to ERROR, and
  the original error rethrows.
- **`traceLlmCall(ctx, fn)`** — wraps an LLM call. Records the
  PRD §8.4 dimensions (model, provider, tokens, cost, latency, stop
  reason) as queryable span attributes.
- **`getTracer(name?, version?)`** — `trace.getTracer` thin wrapper for
  custom span emission.
- **`addAttributes(span, attrs)`** — undefined-safe attribute setter.

## Boot ordering

`initTelemetry` MUST run before any module that should be
auto-instrumented (most notably anything using `http`, `pg`, or
`ioredis`). In Next.js this means putting the call in
`apps/web/instrumentation.ts`; in the worker it goes at the top of
`apps/worker/src/index.ts`.

## Dev vs prod behavior

| Scenario                                  | Result                          |
| ----------------------------------------- | ------------------------------- |
| dev, `OTEL_EXPORTER_OTLP_ENDPOINT` unset  | no-op, no crash                 |
| dev, endpoint set                         | spans ship to endpoint          |
| prod (`DEPLOYMENT_ENV=production`), unset | hard fail at boot               |
| prod, endpoint set                        | spans ship to endpoint          |

Production refuses to start without an endpoint — silent observability
loss is a config-drift anti-pattern.

## Environment variables

| Variable                       | Required          | Notes                                                                                                        |
| ------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `OTEL_EXPORTER_OTLP_ENDPOINT`  | prod              | Full OTLP/HTTP traces URL. For Axiom: `https://api.axiom.co/v1/traces`.                                      |
| `OTEL_EXPORTER_OTLP_HEADERS`   | with Axiom        | Comma-separated `k=v` pairs, e.g. `Authorization=Bearer xaat-...,X-Axiom-Dataset=autonomux-traces`.          |
| `OTEL_RESOURCE_ATTRIBUTES`     | optional          | Standard OTel resource attr spec format. Honored by the SDK out of the box.                                  |
| `DEPLOYMENT_ENV`               | recommended       | `development` / `staging` / `production`. Falls back to `NODE_ENV`, then `development`.                      |
| `OTEL_LOG_LEVEL`               | optional, debug   | Set to `debug` to surface OTel SDK internals (useful when spans aren't arriving).                            |

## Attribute hygiene (READ THIS)

Span attributes ship to Axiom and are queryable by anyone with
dashboard access. **Never** put the following in attributes:

- OAuth tokens, API keys, passwords
- Raw email subjects / bodies / addresses
- Plaintext financial transaction descriptions
- Anything that violates PRD §8.2 PII redaction

Numeric metadata (token counts, cost in USD, latency, status codes) is
fine. Tenant / request / job ids are fine. When in doubt, log it through
Pino with the redactor and reference the log line by `request_id`.

Spans should carry **≤ ~10 attributes**. More than that and the
exporter wire size + dashboard noise both become a problem.
