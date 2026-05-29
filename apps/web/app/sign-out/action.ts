"use server";

/**
 * apps/web/app/sign-out/action.ts
 *
 * Sign-out Server Action. Clears the Supabase session cookies + audit-logs
 * `session.end` + redirects to /.
 *
 * Owner: [Forge + Shield]
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { logAuditEvent } from "@autonomux/db/audit";
import { tryExtractJwtClaims } from "@autonomux/db/jwt";

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();

  // Capture identity BEFORE signOut clears the session.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const claims = tryExtractJwtClaims(accessToken);
  const userId = sessionData.session?.user.id ?? null;

  await supabase.auth.signOut();

  if (userId !== null) {
    try {
      await logAuditEvent(
        {
          tenantId: claims?.tenant_id ?? null,
          actorUserId: userId,
          actorKind: "user",
          action: "session.end",
          resourceType: "session",
          metadata: {},
        },
        getSupabaseServiceClient(),
      );
    } catch {
      // Audit failure does not block sign-out.
    }
  }

  redirect("/");
}
