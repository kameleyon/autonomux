/**
 * apps/worker/src/lib/mailroom-engine.ts
 *
 * Pure-ish logic for one Mailroom triage pass.
 *
 * Flow:
 *   1. Caller hands us tenantId + a list of normalized messages pulled
 *      from gmail-client (subject + sender + snippet + first-N-bytes body).
 *   2. We load `mailroom_rules` for the tenant and evaluate each rule's
 *      `when` clause server-side. A match short-circuits the LLM call —
 *      the rule's action becomes the proposed_action with importance 0
 *      (informational) or 1 (escalate / draft / label).
 *   3. Whatever survives the rule pass goes into ONE Haiku call for ranking
 *      + classification. PHI redaction is applied to the per-message
 *      `snippet` and `bodyExcerpt` fields BEFORE they enter the LLM
 *      payload; PHI incidents are returned alongside the ranking output so
 *      the worker can write the `activity_log` row.
 *   4. Returned rows match the exact shape the chat SubAgentCard expects.
 *
 * "Pure-ish" — this module owns the LLM call but receives the LLM client
 * via DI so tests can stub it. It also receives the rules via DI so DB
 * reads happen once at the worker layer.
 *
 * Owner: [Forge + Comply]
 */

import type { LlmClient } from "@autonomux/llm";
import type { MailroomRuleDsl, Tables } from "@autonomux/db";
import type { Logger } from "pino";

import { redactForLlm } from "./phi-redactor.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MailroomAction = "reply" | "archive" | "snooze" | "keep_inbox";

export interface MailroomInputMessage {
  /** Gmail message id. */
  readonly id: string;
  /** Gmail thread id, for the cache table. */
  readonly threadId: string;
  readonly sender: string;
  readonly subject: string;
  /** Gmail's snippet (≤200 chars) — already short. */
  readonly snippet: string;
  /** Up to ~2kB of body text. May be empty. */
  readonly bodyExcerpt: string;
  /** ISO-8601 message receive time. */
  readonly receivedAt: string;
  readonly labelIds: readonly string[];
  readonly hasAttachment: boolean;
}

export interface MailroomRankedMessage {
  readonly id: string;
  readonly threadId: string;
  readonly sender: string;
  readonly subject: string;
  readonly snippet: string;
  readonly receivedAt: string;
  readonly importance: 0 | 1 | 2 | 3 | 4 | 5;
  readonly proposedAction: MailroomAction;
  readonly reason: string;
  /** True when a `mailroom_rules` row matched and the LLM was skipped. */
  readonly matchedRuleId: string | null;
}

export interface MailroomTriageResult {
  readonly ranked: readonly MailroomRankedMessage[];
  /** Total PHI incidents redacted across the LLM-bound batch. */
  readonly phiIncidents: number;
  /** Number of messages handled purely by rule eval (no LLM cost). */
  readonly ruleHandledCount: number;
  /** Number of messages sent to the LLM. */
  readonly llmHandledCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Haiku per PRD §4.2 cost rule. */
export const MAILROOM_LLM_MODEL = "haiku-4.5" as const;

/** OpenRouter-canonical model name used in observability (sub_agent_runs.output, etc.). */
export const MAILROOM_LLM_MODEL_CANONICAL = "anthropic/claude-haiku-4.5" as const;

const ALLOWED_ACTIONS: readonly MailroomAction[] = [
  "reply",
  "archive",
  "snooze",
  "keep_inbox",
];

const ACTION_TO_RULE: Record<
  MailroomRuleDsl["then"]["action"],
  MailroomAction
> = {
  delete: "archive",
  draft: "reply",
  snooze: "snooze",
  label: "keep_inbox",
  escalate: "keep_inbox",
};

// ---------------------------------------------------------------------------
// Rule evaluation (server-side, no LLM)
// ---------------------------------------------------------------------------

function ruleMatches(
  msg: MailroomInputMessage,
  rule: Tables<"mailroom_rules">,
): boolean {
  const when = rule.rule_dsl.when;
  if (when.sender !== undefined && when.sender.trim() !== "") {
    if (msg.sender.toLowerCase() !== when.sender.trim().toLowerCase()) {
      return false;
    }
  }
  if (when.subject_contains !== undefined && when.subject_contains.trim() !== "") {
    if (
      !msg.subject
        .toLowerCase()
        .includes(when.subject_contains.trim().toLowerCase())
    ) {
      return false;
    }
  }
  if (when.label !== undefined && when.label.trim() !== "") {
    if (!msg.labelIds.includes(when.label.trim())) {
      return false;
    }
  }
  if (when.has_attachment !== undefined) {
    if (msg.hasAttachment !== when.has_attachment) return false;
  }
  return true;
}

function applyRule(
  msg: MailroomInputMessage,
  rule: Tables<"mailroom_rules">,
): MailroomRankedMessage {
  // ACTION_TO_RULE is keyed by the SQL enum; the schema constraint guarantees
  // the value is one of those keys, but noUncheckedIndexedAccess makes the
  // lookup `| undefined`. Default to keep_inbox for forward-compat with any
  // future rule action we haven't mapped yet.
  const action: MailroomAction =
    ACTION_TO_RULE[rule.rule_dsl.then.action] ?? "keep_inbox";
  // Escalate is treated as "keep_inbox" with high importance so the chat
  // surface still shows it; the orchestrator routes the escalation.
  const importance: MailroomRankedMessage["importance"] =
    rule.rule_dsl.then.action === "escalate" ? 4 : 0;
  return {
    id: msg.id,
    threadId: msg.threadId,
    sender: msg.sender,
    subject: msg.subject,
    snippet: msg.snippet,
    receivedAt: msg.receivedAt,
    importance,
    proposedAction: action,
    reason: `rule:${rule.name}`,
    matchedRuleId: rule.id,
  };
}

// ---------------------------------------------------------------------------
// LLM ranking
// ---------------------------------------------------------------------------

interface LlmRankedRaw {
  id: string;
  importance: number;
  proposed_action: string;
  reason: string;
}

interface LlmBatchOut {
  results: LlmRankedRaw[];
}

const RANKING_SYSTEM_PROMPT = `You are the Mailroom sub-agent for an AlterEgo personal assistant.
Your single job: rank each email by importance to the user (0=junk, 5=must-read)
and propose ONE action from: reply, archive, snooze, keep_inbox.

Rules:
- "reply" only when the email needs a personal response from the user.
- "archive" for clear marketing, newsletters, automated notifications.
- "snooze" for items needing action later (e.g. event reminders).
- "keep_inbox" for ambiguous-but-important items the user should glance at.

Be terse. Output JSON ONLY, no prose, no markdown fences. Schema:
{"results":[{"id":"<gmail-id>","importance":0..5,"proposed_action":"reply|archive|snooze|keep_inbox","reason":"<<=90 chars>"}]}

Never invent ids. Echo back exactly the ids you were given.
Never include the email body or PHI in your reason.`;

interface LlmBatchInputItem {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  bodyExcerpt: string;
  receivedAt: string;
  hasAttachment: boolean;
}

function buildLlmUserMessage(items: readonly LlmBatchInputItem[]): string {
  // Compact JSON keeps token cost low; the system prompt locks the
  // output schema.
  return JSON.stringify({ to_rank: items });
}

function clampImportance(n: number): MailroomRankedMessage["importance"] {
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.max(0, Math.min(5, Math.round(n)));
  return rounded as MailroomRankedMessage["importance"];
}

function normalizeAction(s: string): MailroomAction {
  const candidate = s.trim().toLowerCase();
  if ((ALLOWED_ACTIONS as readonly string[]).includes(candidate)) {
    return candidate as MailroomAction;
  }
  return "keep_inbox";
}

function extractTextFromContent(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const parts: string[] = [];
  for (const b of blocks) {
    if (
      b !== null &&
      typeof b === "object" &&
      (b as { type?: string }).type === "text" &&
      typeof (b as { text?: string }).text === "string"
    ) {
      parts.push((b as { text: string }).text);
    }
  }
  return parts.join("\n").trim();
}

function tryParseLlmBatch(raw: string): LlmBatchOut | null {
  // The model is instructed to return JSON only, but tolerate a fenced
  // ```json ... ``` block defensively.
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { results?: unknown }).results)
    ) {
      return parsed as LlmBatchOut;
    }
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export interface TriageDeps {
  readonly logger: Logger;
  readonly llm: LlmClient;
}

export interface TriageArgs {
  readonly tenantId: string;
  readonly messages: readonly MailroomInputMessage[];
  readonly rules: readonly Tables<"mailroom_rules">[];
}

/**
 * Run one triage pass. Pure with respect to the world except for the LLM
 * call (which is deps-injected so tests can stub it).
 *
 * Caller (mailroom worker) writes:
 *   - `sub_agent_runs` row
 *   - `mailroom_messages` cache rows
 *   - `activity_log` row when phiIncidents > 0
 *
 * We do NOT do any of that here.
 */
export async function triageInbox(
  deps: TriageDeps,
  args: TriageArgs,
): Promise<MailroomTriageResult> {
  const { logger, llm } = deps;
  const log = logger.child({ component: "mailroom-engine", tenantId: args.tenantId });

  // 1. Rule pass — sorted by priority asc (lower = earlier match wins).
  const sortedRules = [...args.rules]
    .filter((r) => r.active)
    .sort((a, b) => a.priority - b.priority);

  const ruleRanked: MailroomRankedMessage[] = [];
  const remaining: MailroomInputMessage[] = [];

  for (const msg of args.messages) {
    let matched: Tables<"mailroom_rules"> | null = null;
    for (const r of sortedRules) {
      if (ruleMatches(msg, r)) {
        matched = r;
        break;
      }
    }
    if (matched !== null) {
      ruleRanked.push(applyRule(msg, matched));
    } else {
      remaining.push(msg);
    }
  }

  if (remaining.length === 0) {
    return {
      ranked: ruleRanked,
      phiIncidents: 0,
      ruleHandledCount: ruleRanked.length,
      llmHandledCount: 0,
    };
  }

  // 2. PHI redaction — sweep snippet + bodyExcerpt of every LLM-bound item.
  let phiIncidents = 0;
  const llmBatch: LlmBatchInputItem[] = remaining.map((m) => {
    const snip = redactForLlm(m.snippet);
    const body = redactForLlm(m.bodyExcerpt);
    phiIncidents += snip.incidents + body.incidents;
    return {
      id: m.id,
      sender: m.sender,
      subject: m.subject,
      snippet: snip.redacted,
      bodyExcerpt: body.redacted,
      receivedAt: m.receivedAt,
      hasAttachment: m.hasAttachment,
    };
  });

  // 3. LLM call — single batched ranking.
  log.info(
    {
      ruleHandled: ruleRanked.length,
      llmHandled: llmBatch.length,
      phiIncidents,
    },
    "mailroom triage: invoking llm",
  );

  let llmResults: LlmBatchOut | null = null;
  try {
    const response = await llm.complete({
      model: MAILROOM_LLM_MODEL,
      system: RANKING_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildLlmUserMessage(llmBatch),
        },
      ],
      max_tokens: 2_048,
      temperature: 0,
    });
    const raw = extractTextFromContent(response.content);
    llmResults = tryParseLlmBatch(raw);
    if (llmResults === null) {
      log.warn(
        { raw_sample: raw.slice(0, 200) },
        "mailroom llm output failed to parse — falling back to keep_inbox defaults",
      );
    }
  } catch (err) {
    log.error({ err }, "mailroom llm call failed — using keep_inbox defaults");
  }

  // 4. Merge LLM results back into the input order. Any id the LLM dropped
  //    gets a safe keep_inbox default so we never lose a message from the
  //    user's view.
  const llmById = new Map<string, LlmRankedRaw>();
  for (const r of llmResults?.results ?? []) {
    if (typeof r.id === "string") llmById.set(r.id, r);
  }

  const llmRanked: MailroomRankedMessage[] = remaining.map((m) => {
    const hit = llmById.get(m.id);
    if (hit === undefined) {
      return {
        id: m.id,
        threadId: m.threadId,
        sender: m.sender,
        subject: m.subject,
        snippet: m.snippet,
        receivedAt: m.receivedAt,
        importance: 2,
        proposedAction: "keep_inbox",
        reason: "llm did not return a ranking; default keep_inbox",
        matchedRuleId: null,
      };
    }
    return {
      id: m.id,
      threadId: m.threadId,
      sender: m.sender,
      subject: m.subject,
      snippet: m.snippet,
      receivedAt: m.receivedAt,
      importance: clampImportance(hit.importance),
      proposedAction: normalizeAction(hit.proposed_action),
      reason:
        typeof hit.reason === "string" && hit.reason.length > 0
          ? hit.reason.slice(0, 200)
          : "",
      matchedRuleId: null,
    };
  });

  return {
    ranked: [...ruleRanked, ...llmRanked],
    phiIncidents,
    ruleHandledCount: ruleRanked.length,
    llmHandledCount: llmRanked.length,
  };
}
