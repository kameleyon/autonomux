/**
 * apps/worker/src/workers/__tests__/scheduler.test.ts
 *
 * Vitest suite for the Scheduler worker + supporting libs. Each test stubs
 * the gcal client (and supabase upsert) to keep the suite hermetic (no
 * network, no Supabase, no Redis).
 *
 * Covers Phase 1.1-C acceptance items:
 *   - conflict detection counts overlapping timed events
 *   - all-day events never conflict with timed events
 *   - cancelled events are filtered out
 *   - scheduler_events cache upsert payload shape matches the schema
 *   - GcalNotConnectedError is surfaced as oauth.missing without retry
 *
 * Owner: [Forge]
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Logger } from "pino";

import {
  readSchedule,
  type SchedulerEvent,
} from "../../lib/scheduler-engine.js";
import {
  createGcalClient,
  GcalNotConnectedError,
  type GcalClient,
  type GcalEventListEntry,
} from "../../lib/gcal-client.js";
import {
  processSchedulerJob,
  SCHEDULER_JOB_READ_RANGE,
  SCHEDULER_JOB_READ_TODAY,
  type SchedulerWorkerDeps,
} from "../scheduler.js";
import type { BaseJobPayload, BaseJobResult } from "../../queues/index.js";
import type { Job } from "bullmq";
import type { Redis } from "ioredis";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  const noop = (): void => {};
  const child = (): Logger => makeLogger();
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child,
  } as unknown as Logger;
}

function timedEvent(
  over: Partial<GcalEventListEntry> & {
    id: string;
    startIso: string;
    endIso: string;
  },
): GcalEventListEntry {
  return {
    id: over.id,
    status: over.status ?? "confirmed",
    summary: over.summary ?? `event ${over.id}`,
    start: { dateTime: over.startIso },
    end: { dateTime: over.endIso },
    ...(over.attendees !== undefined ? { attendees: over.attendees } : {}),
    ...(over.organizer !== undefined ? { organizer: over.organizer } : {}),
    ...(over.location !== undefined ? { location: over.location } : {}),
    ...(over.htmlLink !== undefined ? { htmlLink: over.htmlLink } : {}),
  };
}

function allDayEvent(over: {
  id: string;
  date: string;
  endDate: string;
  status?: string;
}): GcalEventListEntry {
  return {
    id: over.id,
    status: over.status ?? "confirmed",
    summary: `all-day ${over.id}`,
    start: { date: over.date },
    end: { date: over.endDate },
  };
}

// ---------------------------------------------------------------------------
// Scheduler engine — conflict detection + normalization
// ---------------------------------------------------------------------------

describe("scheduler-engine.readSchedule", () => {
  let logger: Logger;
  beforeEach(() => {
    logger = makeLogger();
  });

  it("detects overlapping timed events and counts conflicts", async () => {
    // Five events. Two overlap each other (b + c), the others don't.
    const events: GcalEventListEntry[] = [
      timedEvent({
        id: "a",
        startIso: "2026-05-31T09:00:00.000Z",
        endIso: "2026-05-31T10:00:00.000Z",
      }),
      timedEvent({
        id: "b",
        startIso: "2026-05-31T11:00:00.000Z",
        endIso: "2026-05-31T12:00:00.000Z",
      }),
      timedEvent({
        id: "c",
        startIso: "2026-05-31T11:30:00.000Z",
        endIso: "2026-05-31T12:30:00.000Z",
      }),
      timedEvent({
        id: "d",
        startIso: "2026-05-31T13:00:00.000Z",
        endIso: "2026-05-31T14:00:00.000Z",
      }),
      allDayEvent({ id: "e", date: "2026-05-31", endDate: "2026-06-01" }),
    ];

    const res = await readSchedule(
      { logger },
      {
        tenantId: "tenant-A",
        events,
        rangeStartIso: "2026-05-31T00:00:00.000Z",
        rangeEndIso: "2026-06-01T00:00:00.000Z",
      },
    );

    expect(res.events).toHaveLength(5);
    expect(res.conflict_count).toBe(2);

    const byId = new Map<string, SchedulerEvent>(
      res.events.map((e) => [e.id, e]),
    );
    expect(byId.get("a")!.has_conflict).toBe(false);
    expect(byId.get("b")!.has_conflict).toBe(true);
    expect(byId.get("b")!.conflict_with).toEqual(["c"]);
    expect(byId.get("c")!.has_conflict).toBe(true);
    expect(byId.get("c")!.conflict_with).toEqual(["b"]);
    expect(byId.get("d")!.has_conflict).toBe(false);
    // All-day never conflicts.
    expect(byId.get("e")!.has_conflict).toBe(false);
    expect(byId.get("e")!.is_all_day).toBe(true);

    expect(res.range).toEqual({
      start: "2026-05-31T00:00:00.000Z",
      end: "2026-06-01T00:00:00.000Z",
    });
  });

  it("does not flag all-day events as conflicting with timed events", async () => {
    const events: GcalEventListEntry[] = [
      allDayEvent({ id: "holiday", date: "2026-05-31", endDate: "2026-06-01" }),
      timedEvent({
        id: "meet",
        startIso: "2026-05-31T15:00:00.000Z",
        endIso: "2026-05-31T16:00:00.000Z",
      }),
    ];

    const res = await readSchedule(
      { logger },
      {
        tenantId: "tenant-A",
        events,
        rangeStartIso: "2026-05-31T00:00:00.000Z",
        rangeEndIso: "2026-06-01T00:00:00.000Z",
      },
    );

    expect(res.conflict_count).toBe(0);
    for (const e of res.events) {
      expect(e.has_conflict).toBe(false);
      expect(e.conflict_with).toEqual([]);
    }
  });

  it("filters out cancelled events", async () => {
    const events: GcalEventListEntry[] = [
      timedEvent({
        id: "a",
        startIso: "2026-05-31T09:00:00.000Z",
        endIso: "2026-05-31T10:00:00.000Z",
      }),
      timedEvent({
        id: "b",
        status: "cancelled",
        startIso: "2026-05-31T09:00:00.000Z",
        endIso: "2026-05-31T10:00:00.000Z",
      }),
    ];

    const res = await readSchedule(
      { logger },
      {
        tenantId: "tenant-A",
        events,
        rangeStartIso: "2026-05-31T00:00:00.000Z",
        rangeEndIso: "2026-06-01T00:00:00.000Z",
      },
    );

    expect(res.events).toHaveLength(1);
    expect(res.events[0]!.id).toBe("a");
    expect(res.conflict_count).toBe(0);
  });

  it("normalizes attendees and organizer fields", async () => {
    const events: GcalEventListEntry[] = [
      timedEvent({
        id: "with-people",
        startIso: "2026-05-31T09:00:00.000Z",
        endIso: "2026-05-31T10:00:00.000Z",
        organizer: { email: "me@example.com", self: true },
        attendees: [
          { email: "me@example.com", responseStatus: "accepted", self: true },
          { email: "guest@example.com", responseStatus: "needsAction" },
          // entry without email is dropped:
          { displayName: "Anon", responseStatus: "tentative" },
        ],
        location: "Conf Room",
        htmlLink: "https://calendar.google.com/event?eid=xyz",
      }),
    ];

    const res = await readSchedule(
      { logger },
      {
        tenantId: "tenant-A",
        events,
        rangeStartIso: "2026-05-31T00:00:00.000Z",
        rangeEndIso: "2026-06-01T00:00:00.000Z",
      },
    );

    const e = res.events[0]!;
    expect(e.organizer_email).toBe("me@example.com");
    expect(e.is_self_organizer).toBe(true);
    expect(e.attendees).toEqual([
      { email: "me@example.com", response: "accepted" },
      { email: "guest@example.com", response: "needsAction" },
    ]);
    expect(e.location).toBe("Conf Room");
    expect(e.html_link).toBe("https://calendar.google.com/event?eid=xyz");
  });
});

// ---------------------------------------------------------------------------
// Worker dispatcher — cache upsert payload shape + oauth-missing handling
// ---------------------------------------------------------------------------

interface UpsertCapture {
  table: string;
  rows: unknown;
  onConflict: string;
}

interface SupabaseCapture {
  inserts: { table: string; row: unknown }[];
  upserts: UpsertCapture[];
}

function makeCaptureSupabase(): {
  sb: import("@supabase/supabase-js").SupabaseClient;
  capture: SupabaseCapture;
} {
  const capture: SupabaseCapture = { inserts: [], upserts: [] };

  function makeFrom(table: string): unknown {
    return {
      upsert: (rows: unknown, opts: { onConflict: string }) => {
        capture.upserts.push({ table, rows, onConflict: opts.onConflict });
        return Promise.resolve({ error: null });
      },
      insert: (row: unknown) => {
        capture.inserts.push({ table, row });
        // Synthetic agent_runs insert needs to support .select("id").single()
        return {
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: "synthetic-agent-run" }, error: null }),
          }),
          // Plain insert (sub_agent_runs / activity_log) needs to look like a
          // PromiseLike returning { error: null }.
          then: (resolve: (v: { error: null }) => unknown) =>
            resolve({ error: null }),
        };
      },
    };
  }

  const sb = {
    from: (table: string) => makeFrom(table),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  return { sb, capture };
}

function makeFakeRedis(): Redis {
  return {
    publish: vi.fn().mockResolvedValue(1),
  } as unknown as Redis;
}

function makeJob(
  name: string,
  data: Record<string, unknown>,
  tenantId = "tenant-A",
  requestId = "req-1",
): Job<BaseJobPayload, BaseJobResult> {
  return {
    id: "job-1",
    name,
    attemptsMade: 0,
    data: { requestId, tenantId, data },
  } as unknown as Job<BaseJobPayload, BaseJobResult>;
}

function makeGcalStub(events: readonly GcalEventListEntry[]): GcalClient {
  return {
    listEventsBetween: vi.fn().mockResolvedValue(events),
    listPrimaryCalendar: vi.fn().mockResolvedValue({
      id: "primary",
      summary: "Primary",
      timeZone: "America/Los_Angeles",
    }),
  };
}

describe("processSchedulerJob", () => {
  it("read_range: upserts scheduler_events rows with the expected shape", async () => {
    const events: GcalEventListEntry[] = [
      timedEvent({
        id: "a",
        startIso: "2026-05-31T09:00:00.000Z",
        endIso: "2026-05-31T10:00:00.000Z",
        organizer: { email: "me@example.com", self: true },
        attendees: [
          { email: "me@example.com", responseStatus: "accepted", self: true },
          { email: "guest@example.com", responseStatus: "needsAction" },
        ],
        location: "Conf Room",
        htmlLink: "https://calendar.google.com/event?eid=a",
      }),
      timedEvent({
        id: "b",
        startIso: "2026-05-31T09:30:00.000Z",
        endIso: "2026-05-31T10:30:00.000Z",
      }),
      timedEvent({
        id: "cancelled-one",
        status: "cancelled",
        startIso: "2026-05-31T11:00:00.000Z",
        endIso: "2026-05-31T12:00:00.000Z",
      }),
    ];

    const { sb, capture } = makeCaptureSupabase();
    const deps: SchedulerWorkerDeps = {
      logger: makeLogger(),
      agentBus: makeFakeRedis(),
      gcalClientId: "id",
      gcalClientSecret: "secret",
      readTodayMaxEvents: 50,
      readRangeMaxEvents: 250,
      supabase: sb as never,
      gcal: makeGcalStub(events),
    };

    const job = makeJob(SCHEDULER_JOB_READ_RANGE, {
      startIso: "2026-05-31T00:00:00.000Z",
      endIso: "2026-06-01T00:00:00.000Z",
    });

    const out = await processSchedulerJob({
      logger: deps.logger,
      job,
      deps,
    });

    expect(out.status).toBe("ok");

    // scheduler_events upsert ran with the right onConflict key.
    const sched = capture.upserts.find((u) => u.table === "scheduler_events");
    expect(sched).toBeDefined();
    expect(sched!.onConflict).toBe(
      "tenant_id,gcal_calendar_id,gcal_event_id",
    );

    const rows = sched!.rows as Array<Record<string, unknown>>;
    // cancelled-one is dropped before upsert.
    expect(rows).toHaveLength(2);

    const a = rows.find((r) => r.gcal_event_id === "a")!;
    expect(a).toMatchObject({
      tenant_id: "tenant-A",
      gcal_calendar_id: "primary",
      gcal_event_id: "a",
      summary: "event a",
      location: "Conf Room",
      start_at: "2026-05-31T09:00:00.000Z",
      end_at: "2026-05-31T10:00:00.000Z",
      is_all_day: false,
      status: "confirmed",
      organizer_email: "me@example.com",
      is_self_organizer: true,
      attendee_count: 2,
      has_conflict: true,
      html_link: "https://calendar.google.com/event?eid=a",
    });
    expect(a.conflict_with).toEqual(["b"]);
    expect(typeof a.processed_at).toBe("string");
  });

  it("read_today: surfaces oauth.missing without rethrow when gcal not connected", async () => {
    const { sb } = makeCaptureSupabase();
    const failingGcal: GcalClient = {
      listEventsBetween: vi.fn(),
      listPrimaryCalendar: vi
        .fn()
        .mockRejectedValue(
          new GcalNotConnectedError("missing", "no row"),
        ),
    };
    const bus = makeFakeRedis();

    const deps: SchedulerWorkerDeps = {
      logger: makeLogger(),
      agentBus: bus,
      gcalClientId: "id",
      gcalClientSecret: "secret",
      readTodayMaxEvents: 50,
      readRangeMaxEvents: 250,
      supabase: sb as never,
      gcal: failingGcal,
    };

    const job = makeJob(SCHEDULER_JOB_READ_TODAY, {});

    const out = await processSchedulerJob({
      logger: deps.logger,
      job,
      deps,
    });

    expect(out.status).toBe("ok");

    const publishMock = bus.publish as unknown as ReturnType<typeof vi.fn>;
    const calls = publishMock.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const lastPayload = JSON.parse(calls[calls.length - 1]![1] as string) as {
      kind: string;
      code: string;
    };
    expect(lastPayload.kind).toBe("error");
    expect(lastPayload.code).toBe("oauth.missing");
  });

  it("read_range: rejects a window longer than 14 days", async () => {
    const { sb } = makeCaptureSupabase();
    const deps: SchedulerWorkerDeps = {
      logger: makeLogger(),
      agentBus: makeFakeRedis(),
      gcalClientId: "id",
      gcalClientSecret: "secret",
      readTodayMaxEvents: 50,
      readRangeMaxEvents: 250,
      supabase: sb as never,
      gcal: makeGcalStub([]),
    };

    const job = makeJob(SCHEDULER_JOB_READ_RANGE, {
      startIso: "2026-05-01T00:00:00.000Z",
      endIso: "2026-05-31T00:00:00.000Z",
    });

    // The processor catches the throw, publishes a typed error, then rethrows.
    await expect(
      processSchedulerJob({ logger: deps.logger, job, deps }),
    ).rejects.toThrow(/14d cap/);
  });
});

// ---------------------------------------------------------------------------
// gcal-client — surface the same missing-row / revoked error shape as Gmail
// ---------------------------------------------------------------------------

describe("gcal-client", () => {
  function makeSupabaseStub(opts: {
    row?: unknown;
    selectError?: { message: string } | null;
  }): import("@supabase/supabase-js").SupabaseClient {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: opts.row ?? null,
      error: opts.selectError ?? null,
    });
    const eqB = vi.fn().mockReturnValue({ maybeSingle });
    const eqA = vi.fn().mockReturnValue({ eq: eqB });
    const select = vi.fn().mockReturnValue({ eq: eqA });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ select, update, insert });
    return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
  }

  it("throws GcalNotConnectedError when the row is missing", async () => {
    const sb = makeSupabaseStub({ row: null });
    const client = createGcalClient({
      logger: makeLogger(),
      clientId: "id",
      clientSecret: "secret",
      supabase: sb,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(client.listPrimaryCalendar("tenant-A")).rejects.toBeInstanceOf(
      GcalNotConnectedError,
    );
  });

  it("throws GcalNotConnectedError when oauth_status='revoked'", async () => {
    const sb = makeSupabaseStub({
      row: {
        id: "ca-1",
        tenant_id: "tenant-A",
        integration: "gcal",
        oauth_status: "revoked",
        encrypted_credentials: { v: 1 },
        token_expires_at: null,
      },
    });
    const client = createGcalClient({
      logger: makeLogger(),
      clientId: "id",
      clientSecret: "secret",
      supabase: sb,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(client.listPrimaryCalendar("tenant-A")).rejects.toMatchObject({
      name: "GcalNotConnectedError",
      kind: "revoked",
    });
  });
});
