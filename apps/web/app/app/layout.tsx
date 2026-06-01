/**
 * apps/web/app/app/layout.tsx
 *
 * Shell for every signed-in route. Two responsibilities:
 *
 *   1. Paint the fiery red→orange app wash that signals "you're inside
 *      the app." Marketing surfaces stay neutral; once a user crosses
 *      into /app/* the brand temperature jumps to match the logo.
 *
 *   2. Mount the primary nav chrome — collapsible sidebar + topbar +
 *      mobile drawer — via `<AppShell>`. Every page underneath this
 *      layout renders inside that chrome's main pane. Pages that need
 *      a secondary contextual rail (e.g. /app/chat with its ThreadList)
 *      add their own layout INSIDE the main pane.
 *
 * The user email comes from a single server-side fetch here so the
 * sidebar doesn't need its own round trip. If auth resolution throws
 * we let middleware redirect to /sign-in.
 *
 * Owner: [Cluster C · App Shell]
 */
import "./app-shell.css";

import { AppShell } from "@/components/app/AppShell";
import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const supabase = await createClient();
  const user = await requireAuth(supabase);
  const email = user.email ?? "";

  return (
    <div className="app-shell">
      <AppShell userEmail={email}>{children}</AppShell>
    </div>
  );
}
