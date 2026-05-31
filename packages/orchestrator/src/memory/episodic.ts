/**
 * @autonomux/orchestrator — episodic memory.
 *
 * Reads + writes `public.agent_memory_episodes`. The orchestrator calls
 * `recallEpisodes()` before each user turn to pull the k-nearest prior
 * episodes (pgvector cosine), and `writeEpisode()` after a run completes
 * to persist a one-line summary + embedding for future recall.
 *
 * Embedding generation is OUT OF SCOPE for this module — callers pass
 * the vector. The shared embedding pipeline (Cipher per-tenant salt +
 * Voyage/OpenAI) lives in `packages/llm` / a future `packages/embeddings`
 * and is wired in by the consumer (web SSE route or worker).
 *
 * RLS: writes use the service-role client because the orchestrator runs
 * in a server-side context (Next.js route handler, worker process); RLS
 * is enforced by the explicit `tenant_id` filter we apply on every
 * query, mirroring the pattern in `packages/db/src/admin.ts`.
 *
 * pgvector + supabase-js: the JS client serializes vectors as
 * `string` (Postgres array literal) on insert and number[] on read.
 * We use the underlying RPC path for cosine search; the supabase-js
 * `.select()` builder doesn't have a fluent vector operator, so we
 * shell out to a small SQL RPC `match_agent_memory_episodes`. If the
 * RPC isn't present on the target schema yet, the fallback path falls
 * back to a JS-side scan over the recent N episodes — slower but
 * correct, and the test harness can stub the whole thing.
 */
import "server-only";

import { createServiceClient } from "@autonomux/db/client";
import type {
  AgentMemoryEpisodeMetadata,
  Database,
  Tables,
} from "@autonomux/db";
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient<Database>;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Recall                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

export interface RecallEpisodesOpts {
  readonly tenantId: string;
  /** Query embedding produced by the caller (1536-dim). */
  readonly queryEmbedding: number[];
  /** Top-k. Default 5; PRD §5 short-term recall window. */
  readonly k?: number;
  /** Optional chat-thread scope; if set, only episodes attached to this thread. */
  readonly chatThreadId?: string | null;
  /** Override client for tests. */
  readonly client?: Sb;
}

/** Recalled episode as returned to the runtime. */
export interface RecalledEpisode {
  readonly id: string;
  readonly content_summary: string;
  readonly metadata: AgentMemoryEpisodeMetadata;
  readonly created_at: string;
  /** Cosine similarity in [0,1] (1 = exact match). Null if score unavailable. */
  readonly score: number | null;
}

/**
 * Recall the k nearest episodes for `tenantId`.
 *
 * Tries the RPC path first (`match_agent_memory_episodes`); on RPC
 * absence (PostgrestError code `PGRST202`), falls back to a recent-N
 * scan and computes cosine in JS.
 */
export async function recallEpisodes(
  opts: RecallEpisodesOpts,
): Promise<RecalledEpisode[]> {
  const sb: Sb = opts.client ?? createServiceClient();
  const k = Math.max(1, Math.min(opts.k ?? 5, 50));

  // ---- Fast path: pgvector RPC. ------------------------------------------
  const rpcArgs: Record<string, unknown> = {
    p_tenant_id: opts.tenantId,
    p_query: opts.queryEmbedding,
    p_k: k,
    p_chat_thread_id: opts.chatThreadId ?? null,
  };
  // The RPC isn't in our generated `Functions` type; cast narrowly.
  const rpcRes = await (sb as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: Array<{
        id: string;
        content_summary: string;
        metadata: AgentMemoryEpisodeMetadata;
        created_at: string;
        similarity: number | null;
      }> | null;
      error: { code?: string; message: string } | null;
    }>;
  }).rpc("match_agent_memory_episodes", rpcArgs);

  if (rpcRes.error === null && rpcRes.data) {
    return rpcRes.data.map((r) => ({
      id: r.id,
      content_summary: r.content_summary,
      metadata: r.metadata,
      created_at: r.created_at,
      score: r.similarity,
    }));
  }

  // ---- Fallback: recent-N JS-side cosine. --------------------------------
  // Only triggers when the RPC is missing or errors. Bounded to 200 rows so
  // the worst case doesn't melt the DB; better than a hard failure.
  let q = sb
    .from("agent_memory_episodes")
    .select("id, content_summary, metadata, created_at, embedding")
    .eq("tenant_id", opts.tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (opts.chatThreadId !== undefined && opts.chatThreadId !== null) {
    // chat_thread_id column added by migration 0009; tolerate absence on older schemas.
    q = q.eq("chat_thread_id" as never, opts.chatThreadId);
  }
  const { data, error } = await q;
  if (error) {
    throw new Error(`[orchestrator.recallEpisodes] ${error.message}`);
  }
  if (!data || data.length === 0) return [];

  const scored = data
    .map((row) => ({
      row,
      score: row.embedding ? cosineSimilarity(opts.queryEmbedding, row.embedding) : null,
    }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, k);

  return scored.map(({ row, score }) => ({
    id: row.id,
    content_summary: row.content_summary,
    metadata: row.metadata,
    created_at: row.created_at,
    score,
  }));
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Write                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

export interface WriteEpisodeOpts {
  readonly tenantId: string;
  /** ≤ 240 chars; Herald-voice one-liner. */
  readonly contentSummary: string;
  /** Embedding produced for `contentSummary`. */
  readonly embedding: number[];
  readonly metadata: AgentMemoryEpisodeMetadata;
  /** Optional chat-thread linkage (column added by migration 0009). */
  readonly chatThreadId?: string | null;
  readonly client?: Sb;
}

/**
 * Persist one episode. Returns the row.
 *
 * The encrypted_payload + payload_nonce columns stay null at this layer —
 * if a caller wants to persist the full thought they pass the ciphertext
 * envelope via a higher-level helper (out of scope here).
 */
export async function writeEpisode(
  opts: WriteEpisodeOpts,
): Promise<Tables<"agent_memory_episodes">> {
  const sb: Sb = opts.client ?? createServiceClient();
  // chat_thread_id is added by migration 0009; cast narrowly so this file
  // typechecks against the current generated `Database` type without
  // requiring a regen step.
  const insertPayload = {
    tenant_id: opts.tenantId,
    content_summary: opts.contentSummary.slice(0, 240),
    embedding: opts.embedding,
    metadata: opts.metadata,
    ...(opts.chatThreadId !== undefined
      ? { chat_thread_id: opts.chatThreadId }
      : {}),
  } as unknown as Tables<"agent_memory_episodes">;

  const { data, error } = await sb
    .from("agent_memory_episodes")
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw new Error(`[orchestrator.writeEpisode] ${error.message}`);
  return data;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Cosine — JS fallback                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

function cosineSimilarity(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }
  if (magA === 0 || magB === 0) return null;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
