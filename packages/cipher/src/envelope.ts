/**
 * High-level envelope encryption API.
 *
 * This is the ONLY interface application code should use to encrypt PII /
 * OAuth tokens / agent chain-of-thought / anything sensitive.
 *
 * Threat model defended:
 *   - Cross-tenant decryption: `tenantId` is bound into BOTH the KMS
 *     EncryptionContext AND the app-side AAD. Two layers, both fail-closed.
 *   - Cross-purpose decryption: `purpose` is bound into both layers as well.
 *     A wrapped DEK for `oauth_token` cannot decrypt an `email` ciphertext
 *     even within the same tenant.
 *   - Tamper of any envelope field: AEAD MAC covers ct + nonce + aad. KMS
 *     wraps dek_ciphertext + dek_aad. Any byte flipped → throws on decrypt.
 *   - Replay across versions: `v` is in the AAD, so a future v=2 ciphertext
 *     cannot be downgraded to v=1 verification.
 *
 * Threat model NOT defended:
 *   - In-process memory dump of the DEK plaintext between unwrap and wipe.
 *     V8 does not guarantee secure memory erasure. Mitigation: minimize DEK
 *     lifetime (this module zeros DEK immediately after seal/open).
 *   - Compromised KMS IAM credentials with Decrypt on the CMK. See `kms.ts`.
 *   - Side-channel attacks on the host (RowHammer, Spectre). OS / hypervisor
 *     concern.
 */

import { z } from "zod";

import {
  generateDek,
  unwrapDek,
  wrapDek,
} from "./kms";
import { open, seal, wipe } from "./sodium";
import {
  ENVELOPE_VERSION,
  type EncryptedEnvelope,
  type EnvelopeContext,
} from "./types";
import {
  bytesToUtf8,
  canonicalJson,
  constantTimeEqual,
  fromBase64,
  toBase64,
  utf8ToBytes,
} from "./utils";

/** Zod schema for runtime validation of envelopes pulled from storage. */
const envelopeSchema = z.object({
  v: z.number().int().min(1),
  dek_ciphertext: z.string().min(1),
  dek_aad: z.string().min(1),
  ct: z.string().min(1),
  nonce: z.string().min(1),
  aad: z.string().min(1),
});

/** Zod schema for `EnvelopeContext`. Reject empty / whitespace. */
const contextSchema = z.object({
  tenantId: z.string().trim().min(1).max(256),
  purpose: z.string().trim().min(1).max(128),
});

/**
 * Build the canonical AAD bound into the app-side AEAD.
 *
 * MUST include the version byte so we cannot downgrade-attack a v=2 envelope
 * into the v=1 verification path. MUST be byte-identical encode-vs-decode,
 * hence canonical JSON.
 */
function buildAppAad(ctx: EnvelopeContext, v: number): Uint8Array {
  return utf8ToBytes(
    canonicalJson({ tenant_id: ctx.tenantId, purpose: ctx.purpose, v }),
  );
}

/** Build the canonical AAD passed to KMS EncryptionContext (audit + binding). */
function buildKmsAad(ctx: EnvelopeContext): Uint8Array {
  return utf8ToBytes(
    canonicalJson({ tenant_id: ctx.tenantId, purpose: ctx.purpose }),
  );
}

/**
 * Encrypt `plaintext` for `(tenantId, purpose)`.
 *
 *   1. Generate a fresh 32-byte DEK (CSPRNG).
 *   2. Wrap the DEK with KMS, EncryptionContext = {tenant_id, purpose}.
 *   3. AEAD-encrypt the plaintext with the DEK, AAD = {tenant_id, purpose, v}.
 *   4. Zero the DEK plaintext.
 *   5. Return the envelope. Caller persists ONLY the envelope.
 *
 * Performance note: every call makes one KMS Encrypt round-trip. For bulk
 * encryption of many short fields with the same `(tenantId, purpose)`, a
 * future API could let callers share a DEK across a batch — out of scope for
 * v1.0 (we'd rather pay latency than risk leaky abstractions).
 *
 * @param plaintext  String (UTF-8 encoded) or raw bytes.
 * @param tenantId   The tenant the ciphertext belongs to.
 * @param purpose    Domain label: `oauth_token` | `pii_email` | `pii_phone` |
 *                   `pii_ssn` | `agent_run_thought` | `plaid_access_token` | …
 */
export async function encrypt(
  plaintext: string | Uint8Array,
  tenantId: string,
  purpose: string,
): Promise<EncryptedEnvelope> {
  const ctx = contextSchema.parse({ tenantId, purpose });

  const plaintextBytes =
    typeof plaintext === "string" ? utf8ToBytes(plaintext) : plaintext;

  const dek = await generateDek();
  try {
    const wrappedDek = await wrapDek(dek, ctx.tenantId, ctx.purpose);

    const appAad = buildAppAad(ctx, ENVELOPE_VERSION);
    const kmsAad = buildKmsAad(ctx);

    const { ciphertext, nonce } = await seal(dek, plaintextBytes, appAad);

    return {
      v: ENVELOPE_VERSION,
      dek_ciphertext: wrappedDek,
      dek_aad: toBase64(kmsAad),
      ct: toBase64(ciphertext),
      nonce: toBase64(nonce),
      aad: toBase64(appAad),
    };
  } finally {
    wipe(dek);
  }
}

/**
 * Decrypt an envelope.
 *
 *   1. Validate envelope shape (zod) — reject malformed data before any KMS
 *      call.
 *   2. Recompute expected AAD from supplied `(tenantId, purpose, v)`.
 *   3. Constant-time compare expected vs envelope.aad — fail closed if the
 *      caller is asking on behalf of a different tenant/purpose. (KMS would
 *      catch it too, but local rejection saves a paid KMS call AND prevents
 *      audit-log spam.)
 *   4. Unwrap the DEK via KMS (KMS verifies its own EncryptionContext).
 *   5. AEAD-decrypt + verify with the recomputed AAD.
 *   6. Zero the DEK plaintext.
 *
 * Throws on ANY anomaly:
 *   - malformed envelope (zod failure)
 *   - context mismatch (local AAD compare)
 *   - KMS rejects unwrap (EncryptionContext mismatch / wrong key / no perms)
 *   - AEAD verify fails (tampered ct / nonce / aad / wrong DEK)
 *
 * Callers must NEVER swallow these errors — they are security signals.
 */
export async function decrypt(
  envelope: EncryptedEnvelope,
  tenantId: string,
  purpose: string,
): Promise<Uint8Array> {
  const env = envelopeSchema.parse(envelope);
  const ctx = contextSchema.parse({ tenantId, purpose });

  // Version negotiation — we have only v=1 today.
  if (env.v !== ENVELOPE_VERSION) {
    throw new Error(
      `[cipher.decrypt] Unsupported envelope version: v=${env.v} (only v=${ENVELOPE_VERSION} is supported)`,
    );
  }

  // Local AAD pre-check: prove the caller knows the same (tenant, purpose, v)
  // before we burn a KMS Decrypt round-trip.
  const expectedAppAad = buildAppAad(ctx, env.v);
  if (!constantTimeEqual(toBase64(expectedAppAad), env.aad)) {
    throw new Error(
      "[cipher.decrypt] AAD mismatch — tenantId/purpose do not match envelope context",
    );
  }

  const dek = await unwrapDek(env.dek_ciphertext, ctx.tenantId, ctx.purpose);
  try {
    return await open(
      dek,
      fromBase64(env.ct),
      fromBase64(env.nonce),
      expectedAppAad,
    );
  } finally {
    wipe(dek);
  }
}

/**
 * Convenience: decrypt to a UTF-8 string. Use when you know the plaintext was
 * a string at encrypt time. Throws if the bytes aren't valid UTF-8.
 */
export async function decryptToString(
  envelope: EncryptedEnvelope,
  tenantId: string,
  purpose: string,
): Promise<string> {
  const bytes = await decrypt(envelope, tenantId, purpose);
  return bytesToUtf8(bytes);
}
