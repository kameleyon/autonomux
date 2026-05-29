# @autonomux/logger

Shared structured logger for every Autonomux service. Pino under the
hood, JSON-only in production, PII-redacted before serialization,
request-id middleware for HTTP propagation, and a non-throwing
audit-log wrapper for the SOC 2 compliance chain.

PRD §8 defines three log tiers. This package owns tier 2 (system log)
and provides a thin writer for tier 3 (audit log). Tier 1 (activity
log) is written by callers directly to Postgres.

## Install (workspace)

Already wired in `apps/web`, `apps/admin`, `apps/worker`. To consume
from a new package, add to its `package.json`:

```json
{
  "dependencies": {
    "@autonomux/logger": "*"
  }
}
```

## Usage

### 1. Boot a service-scoped logger

```ts
// apps/web/lib/logger.ts
import { createLogger } from "@autonomux/logger";

export const logger = createLogger({
  service: "apps/web",
  axiomToken: process.env.AXIOM_TOKEN,
  axiomDataset: process.env.AXIOM_DATASET,
});
```

Every emitted line carries:

```jsonc
{
  "time": "2026-05-29T14:21:08.412Z",
  "level": "info",
  "service": "apps/web",
  "env": "production",
  "pid": 17,
  "request_id": "…",   // when set via middleware
  "tenant_id": "…",    // when caller binds it
  "msg": "…"
}
```

ISO8601 UTC timestamps always. Pino's `formatters.level` ensures level
ships as the human label (`"info"`) instead of the numeric (`30`).

### 2. Request middleware (Next.js / generic HTTP)

```ts
// apps/web/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createNextRequestLogger } from "@autonomux/logger";

import { logger } from "@/lib/logger";

const requestLogger = createNextRequestLogger(logger);

export function middleware(req: NextRequest) {
  const ctx = requestLogger.begin(req);
  const res = NextResponse.next({
    request: { headers: new Headers(req.headers) },
  });
  requestLogger.attach(res, ctx.request_id);

  // Downstream handlers read `x-request-id` off req.headers and
  // bind it to their own child loggers.
  res.headers.set("x-request-id", ctx.request_id);
  return res;
}
```

The `begin()` call:

- Reuses an inbound `x-request-id` when present and well-formed (UUID
  v4 only — anything else is rejected to prevent spoofing of arbitrary
  values into log queries).
- Otherwise generates a fresh UUID v4 via `crypto.randomUUID()`.
- Attaches a child logger pre-bound with `request_id`, `method`,
  `path`, plus `trace_id` / `span_id` if OpenTelemetry is loaded in
  the process.

`finish(ctx, status)` emits an access-log record at the right level:

| Status | Level |
|---|---|
| 1xx / 2xx / 3xx | info |
| 4xx | warn |
| 5xx | error |

### 3. Audit log (PRD §8.3)

```ts
import { writeAuditEvent } from "@autonomux/logger";
import { createServiceClient } from "@autonomux/db";

const supabase = createServiceClient();

await writeAuditEvent({
  supabase,
  logger,
  actor_user_id: session.user.id,
  action: "oauth.grant",
  resource_type: "integration",
  resource_id: "google",
  tenant_id: session.tenant_id,
  metadata: { scopes: ["gmail.send"] },
});
```

Contract:

- **Never throws.** The function returns `{ ok: true | false }` for
  callers that care, but most call sites can ignore the return value.
- On failure, emits an `audit.write_failed` log line at `error` level
  with `retry_queue: "audit"` — the BullMQ `audit` queue consumer
  (apps/worker) sweeps these and re-drives the insert.
- Successful writes are silent (the DB row is the receipt).

## Redaction posture

Two layers, both required to ship:

1. **`@autonomux/cipher` PII list** — `pinoRedactPaths` covers every
   PII field name (`email`, `phone`, `ssn`, `password`, `credit_card`,
   etc.) at three depths (`name`, `*.name`, `*.*.name`).
2. **HTTP / BullMQ / Next.js paths** — added in this package:
   `headers.authorization`, `headers.cookie`, `req.body.password`,
   `req.body.token`, `job.data.token`, `job.data.api_key`, etc.

Censor token: `"[REDACTED]"`. We do NOT use `remove: true` so
schemas stay stable for downstream parsers / dashboards.

What we do NOT redact:

- Free-text PII inside `msg` strings. Engineers MUST use structured
  fields (`{ email: "..." }`) for redaction to fire.
- Whatever isn't named on the list. The list is conservative; add new
  fields here, never at the call site.

NEVER pass to logger.* — tokens, raw passwords, raw card numbers
(PCI), raw email *content* (PII), envelope ciphertexts.

## Dev vs prod transport

| Environment | Transport |
|---|---|
| `NODE_ENV=development` / `test` | `pino-pretty` on stdout, colored, time-only timestamps |
| `NODE_ENV=production` or `staging` + `AXIOM_TOKEN` set | `@axiomhq/pino` transport (lazy-loaded) |
| `NODE_ENV=production` without `AXIOM_TOKEN` | Raw JSON on stdout (still captured by Vercel/Railway) |

The Axiom transport is lazy: if `@axiomhq/pino` isn't installed in the
image, we silently fall through to stdout JSON. This means deploys
never break because the optional transport module is missing.

## Request-id propagation

`x-request-id` is the canonical header. The Next.js middleware writes
it on every response; outbound `fetch` calls in apps should forward
the inbound value:

```ts
const requestId = headers().get("x-request-id");
await fetch(internalUrl, {
  headers: { "x-request-id": requestId ?? crypto.randomUUID() },
});
```

The worker pulls `request_id` off the BullMQ job payload and binds it
to its child logger, so a single user action stays traceable from web
→ worker → DB.

## Environment

See `.env.example`:

- `AXIOM_TOKEN` — Axiom ingest token (system log destination)
- `AXIOM_DATASET` — Axiom dataset name (e.g. `autonomux-prod`)
- `LOG_LEVEL` — `trace | debug | info | warn | error | fatal` (default `info`)

## Test

```sh
cd packages/logger
npx vitest run
```

Covers the redaction surface — top-level `password`, bearer tokens,
nested `req.body.password`, nested `job.data.token`, and confirms
non-PII structured fields survive.
