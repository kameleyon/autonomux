/**
 * apps/admin/app/(authed)/feature-flags/history-action.ts
 *
 * Server Action that lazy-loads audit-log history for one flag.
 * Separate file from `actions.ts` so the client bundle that imports the
 * fetch shape doesn't drag in the mutation code path.
 *
 * Owner: [Forge + Comply]
 */
"use server";

import "server-only";
import { z } from "zod";

import type { Json } from "@autonomux/db";

import { listFeatureFlagAudit } from "../../../lib/feature-flags-queries";

const FLAG_KEY = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9_]*$/);

export interface FlagAuditEntryDto {
  id: string;
  action: string;
  actor_user_id: string | null;
  actor_kind: string;
  metadata: Json;
  created_at: string;
}

export type FetchFlagHistoryResult =
  | { ok: true; entries: FlagAuditEntryDto[] }
  | { ok: false; message: string };

export async function fetchFlagHistoryAction(
  key: string,
): Promise<FetchFlagHistoryResult> {
  const parsed = FLAG_KEY.safeParse(key);
  if (!parsed.success) {
    return { ok: false, message: "Invalid flag key." };
  }
  try {
    const rows = await listFeatureFlagAudit(parsed.data);
    return {
      ok: true,
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actor_user_id: r.actor_user_id,
        actor_kind: r.actor_kind,
        metadata: r.metadata,
        created_at: r.created_at,
      })),
    };
  } catch (caught) {
    const msg = caught instanceof Error ? caught.message : String(caught);
    return { ok: false, message: msg };
  }
}
