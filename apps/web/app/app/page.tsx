/**
 * apps/web/app/app/page.tsx
 *
 * /app home. The signed-in landing IS the AlterEgo chat, so this route
 * sends the user straight to the native chat surface (/app/chat), which
 * resolves to their most-recent thread or the skill-chip empty state.
 *
 * This replaces the old full-viewport iframe of the static AlterEgo.html
 * prototype — the chat is now native React wired to the orchestrator SSE
 * runtime (see components/chat/ChatStream.tsx).
 *
 * Owner: [Arch + Forge]
 */
import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppHomePage(): Promise<never> {
  const supabase = await createClient();
  await requireAuth(supabase);
  redirect("/app/chat");
}
