/**
 * libsodium wrapper — XChaCha20-Poly1305 AEAD.
 *
 * Why XChaCha20-Poly1305 over AES-GCM-SIV / AES-GCM:
 *   - 192-bit nonce → safe under random generation at huge call volumes (AES-GCM's
 *     96-bit nonce hits collision risk around 2^32 messages with a single key;
 *     XChaCha20's 192-bit nonce is birthday-safe to ~2^80 messages).
 *   - No hardware AES dependency → constant-time in pure software, no timing
 *     leak on platforms without AES-NI.
 *   - Faster than AES-GCM in pure JS (no GHASH bottleneck).
 *   - Authenticated (Poly1305 MAC) → tamper detection on ciphertext + AAD.
 *
 * Threat model defended:
 *   - Ciphertext tampering: Poly1305 fails verification → `open()` throws.
 *   - Nonce reuse: random 192-bit nonce per call → collision-safe at app scale.
 *   - AAD tampering: AAD is bound into the MAC → any change fails verification.
 *
 * Threat model NOT defended:
 *   - Key compromise: if the DEK plaintext leaks, ciphertext is recoverable.
 *     Defended at the envelope layer by KMS-wrapping every DEK.
 */

import _sodium from "libsodium-wrappers-sumo";

let readyPromise: Promise<typeof _sodium> | null = null;

/**
 * Resolve once libsodium WebAssembly is initialized. Idempotent — safe to call
 * from every code path; subsequent calls return the cached promise.
 */
export async function sodiumReady(): Promise<typeof _sodium> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await _sodium.ready;
      return _sodium;
    })();
  }
  return readyPromise;
}

/**
 * Generate `n` cryptographically-secure random bytes via libsodium's
 * `randombytes_buf` (sources from the OS CSPRNG: getrandom(2) / BCryptGenRandom).
 *
 * Used for both DEK generation (32 bytes) and per-message nonce generation
 * (24 bytes for XChaCha20-Poly1305).
 */
export async function randomBytes(n: number): Promise<Uint8Array> {
  const sodium = await sodiumReady();
  return sodium.randombytes_buf(n);
}

export interface SealResult {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

/**
 * XChaCha20-Poly1305 AEAD encrypt.
 *
 * @param key  32-byte symmetric key (DEK).
 * @param plaintext  Bytes to encrypt.
 * @param aad  Additional authenticated data — bound into the MAC, not encrypted.
 *             Tamper-evident: any change on decrypt fails verification.
 *
 * Returns ciphertext (includes 16-byte Poly1305 tag) + the fresh 24-byte nonce.
 *
 * Threat model: nonce is generated inside this function; callers cannot supply
 * one. Eliminates the entire class of nonce-reuse vulnerabilities at the API
 * boundary.
 */
export async function seal(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<SealResult> {
  const sodium = await sodiumReady();
  if (key.length !== sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES) {
    throw new Error(
      `[cipher.seal] Invalid key length: expected ${sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES}, got ${key.length}`,
    );
  }
  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    aad,
    null,
    nonce,
    key,
  );
  return { ciphertext, nonce };
}

/**
 * XChaCha20-Poly1305 AEAD decrypt + verify.
 *
 * Throws if the MAC does not validate — i.e. if ciphertext, nonce, AAD, or key
 * has been tampered with. Callers MUST treat any thrown error as a security
 * event (do not return partial plaintext).
 */
export async function open(
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await sodiumReady();
  if (key.length !== sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES) {
    throw new Error(
      `[cipher.open] Invalid key length: expected ${sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES}, got ${key.length}`,
    );
  }
  if (nonce.length !== sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) {
    throw new Error(
      `[cipher.open] Invalid nonce length: expected ${sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES}, got ${nonce.length}`,
    );
  }
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    aad,
    nonce,
    key,
  );
}

/**
 * Best-effort overwrite of a buffer's contents with zero bytes.
 *
 * Caveat: JavaScript / V8 has no language-level guarantee against the runtime
 * having already copied the buffer into a survivor space. This is mitigation,
 * not a guarantee. Real protection comes from minimizing DEK lifetime
 * (encrypt → wipe → done) and from KMS holding the master key out of process.
 */
export function wipe(b: Uint8Array): void {
  for (let i = 0; i < b.length; i++) b[i] = 0;
}
