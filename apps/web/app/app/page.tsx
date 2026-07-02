/**
 * apps/web/app/app/page.tsx
 *
 * /app landing — the post-sign-in surface.
 *
 * Bridge: renders the imported AlterEgo prototype (public/prototypes/autonomux/
 * AlterEgo.html) full-viewport inside the authenticated app so signing in lands
 * on the real AlterEgo design — the "Talk to your AlterEgo" home, sub-agent
 * skill cards, Autoroom, Notifications, Archive. Auth is still enforced
 * server-side (requireAuth) before the prototype is served.
 *
 * This is a deliberate bridge over the working prototype. The native React
 * port (real components wired to Supabase + the finance agent) replaces this
 * iframe surface as those screens are built.
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
        height: "100vh",
        border: "none",
        zIndex: 50,
      }}
    />
  );
}
