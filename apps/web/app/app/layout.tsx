/**
 * apps/web/app/app/layout.tsx
 *
 * Signed-in shell for /app/*. Enforces auth server-side, then wraps every
 * child route in the native AlterEgo chrome: the frosted sidebar (brand,
 * nav, account + cache-nuking sign-out) and the fiery blaze background,
 * both defined in ./app-shell.css.
 *
 * History: this used to render children raw while /app iframed the static
 * prototype (the iframe brought its own chrome, so a second shell produced
 * a double sidebar). Now that the app is native, the AppShell IS the design
 * — one sidebar, the real one.
 *
 * Owner: [Cluster C · App Shell]
 */
import { AppShell } from "@/components/app/AppShell";
import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

import "./app-shell.css";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const supabase = await createClient();
  const user = await requireAuth(supabase);

  return (
    <div className="app-shell">
      <AppShell userEmail={user.email ?? ""}>{children}</AppShell>
    </div>
  );
}
