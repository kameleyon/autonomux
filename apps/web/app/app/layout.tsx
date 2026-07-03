/**
 * apps/web/app/app/layout.tsx
 *
 * Signed-in shell for /app/*. Only job: enforce auth server-side, then render
 * children raw. The Claude Design prototype rendered by /app brings its own
 * full sidebar, topbar, and background — no app-shell chrome is wrapped here
 * (that generic shell is intentionally NOT used).
 *
 * Owner: [Cluster C · App Shell]
 */
import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const supabase = await createClient();
  await requireAuth(supabase);

  return <>{children}</>;
}
