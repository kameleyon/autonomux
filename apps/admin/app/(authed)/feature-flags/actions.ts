/**
 * apps/admin/app/(authed)/feature-flags/actions.ts
 *
 * Server Actions for the Feature Flags console.
 *
 * All three actions:
 *   - Validate with zod (no untrusted input reaches the DB).
 *   - Write via the service-role client (RLS is service-only on this table).
 *   - Audit-log the mutation (action='feature_flag.{created,updated,deleted}').
 *   - Invalidate the in-process flag cache so the new value propagates
 *     within the same Node instance on the next request; peers see the
 *     change on their next TTL expiry (60s default).
 *   - revalidatePath('/feature-flags') so the Server Component re-renders.
 *
 * actor_user_id is null in this phase — admin auth lands in a sibling slice
 * (see ROADMAP §1.0-C / admin sign-in). The audit row is still complete
 * (resource_type, resource_id, action, metadata) and can be back-filled
 * with the admin user_id once the JWT extraction helper exists.
 *
 * Owner: [Forge + Lens + Comply]
 */
"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServiceClient, logAuditEvent, type Json } from "@autonomux/db";
import { flagCache } from "@autonomux/flags";

const FEATURE_FLAGS_PATH = "/feature-flags";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const FLAG_KEY = z
  .string()
  .min(1, "key is required")
  .max(128, "key must be ≤ 128 characters")
  .regex(/^[a-z][a-z0-9_]*$/, "key must be lowercase snake_case");

const UUID = z
  .string()
  .uuid("must be a valid UUID (e.g. 11111111-2222-3333-4444-555555555555)");

/**
 * Parse a textarea / comma-separated list into a clean UUID array.
 * Accepts newlines, commas, spaces. Empty input → [].
 */
function parseUuidList(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) return [];
  const candidates = raw
    .split(/[,\n\r\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // de-duplicate while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

const CREATE_INPUT = z.object({
  key: FLAG_KEY,
  description: z
    .string()
    .max(280)
    .optional()
    .transform((s) => (s === undefined || s.length === 0 ? null : s)),
});

const UPDATE_INPUT = z.object({
  enabled_globally: z.boolean(),
  rollout_percentage: z
    .number()
    .int()
    .min(0)
    .max(100),
  enabled_for_tenants: z.array(UUID).max(1000),
  disabled_for_tenants: z.array(UUID).max(1000),
});

// ---------------------------------------------------------------------------
// Action result type — kept small so consumers can render aria-live status.
// ---------------------------------------------------------------------------

export interface ActionResult {
  ok: boolean;
  /** Short user-facing message. */
  message: string;
  /** Per-field error map for form re-render. */
  fieldErrors?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// createFlagAction
// ---------------------------------------------------------------------------

export async function createFlagAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = CREATE_INPUT.safeParse({
    key: formData.get("key"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0];
      if (typeof path === "string") fieldErrors[path] = issue.message;
    }
    return { ok: false, message: "Validation failed.", fieldErrors };
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("feature_flags")
    .insert({
      key: parsed.data.key,
      description: parsed.data.description,
    })
    .select()
    .single();

  if (error !== null) {
    return {
      ok: false,
      message: `Could not create flag: ${error.message}`,
    };
  }

  await logAuditEvent({
    tenantId: null,
    actorUserId: null,
    actorKind: "admin",
    action: "feature_flag.created",
    resourceType: "feature_flag",
    resourceId: parsed.data.key,
    metadata: {
      key: parsed.data.key,
      description: parsed.data.description,
      created_row_id: data?.key ?? null,
    } satisfies Json,
  });

  flagCache.invalidate(parsed.data.key);
  revalidatePath(FEATURE_FLAGS_PATH);

  return { ok: true, message: `Flag “${parsed.data.key}” created.` };
}

// ---------------------------------------------------------------------------
// updateFlagAction — takes the flag key as the first arg so it's positional
// and not user-tampered via the form payload.
// ---------------------------------------------------------------------------

export async function updateFlagAction(
  key: string,
  formData: FormData,
): Promise<ActionResult> {
  const keyParsed = FLAG_KEY.safeParse(key);
  if (!keyParsed.success) {
    return { ok: false, message: "Invalid flag key." };
  }

  const rolloutRaw = formData.get("rollout_percentage");
  const rollout =
    typeof rolloutRaw === "string" ? Number.parseInt(rolloutRaw, 10) : NaN;

  const parsed = UPDATE_INPUT.safeParse({
    enabled_globally: formData.get("enabled_globally") === "on",
    rollout_percentage: Number.isFinite(rollout) ? rollout : -1,
    enabled_for_tenants: parseUuidList(formData.get("enabled_for_tenants")),
    disabled_for_tenants: parseUuidList(formData.get("disabled_for_tenants")),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0];
      if (typeof path === "string") fieldErrors[path] = issue.message;
    }
    return { ok: false, message: "Validation failed.", fieldErrors };
  }

  // Catch overlap (denylist wins anyway, but warn so operators don't
  // assume an allowlisted tenant is enabled).
  const allowSet = new Set(parsed.data.enabled_for_tenants);
  const overlap = parsed.data.disabled_for_tenants.filter((t) =>
    allowSet.has(t),
  );

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("feature_flags")
    .update({
      enabled_globally: parsed.data.enabled_globally,
      rollout_percentage: parsed.data.rollout_percentage,
      enabled_for_tenants: parsed.data.enabled_for_tenants,
      disabled_for_tenants: parsed.data.disabled_for_tenants,
    })
    .eq("key", keyParsed.data)
    .select()
    .single();

  if (error !== null || data === null) {
    return {
      ok: false,
      message: `Could not update flag: ${error?.message ?? "row not found"}`,
    };
  }

  await logAuditEvent({
    tenantId: null,
    actorUserId: null,
    actorKind: "admin",
    action: "feature_flag.updated",
    resourceType: "feature_flag",
    resourceId: keyParsed.data,
    metadata: {
      key: keyParsed.data,
      enabled_globally: parsed.data.enabled_globally,
      rollout_percentage: parsed.data.rollout_percentage,
      enabled_for_tenants_count: parsed.data.enabled_for_tenants.length,
      disabled_for_tenants_count: parsed.data.disabled_for_tenants.length,
      overlap_count: overlap.length,
    } satisfies Json,
  });

  flagCache.invalidate(keyParsed.data);
  revalidatePath(FEATURE_FLAGS_PATH);

  const overlapNote =
    overlap.length > 0
      ? ` Note: ${overlap.length} tenant(s) appear in both lists; denylist wins.`
      : "";
  return { ok: true, message: `Flag “${keyParsed.data}” updated.${overlapNote}` };
}

// ---------------------------------------------------------------------------
// deleteFlagAction
// ---------------------------------------------------------------------------

export async function deleteFlagAction(key: string): Promise<ActionResult> {
  const keyParsed = FLAG_KEY.safeParse(key);
  if (!keyParsed.success) {
    return { ok: false, message: "Invalid flag key." };
  }

  const sb = createServiceClient();
  const { error } = await sb
    .from("feature_flags")
    .delete()
    .eq("key", keyParsed.data);

  if (error !== null) {
    return {
      ok: false,
      message: `Could not delete flag: ${error.message}`,
    };
  }

  await logAuditEvent({
    tenantId: null,
    actorUserId: null,
    actorKind: "admin",
    action: "feature_flag.deleted",
    resourceType: "feature_flag",
    resourceId: keyParsed.data,
    metadata: { key: keyParsed.data } satisfies Json,
  });

  flagCache.invalidate(keyParsed.data);
  revalidatePath(FEATURE_FLAGS_PATH);

  return { ok: true, message: `Flag “${keyParsed.data}” deleted.` };
}
