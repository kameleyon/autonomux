/**
 * apps/web/lib/orchestrator/factory.ts
 *
 * Build a fully-wired AlterEgoRuntime for an HTTP request.
 *
 * Composes:
 *   - LLM client (OpenRouter adapter via @autonomux/llm)
 *   - SubAgentRegistry with all currently-wired sub-agents
 *   - IORedis connection (shared agent-bus across web + worker)
 *   - Per-request child logger
 *
 * The factory is request-scoped: the Redis connection is opened on
 * first call inside the process and cached on globalThis. Next.js
 * lambda containers reuse the connection across warm invocations.
 *
 * Owner: [Forge · Sprint D integration]
 */
import "server-only";

import { Redis } from "ioredis";

import { createLlmClient } from "@autonomux/llm";
import {
  createAlterEgo,
  mailroomEntry,
  schedulerEntry,
  SubAgentRegistry,
  type AlterEgoRuntime,
} from "@autonomux/orchestrator";

import { childLogger } from "@/lib/logger";

interface CachedRedis {
  client: Redis | null;
}

const REDIS_GLOBAL_KEY = "__autonomux_web_orchestrator_redis__";

function getRedis(): Redis {
  const g = globalThis as unknown as Record<string, CachedRedis>;
  const slot = g[REDIS_GLOBAL_KEY] ?? { client: null };
  if (slot.client !== null) return slot.client;

  const redisUrl = process.env["REDIS_URL"] ?? process.env["KV_URL"];
  if (redisUrl === undefined || redisUrl.length === 0) {
    throw new Error(
      "[orchestrator/factory] REDIS_URL (or KV_URL) is required to build the agent bus.",
    );
  }
  const client = new Redis(redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
  });
  slot.client = client;
  g[REDIS_GLOBAL_KEY] = slot;
  return client;
}

export interface BuildRuntimeOpts {
  readonly requestId: string;
  readonly tenantId: string;
}

export function buildAlterEgoRuntime(opts: BuildRuntimeOpts): AlterEgoRuntime {
  const logger = childLogger({
    component: "orchestrator",
    request_id: opts.requestId,
    tenant_id: opts.tenantId,
  });

  const llm = createLlmClient({
    provider:
      (process.env["LLM_PROVIDER"] as "openrouter" | "anthropic" | undefined) ??
      "openrouter",
  });

  /* Register every sub-agent that's actually wired in apps/worker. New
   * sub-agents are appended here as their worker handlers land. */
  const registry = new SubAgentRegistry();
  registry.register(mailroomEntry);
  registry.register(schedulerEntry);

  return createAlterEgo({
    llm,
    registry,
    redis: getRedis(),
    logger,
  });
}
