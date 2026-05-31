/**
 * @autonomux/orchestrator — Scheduler sub-agent tool wrapper.
 *
 * Exposes Scheduler as a single tool the LLM can call:
 *   - `scheduler` with `{ action: "read_today" }`
 *   - `scheduler` with `{ action: "read_range", start_iso, end_iso }`
 *
 * The actual work runs in `apps/worker/src/workers/scheduler.ts` (Cluster B).
 * This file is the orchestrator-side stub that:
 *   1. Validates the LLM-provided input against a zod schema.
 *   2. Maps `action` → BullMQ job name.
 *   3. Enqueues the job via the context's `enqueueAndAwait` helper.
 *   4. Returns the worker's result blocks verbatim — never re-wraps them.
 *
 * Scheduler is intentionally read-only at this stage: it reports what's on
 * the user's Google Calendar (today + tomorrow, or an explicit window) and
 * surfaces conflicts. Create/modify event flows belong to a separate,
 * confirmation-gated tool that will land in a follow-up.
 *
 * Errors are caught + converted to a `tool_result` block with
 * `is_error: true` (per the SubAgent contract). That lets the LLM
 * recover gracefully instead of aborting the whole chat turn.
 */
import { z } from "zod";

import type { ContentBlock, Tool } from "@autonomux/llm";

import type {
  SubAgentEntry,
  SubAgentInvoke,
  SubAgentInvokeContext,
} from "./registry";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Input schema                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

const readTodaySchema = z.object({
  action: z.literal("read_today"),
});
const readRangeSchema = z.object({
  action: z.literal("read_range"),
  start_iso: z.string().datetime({ offset: true }),
  end_iso: z.string().datetime({ offset: true }),
});
const inputSchema = z.discriminatedUnion("action", [
  readTodaySchema,
  readRangeSchema,
]);

/** Map LLM action → BullMQ job name. Mirrors `apps/worker/src/workers/scheduler.ts`. */
const ACTION_TO_JOB: Record<z.infer<typeof inputSchema>["action"], string> = {
  read_today: "scheduler.read_today",
  read_range: "scheduler.read_range",
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Tool schema (Anthropic-shaped)                                             */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Anthropic-style `Tool` shape consumed by `@autonomux/llm`. The schema
 * is intentionally narrow — two actions, no free-form input — so the
 * LLM cannot conjure dangerous parameter combinations. Read-only by design.
 */
export const schedulerTool: Tool = {
  name: "scheduler",
  description:
    "Read the user's Google Calendar. Use 'read_today' for today + tomorrow at a glance, including conflicts; use 'read_range' for an explicit time window (max 14 days). Returns event list with conflict detection. Read-only — does not create or modify events.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["read_today", "read_range"],
        description:
          "'read_today' for today+tomorrow; 'read_range' for a custom window.",
      },
      start_iso: {
        type: "string",
        format: "date-time",
        description:
          "read_range only: window start (ISO-8601 with offset).",
      },
      end_iso: {
        type: "string",
        format: "date-time",
        description:
          "read_range only: window end (ISO-8601 with offset, ≤ start + 14d).",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Invoke                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

const invoke: SubAgentInvoke = async (
  input: Record<string, unknown>,
  ctx: SubAgentInvokeContext,
): Promise<ContentBlock[]> => {
  const log = ctx.logger.child({
    component: "sub-agent.scheduler",
    tenant_id: ctx.tenantId,
    request_id: ctx.requestId,
  });

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "scheduler: invalid input from LLM");
    return [
      {
        type: "tool_result",
        tool_use_id: "", // runtime fills this in; harmless if empty
        content: `scheduler.invalid_input: ${parsed.error.message}`,
        is_error: true,
      },
    ];
  }
  const args = parsed.data;
  const jobName = ACTION_TO_JOB[args.action];

  log.info({ action: args.action, jobName }, "scheduler: enqueuing job");

  try {
    const content = await ctx.enqueueAndAwait({
      queueName: "scheduler",
      jobName,
      payload: args,
    });
    log.info({ blocks: content.length }, "scheduler: worker complete");
    return content;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, "scheduler: invocation failed");
    return [
      {
        type: "tool_result",
        tool_use_id: "",
        content: `scheduler.failed: ${message}`,
        is_error: true,
      },
    ];
  }
};

export const schedulerEntry: SubAgentEntry = {
  name: "scheduler",
  tool: schedulerTool,
  invoke,
};
