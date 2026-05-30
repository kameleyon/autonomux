/**
 * AWS KMS wrapper — DEK generation + envelope wrap/unwrap.
 *
 * Threat model defended:
 *   - Master key isolation: the KMS CMK never leaves AWS HSM. We only ever see
 *     wrapped DEKs.
 *   - Cross-context replay: KMS EncryptionContext binds `{tenant_id, purpose}`
 *     into the wrap. Decryption with a different context fails at KMS itself —
 *     the wrapped DEK from tenant A cannot be unwrapped on tenant B's behalf
 *     even by a compromised app process.
 *   - Auditability: every KMS Encrypt/Decrypt is logged in CloudTrail with the
 *     EncryptionContext, giving us a tamper-evident record outside our DB.
 *
 * Threat model NOT defended (KMS's responsibility):
 *   - Compromised IAM credentials with `kms:Decrypt` on the CMK → game over.
 *     Mitigated by IAM-role-per-service, condition keys on the KMS key policy,
 *     CloudTrail anomaly alerts, and short-lived STS credentials.
 *   - KMS service compromise → game over for everyone. AWS's problem.
 */

import {
  KMSClient,
  EncryptCommand,
  DecryptCommand,
} from "@aws-sdk/client-kms";

import { sodiumReady } from "./sodium";
import { fromBase64, toBase64, assertEnv } from "./utils";

/** Required env vars for the KMS client. Region + key id are non-negotiable. */
const REQUIRED_ENV = ["AWS_REGION", "AWS_KMS_KEY_ID"] as const;

let kmsClient: KMSClient | null = null;

/**
 * Lazily construct (and cache) the KMS client. We defer construction so that
 * tests can mock the module before first use, and so that boot of a process
 * that never touches encryption doesn't pay the SDK init cost.
 *
 * Credential resolution order (AWS SDK default chain):
 *   1. Static keys: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 *   2. Container/EC2/EKS IRSA role credentials
 *   3. Shared credentials file
 * Production should use #2 (IAM role); static keys are acceptable for local
 * development only.
 */
export function getKmsClient(): KMSClient {
  if (kmsClient) return kmsClient;
  assertEnv(REQUIRED_ENV);
  kmsClient = new KMSClient({
    region: process.env.AWS_REGION,
  });
  return kmsClient;
}

/**
 * Test-only hook to inject a mocked KMS client. NEVER call this from production
 * code paths. Calling with `null` clears the cache and forces re-resolution
 * from env on the next `getKmsClient()`.
 */
export function __setKmsClientForTest(client: KMSClient | null): void {
  kmsClient = client;
}

/**
 * Generate a fresh 32-byte DEK using libsodium's CSPRNG (sources from OS
 * `getrandom(2)` / `BCryptGenRandom`).
 *
 * Threat model: each call returns an independent, unpredictable key. We do NOT
 * use `KMS:GenerateDataKey` because (a) it adds a round-trip per encrypt and
 * (b) it would force every encrypt to be online — local randomness is good
 * enough for a 256-bit key.
 */
export async function generateDek(): Promise<Uint8Array> {
  const sodium = await sodiumReady();
  // 32 bytes = XChaCha20-Poly1305 key size.
  return sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
  );
}

/**
 * Wrap a plaintext DEK using the configured KMS CMK.
 *
 * @param plaintextDek  32-byte DEK to wrap. Caller should zero it after use.
 * @param tenantId      Bound into KMS EncryptionContext (NOT the ciphertext).
 * @param purpose       Bound into KMS EncryptionContext (e.g. "oauth_token",
 *                      "pii_email", "agent_run_thought").
 *
 * @returns base64-encoded KMS CiphertextBlob.
 *
 * Threat model: EncryptionContext acts as KMS-side AAD — a wrapped DEK can
 * ONLY be unwrapped if the caller supplies the same `{tenant_id, purpose}`.
 * Prevents cross-tenant and cross-purpose key replay even if the wrapped DEK
 * is leaked from storage.
 */
export async function wrapDek(
  plaintextDek: Uint8Array,
  tenantId: string,
  purpose: string,
): Promise<string> {
  const client = getKmsClient();
  const out = await client.send(
    new EncryptCommand({
      KeyId: process.env.AWS_KMS_KEY_ID,
      Plaintext: plaintextDek,
      EncryptionContext: { tenant_id: tenantId, purpose },
    }),
  );
  if (!out.CiphertextBlob) {
    throw new Error("[cipher.wrapDek] KMS returned no CiphertextBlob");
  }
  return toBase64(new Uint8Array(out.CiphertextBlob));
}

/**
 * Unwrap a previously KMS-wrapped DEK.
 *
 * @param wrappedDekB64  base64-encoded KMS CiphertextBlob.
 * @param tenantId       Must match the value used at wrap time.
 * @param purpose        Must match the value used at wrap time.
 *
 * @returns 32-byte plaintext DEK. Caller MUST zero after use.
 *
 * Threat model: KMS rejects (returns InvalidCiphertextException) if the
 * supplied EncryptionContext does not byte-match the wrap-time context. We
 * do NOT need to verify it ourselves — KMS is the source of truth.
 */
export async function unwrapDek(
  wrappedDekB64: string,
  tenantId: string,
  purpose: string,
): Promise<Uint8Array> {
  const client = getKmsClient();
  const out = await client.send(
    new DecryptCommand({
      KeyId: process.env.AWS_KMS_KEY_ID,
      CiphertextBlob: fromBase64(wrappedDekB64),
      EncryptionContext: { tenant_id: tenantId, purpose },
    }),
  );
  if (!out.Plaintext) {
    throw new Error("[cipher.unwrapDek] KMS returned no Plaintext");
  }
  return new Uint8Array(out.Plaintext);
}
