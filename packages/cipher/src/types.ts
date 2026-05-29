/**
 * Typed ciphertext envelope produced by `encrypt()` and consumed by `decrypt()`.
 *
 * The envelope is the ONLY thing that should ever be written to storage. The
 * plaintext DEK never leaves memory; only the KMS-wrapped form (`dek_ciphertext`)
 * is persisted.
 *
 * Version byte allows us to rotate the envelope format (e.g. cipher, AAD layout)
 * without breaking existing ciphertexts. Today: v=1.
 *
 * All binary fields are base64-encoded (URL-safe, no padding) so the envelope is
 * JSON-safe for storage in Postgres `jsonb` columns and over HTTP/JSON transport.
 */
export interface EncryptedEnvelope {
  /** Envelope format version. Today: 1. */
  v: number;
  /** Base64 — KMS-wrapped DEK (KMS Encrypt output `CiphertextBlob`). */
  dek_ciphertext: string;
  /** Base64 — AAD passed to KMS EncryptionContext (canonical JSON of `{tenant_id, purpose}`). */
  dek_aad: string;
  /** Base64 — libsodium XChaCha20-Poly1305 ciphertext (includes auth tag). */
  ct: string;
  /** Base64 — XChaCha20-Poly1305 nonce (24 bytes / 192-bit). Fresh per encrypt. */
  nonce: string;
  /** Base64 — AAD bound into the app-side AEAD (canonical JSON of `{tenant_id, purpose, v}`). */
  aad: string;
}

/**
 * The two strings that scope a ciphertext to a particular tenant + use case.
 * Decryption fails closed if the caller passes anything but the original pair.
 */
export interface EnvelopeContext {
  tenantId: string;
  purpose: string;
}

/**
 * Current envelope version. Bump and add a new code path when rotating cipher
 * suite or AAD layout. Never decrement.
 */
export const ENVELOPE_VERSION = 1 as const;
