/**
 * apps/web/app/api/sign-out/route.ts
 *
 * Server half of logout: clears the Supabase session cookies and audit-logs
 * `session.end`. Returns JSON (no redirect) so the /sign-out client page can
 * finish nuking browser caches/storage before it navigates. no-store headers
 * so this response is never cached.
 *
 * Owner: [Forge + Shield]
 */
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { logAuditEvent } from "@autonomux/db/audit";
import { tryExtractJwtClaims } from "@autonomux/db/jwt";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient();

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  const claims = tryExtractJwtClaims(accessToken);
  const userId = data.session?.user.id ?? null;

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
      // Audit failure never blocks logout.
    }
  }

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}
