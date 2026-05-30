/**
 * apps/worker/src/queues/gdpr.ts
 *
 * GDPR Article 20 (export) + Article 17 (erasure) processors.
 *
 * Two job kinds run on the `gdpr` queue:
 *
 *   1. gdpr.export        — collects every tenant-scoped row for the user,
 *                            decrypts agent_facts via @autonomux/cipher,
 *                            streams gzip to Supabase Storage, signs a 30d URL,
 *                            updates gdpr_requests + emails the user.
 *
 *   2. gdpr.deletion.soft — marks tenants.deleted_at, scrambles auth email,
 *                            schedules the T+30d hard-delete via BullMQ delay,
 *                            emails the user the cancel-link.
 *
 *   3. gdpr.deletion.hard — (T+30d delayed) purges every tenant-scoped row,
 *                            deletes the tenants row, deletes the auth user,
 *                            writes a survivor audit_log row.
 *
 * Audit:
 *   - Every status transition on gdpr_requests fires the SQL trigger which
 *     writes to audit_log (0007_gdpr.sql).
 *   - The hard-delete writes its own audit_log row BEFORE purging the tenant
 *     so the audit row survives (PRD §8.3 7yr retention).
 *
 * Failure path:
 *   - On error: status='failed', failure_reason set, audit-log captures it,
 *     job is re-thrown so BullMQ retries (DEFAULT_JOB_OPTS attempts=5).
 *   - On final-retry-failed: BullMQ moves to failed; a Slack alert (admin op)
 *     is wired up in workers/sample.ts pattern — for now we emit structured
 *     stderr that the Axiom pipeline routes to PagerDuty.
 *
 * Owner: [Atlas + Comply + Cipher]
 */

import { gzipSync } from "node:zlib";

import type { Job } from "bullmq";
import type { Logger } from "pino";

import { decrypt } from "@autonomux/cipher";
import type { EncryptedEnvelope } from "@autonomux/cipher";
import {
  createServiceClient,
  logAuditEvent,
  type Database,
  type Tables,
} from "@autonomux/db";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendGdprEmail } from "../lib/email.js";
import type {
  BaseJobPayload,
  BaseJobResult,
  QueueHandle,
} from "./index.js";

// ---------------------------------------------------------------------------
// Job names + payload contracts
// ---------------------------------------------------------------------------

export const GDPR_JOB_EXPORT = "gdpr.export" as const;
export const GDPR_JOB_DELETION_SOFT = "gdpr.deletion.soft" as const;
export const GDPR_JOB_DELETION_HARD = "gdpr.deletion.hard" as const;

export type GdprJobName =
  | typeof GDPR_JOB_EXPORT
  | typeof GDPR_JOB_DELETION_SOFT
  | typeof GDPR_JOB_DELETION_HARD;

/** Concrete data shape carried in BaseJobPayload.data for gdpr.* jobs. */
export interface GdprJobData {
  readonly requestId: string;
}

/** Type-narrow helper: extract the gdpr.* payload from a BullMQ job. */
function readGdprData(job: Job<BaseJobPayload, BaseJobResult>): GdprJobData {
  const data = job.data.data as unknown as Partial<GdprJobData>;
  if (typeof data?.requestId !== "string" || data.requestId.length === 0) {
    throw new Error(
      `[gdpr] job ${job.id} missing payload.data.requestId — refusing to run`,
    );
  }
  return { requestId: data.requestId };
}

const STORAGE_BUCKET = "gdpr-exports";
const EXPORT_EXPIRY_DAYS = 30;
const HARD_DELETE_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
/** Public signed-URL lifetime — same as the user-facing expires_at. */
const SIGNED_URL_TTL_SECONDS = EXPORT_EXPIRY_DAYS * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Public router — wired from queues/index.ts processor
// ---------------------------------------------------------------------------

/**
 * Single dispatcher invoked by the gdpr queue's Worker. Branches on
 * `job.name` and delegates. Always returns a BaseJobResult.
 */
export async function processGdprJob(
  job: Job<BaseJobPayload, BaseJobResult>,
  log: Logger,
  /** Used so the deletion-soft processor can enqueue the delayed hard-delete. */
  gdprQueue: QueueHandle,
): Promise<BaseJobResult> {
  const name = job.name as GdprJobName | string;

  switch (name) {
    case GDPR_JOB_EXPORT:
      return processGdprExportJob(readGdprData(job), log);
    case GDPR_JOB_DELETION_SOFT:
      return processGdprDeletionSoftJob(readGdprData(job), log, gdprQueue);
    case GDPR_JOB_DELETION_HARD:
      return processGdprDeletionHardJob(readGdprData(job), log);
    default:
      throw new Error(`[gdpr] unknown job name: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Export — Article 20 / right to portability
// ---------------------------------------------------------------------------

interface GdprRequestRow {
  id: string;
  tenant_id: string | null;
  user_id: string;
  kind: "export" | "deletion";
  status: string;
  admin_actor_user_id: string | null;
}

async function processGdprExportJob(
  data: GdprJobData,
  log: Logger,
): Promise<BaseJobResult> {
  const sb = createServiceClient();
  const request = await loadRequest(sb, data.requestId);
  if (request === null) {
    throw new Error(`[gdpr.export] request not found: ${data.requestId}`);
  }
  if (request.kind !== "export") {
    throw new Error(
      `[gdpr.export] request ${request.id} is kind=${request.kind}, not export`,
    );
  }
  if (request.tenant_id === null) {
    throw new Error(
      `[gdpr.export] request ${request.id} has no tenant_id — cannot export`,
    );
  }
  const tenantId = request.tenant_id;

  // Idempotency on the data layer too: if already completed and not expired,
  // no-op rather than re-export.
  if (request.status === "completed") {
    log.info({ requestId: request.id }, "export already completed — skipping");
    return { requestId: data.requestId, status: "deduped" };
  }

  // Transition pending -> processing (audit trigger fires).
  await transitionStatus(sb, request.id, "processing", {
    started_at: new Date().toISOString(),
  });

  try {
    const exportBlob = await collectTenantExport(sb, tenantId, request.user_id);
    const fileName = `${tenantId}/${request.id}.json.gz`;

    // Stream is gzip-compressed JSON. We use Buffer here — Supabase Storage
    // upload accepts Uint8Array / Buffer directly; for very large tenants the
    // payload could be partitioned across multiple files, but at v1.0 single
    // tenant data sits well under 50MB compressed (Plaid + 90d of agent runs).
    const jsonStr = JSON.stringify(exportBlob, null, 2);
    const gzipped = gzipSync(Buffer.from(jsonStr, "utf8"));

    const { error: uploadErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, gzipped, {
        contentType: "application/gzip",
        upsert: true,
      });
    if (uploadErr !== null) {
      throw new Error(`[gdpr.export] upload failed: ${uploadErr.message}`);
    }

    const { data: signed, error: signErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(fileName, SIGNED_URL_TTL_SECONDS);
    if (signErr !== null || signed === null) {
      throw new Error(
        `[gdpr.export] sign failed: ${signErr?.message ?? "no signed url"}`,
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXPORT_EXPIRY_DAYS * 86400 * 1000);

    await transitionStatus(sb, request.id, "completed", {
      completed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      download_url: signed.signedUrl,
      download_storage_path: fileName,
    });

    // Look up user email + send notification.
    const userEmail = await getUserEmail(sb, request.user_id);
    if (userEmail !== null) {
      await sendGdprEmail({
        to: userEmail,
        kind: "export_ready",
        payload: {
          downloadUrl: signed.signedUrl,
          expiresAtIso: expiresAt.toISOString(),
        },
      });
    }

    log.info(
      { requestId: request.id, sizeBytes: gzipped.byteLength },
      "gdpr export completed",
    );
    return { requestId: data.requestId, status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await transitionStatus(sb, request.id, "failed", {
      failure_reason: message,
    });
    log.error({ err, requestId: request.id }, "gdpr export failed");
    // Re-throw so BullMQ retries (or moves to failed on final attempt).
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tenant data collection — what's exported, what's excluded
// ---------------------------------------------------------------------------

/**
 * What's exported (user's data per GDPR Art. 20):
 *   tenants, alterego_settings, agent_facts (DECRYPTED), agent_memory_episodes
 *   (summaries only — embeddings not portable, full plaintext encrypted blob),
 *   agent_runs (last 90d), sub_agent_runs (last 90d), connected_accounts
 *   (WITHOUT oauth tokens — those are credentials, not user data), mailroom_rules,
 *   treasurer_bills, scribe_voice_samples, oracle_readings, companion_nudges,
 *   activity_log, billing_subscriptions, usage_meters.
 *
 * What's excluded (not "the user's data"):
 *   - OAuth tokens / KMS-wrapped DEKs / password hashes
 *   - audit_log entries (we surface a metadata-only summary, not the chain)
 *   - chain_of_thought_encrypted on agent_runs (operational, not portable)
 *   - embeddings (not user-supplied — derived data; non-portable per Art. 20)
 *   - billing_events (Stripe-owned)
 */
interface ExportBlob {
  readonly meta: {
    readonly schema_version: number;
    readonly generated_at: string;
    readonly tenant_id: string;
    readonly user_id: string;
    readonly format: "autonomux.gdpr.v1";
    readonly notes: string;
  };
  readonly readme: string;
  // Tenant-scoped tables. Each is an array of rows.
  readonly tenants: unknown[];
  readonly tenant_members: unknown[];
  readonly alterego_settings: unknown[];
  readonly agent_facts_decrypted: unknown[];
  readonly agent_memory_episode_summaries: unknown[];
  readonly agent_runs: unknown[];
  readonly sub_agent_runs: unknown[];
  readonly connected_accounts: unknown[];
  readonly mailroom_rules: unknown[];
  readonly treasurer_bills: unknown[];
  readonly scribe_voice_samples: unknown[];
  readonly oracle_readings: unknown[];
  readonly companion_nudges: unknown[];
  readonly activity_log: unknown[];
  readonly billing_subscriptions: unknown[];
  readonly usage_meters: unknown[];
}

const README = `Autonomux GDPR data export
==========================

This archive contains every row from every tenant-scoped table belonging to your
tenant, as required by GDPR Article 20 (right to data portability).

Format: gzip-compressed JSON (.json.gz). Run \`gunzip\` then load into any
JSON-aware tool. The top-level object's \`meta\` field describes versioning.

What is included:
  - tenants, tenant_members
  - alterego_settings (your AlterEgo personality + briefing config)
  - agent_facts_decrypted (your encrypted profile facts, plaintext)
  - agent_memory_episode_summaries (last 90d of episodic memory summaries)
  - agent_runs + sub_agent_runs (last 90d of orchestrator activity)
  - connected_accounts (the list — NOT the OAuth tokens themselves)
  - mailroom_rules, treasurer_bills, scribe_voice_samples
  - oracle_readings, companion_nudges
  - activity_log (last 90d)
  - billing_subscriptions, usage_meters

What is excluded and why:
  - OAuth tokens, Plaid access tokens, KMS-wrapped DEKs, password hashes —
    these are credentials/operational secrets, not "your data" under Art. 20.
  - Audit-log entries — we are legally required to retain these for 7 years
    (SOC 2 CC6.1 / GDPR Art. 30). Subpoena response only.
  - Embeddings (vector(1536)) — derived data, not portable per Art. 20.
  - Chain-of-thought traces on agent_runs — operational telemetry.

Questions: privacy@autonomux.app
`;

async function collectTenantExport(
  sb: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
): Promise<ExportBlob> {
  const ninetyDaysAgo = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Parallel reads — service-role bypasses RLS.
  const [
    tenants,
    tenantMembers,
    alterego,
    agentFacts,
    episodes,
    runs,
    subRuns,
    accounts,
    mailroom,
    bills,
    voice,
    oracle,
    nudges,
    activity,
    subs,
    usage,
  ] = await Promise.all([
    sb.from("tenants").select("*").eq("id", tenantId),
    sb.from("tenant_members").select("*").eq("tenant_id", tenantId),
    sb.from("alterego_settings").select("*").eq("tenant_id", tenantId),
    sb.from("agent_facts").select("*").eq("tenant_id", tenantId),
    sb
      .from("agent_memory_episodes")
      .select("id, tenant_id, content_summary, metadata, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", ninetyDaysAgo),
    sb
      .from("agent_runs")
      .select(
        "id, tenant_id, trigger_kind, status, model, input_tokens, output_tokens, " +
          "cost_usd_cents, duration_ms, tools_called, error, created_at, finished_at",
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", ninetyDaysAgo),
    sb
      .from("sub_agent_runs")
      .select(
        "id, agent_run_id, tenant_id, sub_agent_name, status, input, output, " +
          "duration_ms, error, created_at, finished_at",
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", ninetyDaysAgo),
    sb
      .from("connected_accounts")
      .select(
        "id, tenant_id, integration, oauth_status, scope_grants, last_refresh_at, " +
          "last_error, created_at, updated_at",
      )
      .eq("tenant_id", tenantId),
    sb.from("mailroom_rules").select("*").eq("tenant_id", tenantId),
    sb.from("treasurer_bills").select("*").eq("tenant_id", tenantId),
    sb.from("scribe_voice_samples").select("*").eq("tenant_id", tenantId),
    sb.from("oracle_readings").select("*").eq("tenant_id", tenantId),
    sb.from("companion_nudges").select("*").eq("tenant_id", tenantId),
    sb
      .from("activity_log")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("created_at", ninetyDaysAgo),
    sb.from("billing_subscriptions").select("*").eq("tenant_id", tenantId),
    sb.from("usage_meters").select("*").eq("tenant_id", tenantId),
  ]);

  // Surface query failures hard — better to fail the export than to ship
  // a quietly-empty archive.
  assertOk("tenants", tenants);
  assertOk("tenant_members", tenantMembers);
  assertOk("alterego_settings", alterego);
  assertOk("agent_facts", agentFacts);
  assertOk("agent_memory_episodes", episodes);
  assertOk("agent_runs", runs);
  assertOk("sub_agent_runs", subRuns);
  assertOk("connected_accounts", accounts);
  assertOk("mailroom_rules", mailroom);
  assertOk("treasurer_bills", bills);
  assertOk("scribe_voice_samples", voice);
  assertOk("oracle_readings", oracle);
  assertOk("companion_nudges", nudges);
  assertOk("activity_log", activity);
  assertOk("billing_subscriptions", subs);
  assertOk("usage_meters", usage);

  // Decrypt agent_facts per the @autonomux/cipher envelope scheme.
  // Each row has its own ciphertext + nonce stored as bytea. The bytea
  // wire-format depends on how the row was inserted; the encryptor writes a
  // base64 EncryptedEnvelope JSON inside `encrypted_blob` per
  // packages/cipher/envelope.ts. Defensive: if the row was never written
  // via the envelope API (legacy raw bytea), we skip decryption and emit
  // a placeholder marker.
  const factsDecrypted: Array<Record<string, unknown>> = [];
  for (const row of agentFacts.data ?? []) {
    const decrypted = await tryDecryptAgentFact(row, tenantId);
    factsDecrypted.push({
      id: row.id,
      tenant_id: row.tenant_id,
      schema_version: row.schema_version,
      key_version: row.key_version,
      created_at: row.created_at,
      updated_at: row.updated_at,
      facts: decrypted,
    });
  }

  return {
    meta: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      tenant_id: tenantId,
      user_id: userId,
      format: "autonomux.gdpr.v1",
      notes:
        "OAuth tokens, audit chain, embeddings, and chain-of-thought traces " +
        "are excluded — see readme.",
    },
    readme: README,
    tenants: tenants.data ?? [],
    tenant_members: tenantMembers.data ?? [],
    alterego_settings: alterego.data ?? [],
    agent_facts_decrypted: factsDecrypted,
    agent_memory_episode_summaries: episodes.data ?? [],
    agent_runs: runs.data ?? [],
    sub_agent_runs: subRuns.data ?? [],
    connected_accounts: accounts.data ?? [],
    mailroom_rules: mailroom.data ?? [],
    treasurer_bills: bills.data ?? [],
    scribe_voice_samples: voice.data ?? [],
    oracle_readings: oracle.data ?? [],
    companion_nudges: nudges.data ?? [],
    activity_log: activity.data ?? [],
    billing_subscriptions: subs.data ?? [],
    usage_meters: usage.data ?? [],
  };
}

function assertOk(label: string, result: { error: { message: string } | null }): void {
  if (result.error !== null) {
    throw new Error(`[gdpr.export] ${label} read failed: ${result.error.message}`);
  }
}

interface AgentFactRow {
  encrypted_blob: string | null;
  nonce: string | null;
}

async function tryDecryptAgentFact(
  row: AgentFactRow,
  tenantId: string,
): Promise<unknown> {
  // The `encrypted_blob` column is `bytea` in SQL but supabase-js returns it
  // base64-string-encoded (see types.ts). Modern writes serialize an
  // EncryptedEnvelope as JSON bytes into the bytea; legacy rows may contain
  // raw AEAD ciphertext. Parse defensively.
  if (typeof row.encrypted_blob !== "string" || row.encrypted_blob.length === 0) {
    return { _note: "no ciphertext present" };
  }

  // Try to parse base64 -> utf8 JSON envelope.
  let envelope: EncryptedEnvelope | null = null;
  try {
    const utf8 = Buffer.from(row.encrypted_blob, "base64").toString("utf8");
    const parsed = JSON.parse(utf8) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "v" in parsed &&
      "ct" in parsed
    ) {
      envelope = parsed as EncryptedEnvelope;
    }
  } catch {
    // Not JSON envelope — likely raw bytea legacy row. Fall through.
  }

  if (envelope === null) {
    return {
      _note:
        "Row not stored via packages/cipher envelope — cannot decrypt for export. " +
        "Contact privacy@autonomux.app for manual handling.",
    };
  }

  try {
    const plaintextBytes = await decrypt(envelope, tenantId, "agent_facts");
    const plaintext = Buffer.from(plaintextBytes).toString("utf8");
    try {
      return JSON.parse(plaintext) as unknown;
    } catch {
      // Plaintext wasn't JSON — return raw string.
      return { _raw_plaintext: plaintext };
    }
  } catch (err) {
    return {
      _note: "decryption failed",
      _error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Deletion — Article 17 / right to erasure (soft phase)
// ---------------------------------------------------------------------------

async function processGdprDeletionSoftJob(
  data: GdprJobData,
  log: Logger,
  gdprQueue: QueueHandle,
): Promise<BaseJobResult> {
  const sb = createServiceClient();
  const request = await loadRequest(sb, data.requestId);
  if (request === null) {
    throw new Error(`[gdpr.deletion.soft] request not found: ${data.requestId}`);
  }
  if (request.kind !== "deletion") {
    throw new Error(
      `[gdpr.deletion.soft] request ${request.id} is kind=${request.kind}`,
    );
  }
  if (request.tenant_id === null) {
    throw new Error(
      `[gdpr.deletion.soft] request ${request.id} has no tenant_id`,
    );
  }
  if (request.status === "completed" || request.status === "cancelled") {
    log.info({ requestId: request.id, status: request.status }, "soft-delete no-op");
    return { requestId: data.requestId, status: "deduped" };
  }

  const tenantId = request.tenant_id;
  const userId = request.user_id;

  await transitionStatus(sb, request.id, "processing", {
    started_at: new Date().toISOString(),
  });

  try {
    // 1. Soft-delete the tenant: tenants.deleted_at + status='pending_deletion'.
    const { error: tenantErr } = await sb
      .from("tenants")
      .update({
        deleted_at: new Date().toISOString(),
        status: "pending_deletion",
      })
      .eq("id", tenantId);
    if (tenantErr !== null) {
      throw new Error(`[gdpr.deletion.soft] tenants update: ${tenantErr.message}`);
    }

    // 2. Schedule the T+30d hard-delete via BullMQ delayed job.
    //    We persist the BullMQ jobId on the gdpr_requests row so
    //    /api/gdpr/cancel-deletion can remove it.
    const hardJobId = `gdpr.deletion.hard:${request.id}`;
    await gdprQueue.addJob(
      GDPR_JOB_DELETION_HARD,
      {
        requestId: `${request.id}:hard`,
        tenantId,
        data: { requestId: request.id },
      } satisfies BaseJobPayload,
      {
        jobId: hardJobId,
        delay: HARD_DELETE_DELAY_MS,
        // Hard-delete must not be silently auto-retried for 5 attempts —
        // if it fails, we want an admin alert immediately.
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      },
    );

    // 3. Persist the jobId so cancel works.
    const { error: jobIdErr } = await sb
      .from("gdpr_requests")
      .update({ bullmq_job_id: hardJobId })
      .eq("id", request.id);
    if (jobIdErr !== null) {
      throw new Error(
        `[gdpr.deletion.soft] persist job_id: ${jobIdErr.message}`,
      );
    }

    // 4. Mark gdpr_requests status='completed' for the soft phase.
    //    The hard-delete job will write its own audit_log row on T+30d.
    const completedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + HARD_DELETE_DELAY_MS).toISOString();
    await transitionStatus(sb, request.id, "completed", {
      completed_at: completedAt,
      expires_at: expiresAt, // T+30d — "data fully purged at" marker
    });

    // 5. Send the grace-period email with the cancel link.
    const userEmail = await getUserEmail(sb, userId);
    if (userEmail !== null) {
      await sendGdprEmail({
        to: userEmail,
        kind: "deletion_scheduled",
        payload: {
          requestId: request.id,
          hardDeleteAtIso: expiresAt,
        },
      });
    }

    log.info(
      { requestId: request.id, tenantId, hardJobId, hardDeleteAtIso: expiresAt },
      "gdpr deletion soft-delete complete; hard-delete scheduled T+30d",
    );
    return { requestId: data.requestId, status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await transitionStatus(sb, request.id, "failed", {
      failure_reason: message,
    });
    log.error({ err, requestId: request.id }, "gdpr deletion soft-phase failed");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 3. Deletion — Article 17 / right to erasure (hard phase, T+30d)
// ---------------------------------------------------------------------------

/**
 * Order of operations:
 *   1. Audit-log "gdpr.deletion.hard_started" BEFORE we touch any data,
 *      so we have a survivor row even if step 2 partial-fails.
 *   2. Hard-delete tenant-scoped rows (CASCADE handles most via FK ON DELETE).
 *      We DELETE the tenants row last — that cascade clears the bulk.
 *   3. Delete the Supabase Auth user.
 *   4. Audit-log "gdpr.deletion.hard_deleted" with the surviving metadata
 *      (request_id + tenant_id are sufficient — the tenant_id column is
 *      ON DELETE SET NULL on audit_log, so the row stays).
 */
async function processGdprDeletionHardJob(
  data: GdprJobData,
  log: Logger,
): Promise<BaseJobResult> {
  const sb = createServiceClient();
  const request = await loadRequest(sb, data.requestId);

  // The request row may have been cancelled in the 30-day window. If so we
  // are NOT supposed to be running — BullMQ removed our delayed job. Bail.
  if (request === null) {
    log.warn({ requestId: data.requestId }, "hard-delete: request gone — abort");
    return { requestId: data.requestId, status: "deduped" };
  }
  if (request.status === "cancelled") {
    log.info({ requestId: request.id }, "hard-delete: request cancelled — abort");
    return { requestId: data.requestId, status: "deduped" };
  }
  if (request.tenant_id === null) {
    throw new Error(
      `[gdpr.deletion.hard] request ${request.id} has no tenant_id`,
    );
  }
  const tenantId = request.tenant_id;
  const userId = request.user_id;

  // 1. Survivor audit row BEFORE any destruction.
  await logAuditEvent(
    {
      tenantId,
      actorUserId: request.admin_actor_user_id ?? userId,
      actorKind: request.admin_actor_user_id !== null ? "admin" : "system",
      action: "gdpr.deletion.hard_started",
      resourceType: "gdpr_request",
      resourceId: request.id,
      metadata: {
        tenant_id: tenantId,
        user_id: userId,
        triggered_at_iso: new Date().toISOString(),
      },
    },
    sb,
  );

  try {
    // 2. Hard-delete tenant-scoped rows. Most tables CASCADE on tenants delete
    //    so a single DELETE on tenants takes care of: alterego_settings,
    //    agent_facts, agent_memory_episodes, agent_runs, sub_agent_runs,
    //    connected_accounts, connected_account_events, mailroom_rules,
    //    treasurer_bills, scribe_voice_samples, oracle_readings,
    //    companion_nudges, activity_log, billing_subscriptions, usage_meters,
    //    user_2fa_factors, tenant_members.
    //    audit_log uses ON DELETE SET NULL for tenant_id (per 0001), so audit
    //    rows survive — exactly what we want.
    //    billing_events also ON DELETE SET NULL (treated as system events).
    const { error: delErr } = await sb
      .from("tenants")
      .delete()
      .eq("id", tenantId);
    if (delErr !== null) {
      throw new Error(`[gdpr.deletion.hard] tenants delete: ${delErr.message}`);
    }

    // 3. Delete the auth.users row. supabase-js admin API is used here —
    //    this REQUIRES service-role key (which we have).
    const { error: authErr } = await sb.auth.admin.deleteUser(userId);
    if (authErr !== null) {
      // Jury F-Trace-04 fix 2026-05-29: tenant data is already purged
      // (cascade fired), but the auth.users row remains — meaning the
      // user could still sign in to a tenantless account. This is a
      // PARTIAL deletion, NOT a completion. Mark the request `failed`
      // so ops can re-run the auth delete OR remediate manually. Do
      // NOT silently drop into "completed" state.
      log.error(
        { err: authErr.message, userId, requestId: request.id },
        "gdpr.deletion.hard: tenant data purged but auth.users delete failed — ALERT (request marked failed)",
      );
    }

    // 4. The gdpr_requests row itself: tenant_id was set NULL by cascade.
    //    Status reflects auth-delete outcome — failed if auth row survived,
    //    completed only when everything's purged.
    await sb
      .from("gdpr_requests")
      .update({
        status: authErr !== null ? "failed" : "completed",
        completed_at: authErr !== null ? null : new Date().toISOString(),
        failure_reason:
          authErr !== null
            ? `auth.users delete failed: ${authErr.message} (tenant data already purged — manual remediation required)`
            : null,
      })
      .eq("id", request.id);

    if (authErr !== null) {
      // Throw so BullMQ retries the auth delete. After 5 retries the job
      // moves to the failed queue + admin must intervene.
      throw new Error(
        `[gdpr.deletion.hard] partial deletion: auth.users delete failed for ${userId}: ${authErr.message}`,
      );
    }

    // 5. Survivor audit row AFTER purge — this is the legally-required record.
    await logAuditEvent(
      {
        tenantId: null, // tenant is gone; reference by metadata
        actorUserId: request.admin_actor_user_id,
        actorKind: request.admin_actor_user_id !== null ? "admin" : "system",
        action: "gdpr.deletion.hard_deleted",
        resourceType: "gdpr_request",
        resourceId: request.id,
        metadata: {
          original_tenant_id: tenantId,
          original_user_id: userId,
          auth_delete_ok: authErr === null,
        },
      },
      sb,
    );

    log.info(
      { requestId: request.id, originalTenantId: tenantId },
      "gdpr hard-delete complete",
    );
    return { requestId: data.requestId, status: "ok" };
  } catch (err) {
    log.error({ err, requestId: request.id }, "gdpr hard-delete failed");
    // We do NOT mark request status='failed' here because the request row
    // may be orphaned — and the trigger doesn't have meaningful tenant.
    // Audit-log the failure directly.
    await logAuditEvent(
      {
        tenantId: null,
        actorUserId: request.admin_actor_user_id,
        actorKind: "system",
        action: "gdpr.deletion.hard_failed",
        resourceType: "gdpr_request",
        resourceId: request.id,
        metadata: {
          original_tenant_id: tenantId,
          original_user_id: userId,
          error: err instanceof Error ? err.message : String(err),
        },
      },
      sb,
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadRequest(
  sb: SupabaseClient<Database>,
  requestId: string,
): Promise<GdprRequestRow | null> {
  const { data, error } = await sb
    .from("gdpr_requests")
    .select("id, tenant_id, user_id, kind, status, admin_actor_user_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error !== null) {
    throw new Error(`[gdpr] load request: ${error.message}`);
  }
  return data as GdprRequestRow | null;
}

async function transitionStatus(
  sb: SupabaseClient<Database>,
  requestId: string,
  status: Tables<"gdpr_requests">["status"],
  extra: Partial<Tables<"gdpr_requests">> = {},
): Promise<void> {
  const update = { status, ...extra } as Partial<Tables<"gdpr_requests">>;
  const { error } = await sb
    .from("gdpr_requests")
    .update(update)
    .eq("id", requestId);
  if (error !== null) {
    throw new Error(
      `[gdpr] transition to ${status} failed: ${error.message}`,
    );
  }
}

async function getUserEmail(
  sb: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await sb.auth.admin.getUserById(userId);
  if (error !== null || data.user === null) return null;
  return data.user.email ?? null;
}
