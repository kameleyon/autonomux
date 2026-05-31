/**
 * @autonomux/orchestrator — Mailroom sub-agent tool wrapper.
 *
 * Exposes Mailroom as a single tool the LLM can call:
 *   - `mailroom` with `{ action: "triage" | "summarize_thread" | "list_rules", … }`
 *
 * The actual work runs in `apps/worker/src/workers/mailroom.ts` (Cluster B).
 * This file is the orchestrator-side stub that:
 *   1. Validates the LLM-provided input against a zod schema.
 *   2. Maps `action` → BullMQ job name.
 *   3. Enqueues the job via the context's `enqueueAndAwait` helper.
 *   4. Returns the worker's result blocks verbatim — never re-wraps them.
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

const triageSchema = z.object({
  action: z.literal("triage"),
  max_messages: z.number().int().min(1).max(100).optional(),
  since_iso: z.string().datetime({ offset: true }).optional(),
});
const summarizeSchema = z.object({
  action: z.literal("summarize_thread"),
  thread_id: z.string().min(1),
});
const listRulesSchema = z.object({
  action: z.literal("list_rules"),
});
const inputSchema = z.discriminatedUnion("action", [
  triageSchema,
  summarizeSchema,
  listRulesSchema,
]);

/** Map LLM action → BullMQ job name. Mirrors `apps/worker/src/workers/mailroom.ts`. */
const ACTION_TO_JOB: Record<z.infer<typeof inputSchema>["action"], string> = {
  triage: "mailroom.triage",
  summarize_thread: "mailroom.summarize_thread",
  list_rules: "mailroom.list_rules",
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Tool schema (Anthropic-shaped)                                             */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Anthropic-style `Tool` shape consumed by `@autonomux/llm`. The schema
 * is intentionally narrow — three actions, no free-form input — so the
 * LLM cannot conjure dangerous parameter combinations.
 */
export const mailroomTool: Tool = {
  name: "mailroom",
  description:
    "Triage the user's Gmail inbox, summarize a thread, or list active mailroom rules. Use 'triage' when the user asks to review or sort their email; use 'summarize_thread' for a specific thread the user references; use 'list_rules' when the user asks what mail rules are active.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["triage", "summarize_thread", "list_rules"],
        description:
          "What to do. 'triage' = rank inbox; 'summarize_thread' = summarize one thread; 'list_rules' = show active rules.",
      },
      max_messages: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description: "Triage only: cap on messages to consider. Default 25.",
      },
      since_iso: {
        type: "string",
        format: "date-time",
        description: "Triage only: only messages received after this ISO-8601 timestamp.",
      },
      thread_id: {
        type: "string",
        description: "summarize_thread only: the Gmail thread id.",
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
    component: "sub-agent.mailroom",
    tenant_id: ctx.tenantId,
    request_id: ctx.requestId,
  });

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "mailroom: invalid input from LLM");
    return [
      {
        type: "tool_result",
        tool_use_id: "", // runtime fills this in; harmless if empty
        content: `mailroom.invalid_input: ${parsed.error.message}`,
        is_error: true,
      },
    ];
  }
  const args = parsed.data;
  const jobName = ACTION_TO_JOB[args.action];

  log.info({ action: args.action, jobName }, "mailroom: enqueuing job");

  try {
    const content = await ctx.enqueueAndAwait({
      queueName: "mailroom",
      jobName,
      payload: args,
    });
    log.info({ blocks: content.length }, "mailroom: worker complete");
    return content;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, "mailroom: invocation failed");
    return [
      {
        type: "tool_result",
        tool_use_id: "",
        content: `mailroom.failed: ${message}`,
        is_error: true,
      },
    ];
  }
};

export const mailroomEntry: SubAgentEntry = {
  name: "mailroom",
  tool: mailroomTool,
  invoke,
};
