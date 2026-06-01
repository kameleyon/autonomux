/**
 * apps/web/app/app/chat/actions.ts
 *
 * Server Actions for thread CRUD: renameThread, archiveThread,
 * unarchiveThread, deleteThread.
 *
 * All four actions mirror the auth + service-client pattern from
 * `./new/action.ts`:
 *   - `requireAuth` + `requireTenantId` verify the caller server-side.
 *   - The write uses the service-role client (RLS bypass) but every
 *     statement carries an explicit `tenant_id` predicate so cross-tenant
 *     writes are physically impossible.
 *   - `revalidatePath` invalidates the chat surface so the sidebar reflects
 *     the change on the next render.
 *
 * Owner: [Cluster C · Forge]
 */

"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { childLogger } from "@/lib/logger";
import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const MAX_TITLE_LENGTH = 140;
const DEFAULT_TITLE = "New conversation";

/* Type shims for the service client's typed builder. The generated DB types
 * don't yet include `archived_at` (column was added in 0014 after the last
 * types regeneration) so each action declares the narrow subset it needs. */
type UpdateBuilder = {
  from: (t: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (
        col: string,
        v: string,
      ) => {
        eq: (
          col: string,
          v: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};

type DeleteBuilder = {
  from: (t: string) => {
    delete: () => {
      eq: (
        col: string,
        v: string,
      ) => {
        eq: (
          col: string,
          v: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};

function readNonEmptyString(formData: FormData, key: string): string {
  const raw = formData.get(key);
  if (typeof raw !== "string") return "";
  return raw.trim();
}

/**
 * Rename a thread. Title is trimmed, must be non-empty, and clamped to
 * MAX_TITLE_LENGTH characters. Tenant + id are joined predicates on the
 * UPDATE so a malicious threadId from another tenant is a no-op.
 */
export async function renameThread(formData: FormData): Promise<void> {
  const log = childLogger({ component: "chat.action.renameThread" });

  const threadId = readNonEmptyString(formData, "threadId");
  const rawTitle = readNonEmptyString(formData, "newTitle");
  if (threadId.length === 0) {
    redirect("/app/chat?err=rename_failed");
  }

  const title =
    rawTitle.length === 0
      ? DEFAULT_TITLE
      : rawTitle.slice(0, MAX_TITLE_LENGTH);

  const userClient = await createClient();
  await requireAuth(userClient);
  const tenantId = await requireTenantId(userClient);

  const service = getSupabaseServiceClient();
  const res = await (service as unknown as UpdateBuilder)
    .from("chat_threads")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("tenant_id", tenantId);

  if (res.error !== null) {
    log.error(
      { err: res.error, thread_id: threadId, tenant_id: tenantId },
      "renameThread update failed",
    );
    redirect(`/app/chat/${threadId}?err=rename_failed`);
  }

  revalidatePath("/app/chat");
  revalidatePath(`/app/chat/${threadId}`);
}

/**
 * Soft-archive a thread: set archived_at = now(). The active-list query
 * filters on `archived_at IS NULL`, so the row vanishes from the sidebar
 * but remains readable from the archived group. If the user was viewing
 * the archived thread we redirect to /app/chat so they're not stranded.
 */
export async function archiveThread(formData: FormData): Promise<void> {
  const log = childLogger({ component: "chat.action.archiveThread" });

  const threadId = readNonEmptyString(formData, "threadId");
  if (threadId.length === 0) {
    redirect("/app/chat?err=archive_failed");
  }

  const userClient = await createClient();
  await requireAuth(userClient);
  const tenantId = await requireTenantId(userClient);

  const service = getSupabaseServiceClient();
  const res = await (service as unknown as UpdateBuilder)
    .from("chat_threads")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .eq("tenant_id", tenantId);

  if (res.error !== null) {
    log.error(
      { err: res.error, thread_id: threadId, tenant_id: tenantId },
      "archiveThread update failed",
    );
    redirect(`/app/chat/${threadId}?err=archive_failed`);
  }

  revalidatePath("/app/chat");
  revalidatePath(`/app/chat/${threadId}`);
  /* If the user was viewing the thread they just archived, drop them on
   * the chat index — staying on the archived view feels stuck. */
  redirect("/app/chat");
}

/**
 * Restore an archived thread back to the active list. No body fields
 * beyond threadId.
 */
export async function unarchiveThread(formData: FormData): Promise<void> {
  const log = childLogger({ component: "chat.action.unarchiveThread" });

  const threadId = readNonEmptyString(formData, "threadId");
  if (threadId.length === 0) {
    redirect("/app/chat?err=unarchive_failed");
  }

  const userClient = await createClient();
  await requireAuth(userClient);
  const tenantId = await requireTenantId(userClient);

  const service = getSupabaseServiceClient();
  const res = await (service as unknown as UpdateBuilder)
    .from("chat_threads")
    .update({
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .eq("tenant_id", tenantId);

  if (res.error !== null) {
    log.error(
      { err: res.error, thread_id: threadId, tenant_id: tenantId },
      "unarchiveThread update failed",
    );
    redirect(`/app/chat?err=unarchive_failed`);
  }

  revalidatePath("/app/chat");
  revalidatePath(`/app/chat/${threadId}`);
}

/**
 * Hard-delete a thread. Messages cascade via the FK from 0009. Tenant
 * predicate on the DELETE is the authorization boundary. After the row
 * is gone we revalidate the sidebar and redirect to /app/chat so a stale
 * URL doesn't 404 in the user's face.
 */
export async function deleteThread(formData: FormData): Promise<void> {
  const log = childLogger({ component: "chat.action.deleteThread" });

  const threadId = readNonEmptyString(formData, "threadId");
  if (threadId.length === 0) {
    redirect("/app/chat?err=delete_failed");
  }

  const userClient = await createClient();
  await requireAuth(userClient);
  const tenantId = await requireTenantId(userClient);

  const service = getSupabaseServiceClient();
  const res = await (service as unknown as DeleteBuilder)
    .from("chat_threads")
    .delete()
    .eq("id", threadId)
    .eq("tenant_id", tenantId);

  if (res.error !== null) {
    log.error(
      { err: res.error, thread_id: threadId, tenant_id: tenantId },
      "deleteThread delete failed",
    );
    redirect(`/app/chat?err=delete_failed`);
  }

  revalidatePath("/app/chat");
  redirect("/app/chat");
}
