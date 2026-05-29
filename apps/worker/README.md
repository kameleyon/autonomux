# @autonomux/worker

Background worker for Autonomux. BullMQ-driven queue runner that hosts every
AlterEgo sub-agent (Mailroom, Scheduler, Scribe, Oracle, Treasurer, Briefing,
Audit, Cron). Deployed to Railway. Talks to Upstash Redis for the queue and
to Supabase for persistence (added in later phases).

This is **Phase 1.0-A4**: the scaffold. Queues are wired up, idempotency and
shutdown are real, but every queue ships with a `stub` processor that logs
the job and returns. Real per-sub-agent processors land in later phases.

## Stack

- Node 20 ESM
- TypeScript (strict)
- BullMQ 5.x
- IORedis 5.x
- Pino 9.x with PII redaction (per PRD §8.2)
- dotenv for local env loading
- tsx for dev runs

## Local dev

You need a Redis instance. Two options:

**Option A — local Docker:**

```bash
docker run --rm -p 6379:6379 redis:7-alpine
```

Then in `apps/worker/`:

```bash
cp .env.example .env
# Edit .env if Redis is not on localhost:6379
npm install        # from repo root if not already done
npm run dev        # tsx watch src/index.ts
```

**Option B — Upstash:**

Create a Redis database on Upstash, copy the `rediss://...` URL into
`apps/worker/.env` as `REDIS_URL`, then `npm run dev`.

## Scripts

| script | what |
|---|---|
| `npm run dev` | tsx watch `src/index.ts` — auto-reload on save |
| `npm run build` | `tsc` → emits `dist/` |
| `npm run start` | `node dist/index.js` — what Railway runs |
| `npm run typecheck` | `tsc --noEmit` — CI gate |
| `npm run clean` | remove `dist/` and Turbo cache |

## Deployment (Railway)

`railway.json` declares build + start commands. Procfile mirrors the start
command for any Railway service template that prefers it.

1. Create a Railway service from this repo, root `apps/worker`.
2. Add env vars from `.env.example` in the service variables panel.
3. Attach an Upstash Redis (or any Redis) and set its URL as `REDIS_URL`.
4. Railway runs `npm run build` then `npm run start`.

The worker exits cleanly on SIGTERM (BullMQ workers close, queues close,
Redis quits) so rolling deploys don't drop in-flight jobs.

## Queues

Defined in `src/queues/index.ts`:

| queue | purpose |
|---|---|
| `agent` | AlterEgo orchestration runs (root) |
| `mailroom` | Email triage |
| `scheduler` | Calendar scans |
| `scribe` | Article drafting + publishing |
| `oracle` | Daily cardology / astrology / tarot reading |
| `treasurer` | Plaid sync + bill checks |
| `briefing` | Morning briefing composition + delivery |
| `audit` | Audit log signed-chain checkpoints |
| `cron` | Time-triggered jobs (heartbeat, daily checkpoint) |

Each queue exports an `addJob(jobName, payload, opts?)` helper — callers
should use that rather than constructing `Queue.add(...)` calls directly,
so idempotency (`requestId` → BullMQ `jobId`) is consistent.

## Idempotency

Every job payload extends `BaseJobPayload` and carries a `requestId`. The
stub processor + every real processor must call
`acquireIdempotencyLock(redis, requestId, ttlSeconds)` before doing work.
Duplicate requestIds return `{ status: "deduped" }` and do nothing.

## Logging

Pino JSON to stdout. In prod, Railway → Axiom ships those lines forward
(per PRD §8.2). Redaction rules live in `src/lib/logger.ts`. Never `console.log`.

## What's NOT here yet

- Real Mailroom / Scheduler / Scribe / Oracle / Treasurer / Briefing
  / Audit processors — they replace the stub in `src/queues/index.ts`
  per-sub-agent in later phases.
- Supabase client — added once the first real processor needs it.
- Anthropic SDK — added with the agent queue's real processor.
- HTTP healthcheck endpoint — Railway's TCP check on the worker process
  is enough for now; an HTTP probe lands when we add the agent-runs
  status surface for the admin cpanel.
