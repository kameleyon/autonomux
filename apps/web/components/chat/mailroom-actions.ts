/**
 * apps/web/components/chat/mailroom-actions.ts
 *
 * Server Action stub for the SubAgentCard's Approve/Dismiss buttons.
 *
 * TODO(sprint-mailroom-apply): replace with the real `applyMailroomAction`
 * that enqueues a `mailroom.apply` BullMQ job (archive / draft / label).
 * For now this just logs the user's intent so we don't ship a button that
 * silently no-ops at runtime — once Cluster A's `agent_runs` + Cluster B's
 * `mailroom.apply` queue land, this file becomes a 3-line wrapper around
 * `boss.enqueue('mailroom.apply', { ... })`.
 *
 * The button labels stay accurate: "Approve" records that the user agreed
 * to the proposed action; the write itself is deferred to that follow-up
 * sprint. Until then no Gmail mutation occurs from this surface.
 *
 * Owner: [Cluster C · Forge]
 */

"use server";

import "server-only";

import { childLogger } from "@/lib/logger";
import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export async function noopMailroomAction(formData: FormData): Promise<void> {
  const log = childLogger({ component: "chat.action.mailroom.noop" });

  const invocationId = formData.get("invocation_id");
  const messageId = formData.get("message_id");
  const decision = formData.get("decision");

  const supabase = await createClient();
  let userId: string | null = null;
  let tenantId: string | null = null;
  try {
    const user = await requireAuth(supabase);
    userId = user.id;
    tenantId = await requireTenantId(supabase);
  } catch {
    // Don't surface — UI button is already gated by middleware on /app/*.
  }

  log.info(
    {
      user_id: userId,
      tenant_id: tenantId,
      invocation_id: invocationId,
      message_id: messageId,
      decision,
      todo: "sprint-mailroom-apply",
    },
    "noopMailroomAction: recorded intent (write side ships in a later sprint)",
  );
}
