/**
 * @autonomux/cipher
 *
 * Envelope encryption + KMS + libsodium AEAD + PII redaction for Autonomux.
 *
 * Public surface:
 *   - `encrypt` / `decrypt` / `decryptToString`  — high-level envelope API
 *   - `EncryptedEnvelope` / `EnvelopeContext`    — types
 *   - `wrapDek` / `unwrapDek` / `generateDek`    — low-level KMS ops
 *   - `seal` / `open` / `sodiumReady`            — low-level AEAD ops
 *   - `redactPii` / `pinoRedactConfig`           — log redaction
 *   - `assertEnv` / `canonicalJson` / base64 helpers
 *
 * If you are application code, you almost always want `encrypt` / `decrypt`.
 */

export {
  decrypt,
  decryptToString,
  encrypt,
} from "./envelope.js";

export {
  ENVELOPE_VERSION,
  type EncryptedEnvelope,
  type EnvelopeContext,
} from "./types.js";

export {
  __setKmsClientForTest,
  generateDek,
  getKmsClient,
  unwrapDek,
  wrapDek,
} from "./kms.js";

export {
  open,
  randomBytes,
  seal,
  sodiumReady,
  wipe,
  type SealResult,
} from "./sodium.js";

export {
  PII_FIELD_NAMES,
  pinoRedactConfig,
  pinoRedactPaths,
  REDACTED,
  redactPii,
  redactString,
} from "./redact.js";

export {
  assertEnv,
  bytesToUtf8,
  canonicalJson,
  constantTimeBytesEqual,
  constantTimeEqual,
  fromBase64,
  fromBase64Url,
  toBase64,
  toBase64Url,
  utf8ToBytes,
} from "./utils.js";
