/**
 * apps/worker/src/lib/scheduler-engine.ts
 *
 * Pure logic for one Scheduler read pass.
 *
 * Flow:
 *   1. Caller hands us tenantId + a list of raw Google Calendar events
 *      pulled from gcal-client and the [start, end) window we requested.
 *   2. We normalize each event into the `SchedulerEvent` shape the
 *      orchestrator + chat UI consume.
 *   3. We sweep the normalized list for time-window overlaps to set
 *      `has_conflict` + `conflict_with`. The sweep is O(n^2) — n is bounded
 *      by the caller's `maxResults` (typically <=50, never more than 250
 *      for the 14-day range cap enforced by the worker).
 *   4. Return the normalized events plus the count of conflicting ones and
 *      the echo of the requested range.
 *
 * No LLM call in v0 — the orchestrator turns the structured result into
 * prose. This module is dependency-free aside from the gcal-client types
 * and a logger for diagnostics.
 *
 * Owner: [Forge]
 */

import type { Logger } from "pino";

import type { GcalEventListEntry } from "./gcal-client.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SchedulerAttendee {
  readonly email: string;
  readonly response: string;
}

export interface SchedulerEvent {
  readonly id: string;
  readonly summary: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly is_all_day: boolean;
  readonly location: string | null;
  readonly attendees: readonly SchedulerAttendee[];
  readonly organizer_email: string | null;
  readonly is_self_organizer: boolean;
  readonly has_conflict: boolean;
  readonly conflict_with: readonly string[];
  readonly html_link: string | null;
}

export interface SchedulerRange {
  readonly start: string;
  readonly end: string;
}

export interface SchedulerResult {
  readonly events: readonly SchedulerEvent[];
  readonly conflict_count: number;
  readonly range: SchedulerRange;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Sub-agent name used in `sub_agent_runs` rows. The Scheduler is pure
 * read/normalize today — no LLM — but the field exists so downstream
 * observability can attribute work consistently across sub-agents.
 */
export const SCHEDULER_SUB_AGENT_NAME = "scheduler" as const;

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Google Calendar event's start/end pair into ISO-8601 timestamps.
 *
 * - Timed events: `dateTime` already contains an offset; we round-trip via
 *   `Date.parse` to validate, then return the canonical ISO form (UTC).
 * - All-day events: `date` is YYYY-MM-DD without a timezone. Per Google's
 *   semantics the event starts at 00:00 in the user's local time and lasts
 *   until the `end.date` (exclusive). We anchor to UTC midnight which keeps
 *   the row deterministic across worker hosts and matches how the cache
 *   table's `timestamptz` column normalizes input.
 */
function toIso(time: { dateTime?: string; date?: string }): string | null {
  if (typeof time.dateTime === "string" && time.dateTime.length > 0) {
    const ms = Date.parse(time.dateTime);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  }
  if (typeof time.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(time.date)) {
    return `${time.date}T00:00:00.000Z`;
  }
  return null;
}

function isAllDay(raw: GcalEventListEntry): boolean {
  return (
    typeof raw.start.date === "string" &&
    raw.start.date.length > 0 &&
    raw.start.dateTime === undefined
  );
}

function normalizeAttendees(
  raw: GcalEventListEntry,
): readonly SchedulerAttendee[] {
  if (raw.attendees === undefined) return [];
  const out: SchedulerAttendee[] = [];
  for (const a of raw.attendees) {
    if (typeof a.email !== "string" || a.email.length === 0) continue;
    out.push({
      email: a.email,
      response: typeof a.responseStatus === "string" ? a.responseStatus : "needsAction",
    });
  }
  return out;
}

interface NormalizedEvent {
  readonly source: GcalEventListEntry;
  readonly id: string;
  readonly summary: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly start_ms: number;
  readonly end_ms: number;
  readonly is_all_day: boolean;
  readonly location: string | null;
  readonly attendees: readonly SchedulerAttendee[];
  readonly organizer_email: string | null;
  readonly is_self_organizer: boolean;
  readonly html_link: string | null;
}

function normalizeOne(raw: GcalEventListEntry): NormalizedEvent | null {
  const startIso = toIso(raw.start);
  const endIso = toIso(raw.end);
  if (startIso === null || endIso === null) return null;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  const allDay = isAllDay(raw);
  const organizerEmail =
    typeof raw.organizer?.email === "string" ? raw.organizer.email : null;
  const selfOrganizer =
    raw.organizer?.self === true ||
    (raw.attendees ?? []).some((a) => a.self === true && a.organizer === true);

  return {
    source: raw,
    id: raw.id,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    start_at: startIso,
    end_at: endIso,
    start_ms: startMs,
    end_ms: endMs,
    is_all_day: allDay,
    location:
      typeof raw.location === "string" && raw.location.length > 0
        ? raw.location
        : null,
    attendees: normalizeAttendees(raw),
    organizer_email: organizerEmail,
    is_self_organizer: selfOrganizer,
    html_link:
      typeof raw.htmlLink === "string" && raw.htmlLink.length > 0
        ? raw.htmlLink
        : null,
  };
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Two intervals [a_start, a_end) and [b_start, b_end) overlap iff
 *   a_start < b_end && b_start < a_end.
 *
 * All-day events never conflict (with anything) per product decision —
 * they are typically reminders / OOO markers and would otherwise flood the
 * conflict surface every time a timed meeting falls on the same day.
 */
function intervalsOverlap(
  a: NormalizedEvent,
  b: NormalizedEvent,
): boolean {
  if (a.id === b.id) return false;
  if (a.is_all_day || b.is_all_day) return false;
  return a.start_ms < b.end_ms && b.start_ms < a.end_ms;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export interface SchedulerDeps {
  readonly logger: Logger;
}

export interface SchedulerArgs {
  readonly tenantId: string;
  readonly events: readonly GcalEventListEntry[];
  readonly rangeStartIso: string;
  readonly rangeEndIso: string;
}

/**
 * Normalize and conflict-check a window of Google Calendar events.
 *
 * Caller (Scheduler worker) writes:
 *   - `sub_agent_runs` row
 *   - `scheduler_events` cache rows
 *
 * We do NOT do any of that here.
 */
export async function readSchedule(
  deps: SchedulerDeps,
  args: SchedulerArgs,
): Promise<SchedulerResult> {
  const log = deps.logger.child({
    component: "scheduler-engine",
    tenantId: args.tenantId,
  });

  // 1. Normalize + drop cancelled.
  const normalized: NormalizedEvent[] = [];
  let dropped = 0;
  for (const raw of args.events) {
    if (raw.status === "cancelled") {
      dropped++;
      continue;
    }
    const n = normalizeOne(raw);
    if (n === null) {
      dropped++;
      continue;
    }
    normalized.push(n);
  }

  // 2. Conflict sweep — O(n^2). n is bounded by the worker's maxResults cap
  //    (<=250 for the 14-day range, typically <=50 for "today").
  const conflictsById = new Map<string, string[]>();
  for (let i = 0; i < normalized.length; i++) {
    const a = normalized[i]!;
    for (let j = i + 1; j < normalized.length; j++) {
      const b = normalized[j]!;
      if (intervalsOverlap(a, b)) {
        const aList = conflictsById.get(a.id) ?? [];
        aList.push(b.id);
        conflictsById.set(a.id, aList);
        const bList = conflictsById.get(b.id) ?? [];
        bList.push(a.id);
        conflictsById.set(b.id, bList);
      }
    }
  }

  // 3. Project to public shape.
  const events: SchedulerEvent[] = normalized.map((n) => {
    const conflict_with = conflictsById.get(n.id) ?? [];
    return {
      id: n.id,
      summary: n.summary,
      start_at: n.start_at,
      end_at: n.end_at,
      is_all_day: n.is_all_day,
      location: n.location,
      attendees: n.attendees,
      organizer_email: n.organizer_email,
      is_self_organizer: n.is_self_organizer,
      has_conflict: conflict_with.length > 0,
      conflict_with,
      html_link: n.html_link,
    };
  });

  const conflict_count = events.reduce(
    (acc, e) => (e.has_conflict ? acc + 1 : acc),
    0,
  );

  log.info(
    {
      input_count: args.events.length,
      kept: events.length,
      dropped,
      conflict_count,
    },
    "scheduler read: triage complete",
  );

  return {
    events,
    conflict_count,
    range: { start: args.rangeStartIso, end: args.rangeEndIso },
  };
}
