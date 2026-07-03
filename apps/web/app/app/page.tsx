/**
 * apps/web/app/app/page.tsx
 *
 * /app — the signed-in surface. Renders the Claude Design AlterEgo prototype
 * full-viewport. This IS the product UI: the design is the prototype, and its
 * chat is wired to the real orchestrator (alterego/app.jsx streams from
 * POST /api/chat/stream via a real thread from POST /api/chat/thread).
 *
 * Auth is enforced server-side (requireAuth) before the design is served.
 * No app-shell chrome wraps it — the prototype brings its own (single) sidebar.
 *
 * Owner: [Arch + Forge]
 */
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export default async function AppHomePage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  await requireAuth(supabase);

  return (
    <iframe
      src="/prototypes/autonomux/AlterEgo.html"
      title="AlterEgo"
      allow="microphone"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        // 100dvh (dynamic viewport height), not 100vh: on mobile Safari 100vh
        // is the LARGE viewport (behind the URL bar), which pushed the chat
        // composer off the bottom of the screen. dvh tracks the visible area.
        height: "100dvh",
        border: "none",
        zIndex: 50,
      }}
    />
  );
}
