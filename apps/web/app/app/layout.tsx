/**
 * apps/web/app/app/layout.tsx
 *
 * Signed-in shell for /app/*. Only job now: enforce auth server-side.
 *
 * The old AppShell (its Home/Chat/Integrations/Settings sidebar) and the
 * red→orange background wash have been REMOVED. The AlterEgo template
 * rendered by the /app home brings its own full sidebar, navigation, and
 * background — wrapping it in a second shell produced the double-sidebar
 * you did not want. This layout now renders children raw, full-bleed.
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
