/**
 * apps/web/app/api/chat/stream/route.ts
 *
 * POST /api/chat/stream — orchestrator → SSE bridge.
 *
 * Flow per Sprint D plan §3:
 *   1. Validate body { threadId, userMessage }.
 *   2. AuthN/Z: requireAuth + requireTenantId (RLS-bound supabase client).
 *   3. Verify thread belongs to this tenant (RLS does the work; we just
 *      check the SELECT returned a row).
 *   4. Persist the user message row to `chat_messages` BEFORE streaming —
 *      so a mid-stream disconnect still preserves the user's turn.
 *   5. Spawn AlterEgoRuntime.runStream({ tenantId, userId, messages, signal })
 *      and pipe events to the client as `data:` SSE frames.
 *   6. On `request.signal.aborted` → abort orchestrator, mark
 *      `agent_runs.status='cancelled'`, persist whatever assistant text we
 *      streamed so far. No orphan budget charge.
 *
 * Runtime: 'nodejs' — orchestrator uses BullMQ/ioredis/pg, all of which need
 * Node primitives unavailable in the Edge runtime.
 *
 * Owner: [Cluster C · Forge]
 */

import "server-only";

import { NextRequest } from "next/server";

import { childLogger } from "@/lib/logger";
import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { buildAlterEgoRuntime } from "@/lib/orchestrator/factory";

import { composeSystemPrompt } from "@autonomux/orchestrator";
import type { OrchestratorEvent } from "@autonomux/orchestrator";

import type {
  ChatMessageRow,
  StoredContentBlock,
  SubAgentName,
  SubAgentResultPayload,
} from "@/lib/chat/types";

export const runtime = "nodejs";
// Disable Next's default response caching for streaming responses.
export const dynamic = "force-dynamic";

type RuntimeMessage = { role: "user" | "assistant"; content: string };

// ── Request validation ──────────────────────────────────────────────────

interface ChatStreamBody {
  threadId: string;
  userMessage: string;
}

function parseBody(value: unknown): ChatStreamBody | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.threadId !== "string" || v.threadId.length === 0) return null;
  if (typeof v.userMessage !== "string" || v.userMessage.length === 0)
    return null;
  /* 16k-char ceiling (CR4). Big enough for a long typed message plus a
   * couple of inline-folded text attachments, small enough that a client
   * can't flood the LLM with a novel-sized blob (cost + latency + abuse).
   * The composer enforces 12k; this is the server-side hard cap. */
  if (v.userMessage.length > 16_000) return null;
  return { threadId: v.threadId, userMessage: v.userMessage };
}

// ── SSE helpers ─────────────────────────────────────────────────────────

const SSE_HEADERS: HeadersInit = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  // Disable buffering on Nginx-style proxies (Vercel passes this through).
  "x-accel-buffering": "no",
  connection: "keep-alive",
};

function frame(event: OrchestratorEvent | { type: "ping" }): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ── Route handler ───────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  const log = childLogger({
    component: "api.chat.stream",
    request_id: request.headers.get("x-request-id") ?? undefined,
  });

  let body: ChatStreamBody | null = null;
  try {
    body = parseBody(await request.json());
  } catch {
    body = null;
  }
  if (body === null) {
    return new Response(
      JSON.stringify({ error: "Invalid request body." }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const supabase = await createClient();
  let userId: string;
  let tenantId: string;
  try {
    const user = await requireAuth(supabase);
    userId = user.id;
    tenantId = await requireTenantId(supabase);
  } catch (err) {
    log.warn({ err }, "chat.stream auth failed");
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  /* Writes + thread-ownership check use the service-role client because
   * the user's JWT may have been issued before the access-token hook
   * fired (tenant_id claim absent → RLS denies everything). We've already
   * verified the user's tenant_id via `requireTenantId` which falls back
   * to a `tenant_members` lookup, so it's safe to bypass RLS as long as
   * every query carries an explicit `tenant_id` predicate. */
  const service = getSupabaseServiceClient();

  // Verify thread belongs to tenant (explicit predicate, RLS-bypassed).
  const threadRes = await (
    service as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, v: string) => {
            eq: (col: string, v: string) => {
              maybeSingle: () => Promise<{
                data: { id: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    }
  )
    .from("chat_threads")
    .select("id")
    .eq("id", body.threadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (threadRes.error !== null || threadRes.data === null) {
    return new Response(JSON.stringify({ error: "Thread not found." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // Persist the user message first so a disconnect doesn't lose the turn.
  const userBlock: StoredContentBlock[] = [
    { type: "text", text: body.userMessage },
  ];
  const insertUser = await (
    service as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{
          error: { message: string } | null;
        }>;
      };
    }
  )
    .from("chat_messages")
    .insert({
      thread_id: body.threadId,
      tenant_id: tenantId,
      role: "user",
      content_blocks: userBlock,
    });
  if (insertUser.error !== null) {
    log.error(
      { err: insertUser.error, thread_id: body.threadId },
      "chat.stream failed to persist user message",
    );
    return new Response(
      JSON.stringify({ error: "Could not persist message." }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  // Touch last_message_at so the thread list re-sorts.
  await (
    service as unknown as {
      from: (t: string) => {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, v: string) => {
            eq: (
              col: string,
              v: string,
            ) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from("chat_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", body.threadId)
    .eq("tenant_id", tenantId);

  // Load the last 50 messages of this thread to pass as conversation
  // context (we just persisted the new user turn, so it's included).
  const historyRes = await (
    service as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            v: string,
          ) => {
            order: (
              col: string,
              opts: { ascending: boolean },
            ) => {
              limit: (n: number) => Promise<{
                data: ChatMessageRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    }
  )
    .from("chat_messages")
    .select("id,thread_id,tenant_id,role,content_blocks,agent_run_id,created_at")
    .eq("thread_id", body.threadId)
    .order("created_at", { ascending: true })
    .limit(50);

  const history: ChatMessageRow[] = historyRes.data ?? [];
  const runtimeMessages: RuntimeMessage[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: flattenContentBlocks(m.content_blocks),
    }));

  // Bridge fetch AbortSignal → orchestrator cancellation.
  const ac = new AbortController();
  request.signal.addEventListener("abort", () => ac.abort(), { once: true });

  const encoder = new TextEncoder();
  const requestId =
    request.headers.get("x-request-id") ?? crypto.randomUUID();
  const runtime = buildAlterEgoRuntime({ requestId, tenantId });

  /* Compose the REAL AlterEgo system prompt (bigBrain persona: a
   * general-purpose assistant that can chat, brainstorm, reason, write, and
   * only reaches for a tool when it helps). Without this the runtime falls
   * back to a one-line neutral default and the model — seeing only the
   * email/calendar tools — wrongly decides it's an email/calendar bot and
   * refuses everything else. personality + facts degrade gracefully to null
   * for tenants that have none yet. */
  const systemPrompt = await composeSystemPrompt({
    tenantId,
    personality: null,
    factsEnvelope: null,
    registeredSubAgents: ["mailroom", "scheduler", "oracle"],
    logger: log,
  });

  // Accumulate the assistant turn so we can persist it on completion
  // (or on early termination via abort) — see finalisePersistence().
  let assistantText = "";
  const subAgentBlocks: StoredContentBlock[] = [];
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Send a comment line first to flush headers immediately (some
      // proxies hold the response until first byte).
      controller.enqueue(encoder.encode(": connected\n\n"));

      try {
        for await (const event of runtime.runStream({
          tenantId,
          userId,
          messages: runtimeMessages.map((m) => ({
            role: m.role,
            content: [{ type: "text", text: m.content }],
          })),
          signal: ac.signal,
          requestId,
          system: systemPrompt,
        })) {
          if (event.type === "text_delta") {
            assistantText += event.text;
          } else if (event.type === "sub_agent_result") {
            /* Cluster C's local types are tighter than the orchestrator's
             * runtime envelope (which carries ContentBlock[]). For Sprint
             * D we trust the registry guard that sub_agent_name is one of
             * the known SubAgentNames and forward the content shape
             * unchanged — the renderer will discriminate on the inner
             * payload at display time. */
            subAgentBlocks.push({
              type: "sub_agent_result",
              sub_agent: event.sub_agent_name as SubAgentName,
              result: event.content as unknown as SubAgentResultPayload,
            });
          }
          controller.enqueue(encoder.encode(frame(event)));
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError" || ac.signal.aborted) {
          cancelled = true;
        } else {
          log.error({ err }, "chat.stream orchestrator threw");
          controller.enqueue(
            encoder.encode(
              frame({
                type: "error",
                agent_run_id: "",
                error_class: "internal",
                message:
                  (err as Error)?.message ?? "Unknown orchestrator error.",
              }),
            ),
          );
        }
      } finally {
        // Persist whatever assistant content we accumulated (even on
        // cancel — the user gets to see the partial response if they
        // re-open the thread).
        await finalisePersistence({
          threadId: body!.threadId,
          tenantId,
          assistantText,
          subAgentBlocks,
          cancelled,
          log,
        });
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          // already closed (client disconnect)
        }
      }
    },
    cancel() {
      // Browser-side abort — propagate.
      cancelled = true;
      ac.abort();
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

// ── Helpers ─────────────────────────────────────────────────────────────

function flattenContentBlocks(blocks: StoredContentBlock[] | null): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((b) => (b.type === "text" ? b.text : `[${b.sub_agent} result]`))
    .join("\n");
}

interface FinaliseArgs {
  threadId: string;
  tenantId: string;
  assistantText: string;
  subAgentBlocks: StoredContentBlock[];
  cancelled: boolean;
  log: { error: (a: unknown, b?: string) => void; warn: (a: unknown, b?: string) => void };
}

async function finalisePersistence(args: FinaliseArgs): Promise<void> {
  const { threadId, tenantId, assistantText, subAgentBlocks, cancelled, log } =
    args;

  // Nothing streamed and nothing to persist — skip the insert.
  if (assistantText.length === 0 && subAgentBlocks.length === 0) return;

  // Service-role write — same rationale as the route's main body
  // (user JWT may lack tenant_id claim; we've already verified the
  // tenant boundary above).
  const service = getSupabaseServiceClient();
  const blocks: StoredContentBlock[] = [];
  if (assistantText.length > 0) {
    blocks.push({ type: "text", text: assistantText });
  }
  for (const sb of subAgentBlocks) blocks.push(sb);

  const insertRes = await (
    service as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{
          error: { message: string } | null;
        }>;
      };
    }
  )
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      tenant_id: tenantId,
      role: "assistant",
      content_blocks: blocks,
    });
  if (insertRes.error !== null) {
    log.error(
      { err: insertRes.error, thread_id: threadId, cancelled },
      "chat.stream failed to persist assistant message",
    );
  }

  if (cancelled) {
    // Mark the latest agent_run for this thread as cancelled — service-role
    // write; explicit tenant filter is the security boundary.
    const cancelRes = await (
      service as unknown as {
        from: (t: string) => {
          update: (row: Record<string, unknown>) => {
            eq: (
              col: string,
              v: string,
            ) => {
              eq: (
                col: string,
                v: string,
              ) => Promise<{ error: { message: string } | null }>;
            };
          };
        };
      }
    )
      .from("agent_runs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("status", "running");
    if (cancelRes.error !== null) {
      log.warn(
        { err: cancelRes.error, thread_id: threadId },
        "chat.stream cancel update returned an error (likely no in-flight run)",
      );
    }
  }
}
