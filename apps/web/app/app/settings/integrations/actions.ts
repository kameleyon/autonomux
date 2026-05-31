/**
 * apps/web/app/app/settings/integrations/actions.ts
 *
 * Server Action: disconnectIntegration(accountId)  (Sprint D §4 / Cluster D).
 *
 * Steps:
 *   1. requireAuth + requireTenantId. The accountId MUST belong to the
 *      current tenant — service-role read with explicit WHERE re-check
 *      (belt + suspenders for RLS).
 *   2. Decrypt the stored access_token via @autonomux/cipher (purpose
 *      'oauth.gmail'). If decrypt fails (rotated key, corrupt envelope) we
 *      proceed without a remote revoke — local disconnect is more important
 *      than a clean remote-side revoke. Logged as event metadata.
 *   3. POST https://oauth2.googleapis.com/revoke with the access_token. 400
 *      `invalid_token` is treated as a soft success (Google already cleaned
 *      up its side).
 *   4. Mark `oauth_status='revoked'` and OVERWRITE encrypted_credentials with
 *      an empty-plaintext envelope. We never NULL it — the audit invariant
 *      is "row exists → grant happened at some point", and the envelope
 *      shape is what indicates that.
 *   5. Write `connected_account_events` row `event_kind='oauth_revoked'`.
 *
 * Idempotent: clicking Disconnect twice on the same row is safe — the second
 * call observes `oauth_status='revoked'` and is a no-op (returns ok=true).
 *
 * Owner: [Forge + Cipher + Shield]
 */

"use server";

import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  decryptToString,
  encrypt,
  type EncryptedEnvelope,
} from "@autonomux/cipher";
import type { Json } from "@autonomux/db/types";

import { requireAuth, requireTenantId } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { revokeToken } from "@/lib/oauth/gmail";

const OAUTH_PURPOSE = "oauth.gmail" as const;

const argsSchema = z.object({
  account_id: z.string().uuid(),
});

type DisconnectError =
  | "AUTH_REQUIRED"
  | "TENANT_MISSING"
  | "VALIDATION"
  | "NOT_FOUND"
  | "WRONG_TENANT"
  | "UNKNOWN";

export interface DisconnectResult {
  ok: boolean;
  code?: DisconnectError;
  message?: string;
}

export async function disconnectIntegration(formData: FormData): Promise<void> {
  const raw = formData.get("account_id");
  const result = await disconnectIntegrationAction({
    account_id: typeof raw === "string" ? raw : "",
  });
  if (result.ok) {
    redirect("/app/settings/integrations?disconnected=gmail");
  }
  redirect(
    `/app/settings/integrations?error=${encodeURIComponent(result.code ?? "UNKNOWN")}`,
  );
}

export async function disconnectIntegrationAction(args: {
  account_id: string;
}): Promise<DisconnectResult> {
  const parsed = argsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? "Invalid account id",
    };
  }
  const accountId = parsed.data.account_id;

  // ---- 1. Auth + tenant --------------------------------------------------
  let tenantId: string;
  try {
    const supabase = await createClient();
    await requireAuth(supabase);
    tenantId = await requireTenantId(supabase);
  } catch (err) {
    const code =
      err instanceof Error && err.name === "TenantMissingError"
        ? "TENANT_MISSING"
        : "AUTH_REQUIRED";
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : "Authentication required",
    };
  }

  const service = getSupabaseServiceClient();

  const { data: row, error: readErr } = await service
    .from("connected_accounts")
    .select(
      "id, tenant_id, integration, oauth_status, encrypted_credentials",
    )
    .eq("id", accountId)
    .maybeSingle();
  if (readErr !== null) {
    return { ok: false, code: "UNKNOWN", message: readErr.message };
  }
  if (row === null) {
    return { ok: false, code: "NOT_FOUND", message: "Account not found" };
  }
  if (row.tenant_id !== tenantId) {
    return {
      ok: false,
      code: "WRONG_TENANT",
      message: "Account does not belong to this tenant",
    };
  }

  // ---- 2. Idempotency: already revoked → no-op ---------------------------
  if (row.oauth_status === "revoked") {
    return { ok: true };
  }

  // ---- 3. Try to revoke at Google ---------------------------------------
  let revokeOk = true;
  let revokeError: string | null = null;
  if (
    row.encrypted_credentials !== null &&
    row.encrypted_credentials !== undefined
  ) {
    let accessToken: string | null = null;
    try {
      const plaintext = await decryptToString(
        row.encrypted_credentials as unknown as EncryptedEnvelope,
        tenantId,
        OAUTH_PURPOSE,
      );
      const parsedTokens = JSON.parse(plaintext) as {
        access_token?: unknown;
      };
      if (
        typeof parsedTokens.access_token === "string" &&
        parsedTokens.access_token.length > 0
      ) {
        accessToken = parsedTokens.access_token;
      }
    } catch (err) {
      // Decrypt failure → proceed with local revoke only.
      revokeOk = false;
      revokeError =
        err instanceof Error
          ? `decrypt_failed:${err.message}`.slice(0, 200)
          : "decrypt_failed";
    }

    if (accessToken !== null) {
      try {
        const r = await revokeToken(accessToken);
        if (!r.ok) {
          // 400 `invalid_token` = already invalidated → soft success.
          if (r.status === 400 && r.error === "invalid_token") {
            revokeOk = true;
          } else {
            revokeOk = false;
            revokeError = `google_${r.error}_${r.status}`;
          }
        }
      } catch (err) {
        revokeOk = false;
        revokeError =
          err instanceof Error
            ? `network_${err.message}`.slice(0, 200)
            : "network_error";
      }
    }
  }

  // ---- 4. Overwrite credentials with empty envelope + mark revoked ------
  // The empty envelope still binds (tenantId, OAUTH_PURPOSE), so the audit
  // invariant "decrypting this row with the wrong context fails" holds.
  let emptyEnvelope: EncryptedEnvelope;
  try {
    emptyEnvelope = await encrypt("{}", tenantId, OAUTH_PURPOSE);
  } catch (err) {
    return {
      ok: false,
      code: "UNKNOWN",
      message:
        err instanceof Error
          ? `cipher_overwrite_failed:${err.message}`
          : "cipher_overwrite_failed",
    };
  }

  const { error: updateErr } = await service
    .from("connected_accounts")
    .update({
      oauth_status: "revoked",
      encrypted_credentials: emptyEnvelope as unknown as Json,
      token_expires_at: null,
      last_error: revokeError,
    })
    .eq("id", accountId);
  if (updateErr !== null) {
    return { ok: false, code: "UNKNOWN", message: updateErr.message };
  }

  // ---- 5. Event row ------------------------------------------------------
  await service.from("connected_account_events").insert({
    connected_account_id: accountId,
    tenant_id: tenantId,
    event_kind: "oauth_revoked",
    payload: {
      remote_revoke_ok: revokeOk,
      remote_revoke_error: revokeError,
    } as Json,
  });

  return { ok: true };
}
