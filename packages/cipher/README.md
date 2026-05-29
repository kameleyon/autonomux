# @autonomux/cipher

Envelope encryption + AWS KMS + libsodium AEAD + PII redaction for Autonomux.

Owned by **[Cipher]**. Required by every package that touches PII, OAuth tokens, Plaid material, agent chain-of-thought, or any other regulated data class.

---

## What's here

| File | Purpose |
| --- | --- |
| `src/envelope.ts` | High-level API — `encrypt()` / `decrypt()` / `decryptToString()`. Use these. |
| `src/kms.ts` | KMS wrapper — DEK generation + KMS Encrypt/Decrypt + EncryptionContext binding. |
| `src/sodium.ts` | libsodium wrapper — XChaCha20-Poly1305 AEAD `seal()` / `open()`. |
| `src/redact.ts` | PII redaction — `redactPii()` + Pino-compatible `pinoRedactConfig`. |
| `src/types.ts` | `EncryptedEnvelope` shape + `ENVELOPE_VERSION`. |
| `src/utils.ts` | base64, canonical JSON, constant-time compare, `assertEnv()`. |

---

## Quick start

```ts
import { encrypt, decrypt, decryptToString } from "@autonomux/cipher";

// Encrypt at write time:
const envelope = await encrypt(
  user.email,
  tenantId,
  "pii_email",
);
// Store `envelope` (a plain JSON object) in Postgres `jsonb`. Never store the plaintext.

// Decrypt at read time:
const email = await decryptToString(envelope, tenantId, "pii_email");
```

For PII redaction in logs:

```ts
import pino from "pino";
import { pinoRedactConfig } from "@autonomux/cipher";

const log = pino({ redact: pinoRedactConfig });
```

---

## Security posture

### Cryptography

- **Cipher suite:** XChaCha20-Poly1305 AEAD (libsodium `crypto_aead_xchacha20poly1305_ietf`).
  - 256-bit key, 192-bit nonce, 128-bit Poly1305 MAC tag.
  - Chosen over AES-GCM because (a) 192-bit nonce is birthday-safe under random generation at our scale; (b) constant-time in pure software (no AES-NI dependency); (c) faster than AES-GCM in pure JS.
  - AES-GCM-SIV would also be acceptable; libsodium does not ship it, and we'd rather use a well-trodden libsodium primitive than reach for a less-audited path.
- **Master key store:** AWS KMS. The CMK never leaves AWS HSM.
- **DEK generation:** local libsodium CSPRNG (`randombytes_buf`), 32 bytes. We do NOT call `KMS:GenerateDataKey` (adds a round-trip; not needed for a 256-bit key).
- **DEK lifetime:** one per `encrypt()` call. Zeroed via `wipe()` in a `finally` block immediately after `seal()` / `open()`.

### Envelope binding (AAD)

Every envelope binds `{tenant_id, purpose}` in **two** places:

1. **KMS EncryptionContext** — enforced by AWS KMS itself. A DEK wrapped for `{tenant_a, pii_email}` cannot be unwrapped on behalf of `{tenant_b, pii_email}` or `{tenant_a, oauth_token}`. KMS returns `InvalidCiphertextException`.
2. **App-side AEAD AAD** — `{tenant_id, purpose, v}` canonical-JSON serialized, bound into the Poly1305 MAC. Plus a local pre-check (constant-time string compare) before we even call KMS, so an obvious context mismatch fails closed without burning a paid KMS call or polluting CloudTrail.

This is intentional belt-and-suspenders. KMS could be misconfigured. The app could be tricked. We require BOTH to validate.

### Tenant isolation

- One CMK per environment (prod / staging / dev — separate keys, separate IAM policies).
- Tenant identity is bound into every wrap; cross-tenant decryption is impossible without simultaneous (a) compromise of the app role's `kms:Decrypt` permission AND (b) ability to forge AAD. We assume the attacker has neither.
- The envelope DOES NOT contain `tenant_id` in plaintext — both AADs are base64 of canonical JSON; an attacker who reads the envelope alone learns nothing useful about which tenant it belongs to without independently knowing the tenant id.

### What this package defends against

| Threat | Defense |
| --- | --- |
| DB dump leak | Plaintext is never in DB. Wrapped DEK is unusable without `kms:Decrypt` permission on the CMK. |
| Ciphertext tampering | Poly1305 MAC over `ct + nonce + aad`. Any flipped bit → throws. |
| AAD tampering | AAD is in the MAC. Any change → throws. |
| Cross-tenant decryption | EncryptionContext binding + local AAD check. Two layers, both fail closed. |
| Cross-purpose decryption | Same — `purpose` is bound at both layers. |
| Nonce reuse | 192-bit random nonce per call. Birthday-safe past 2^80 messages with the same key (we'd rotate the DEK first; we use a fresh DEK per call anyway). |
| Wrapped-DEK splicing | Tested in `envelope.test.ts` — KMS refuses because EncryptionContext mismatches. |
| Replay across envelope versions | `v` is in the AEAD AAD; v=2 can't be downgrade-decoded as v=1. |
| Timing side-channel on AAD compare | `constantTimeEqual` in `utils.ts`. |
| Boot-time misconfiguration | `assertEnv()` throws at process start, not at first encrypt. |
| Accidental PII in logs | `redactPii()` + `pinoRedactConfig` cover known field names + pattern-matched secrets. |

### What this package does NOT defend against

| Threat | Owner / mitigation |
| --- | --- |
| Compromised CMK at AWS | AWS KMS service responsibility. We're done. |
| Compromised IAM role with `kms:Decrypt` | IAM policy + CloudTrail anomaly alerts + STS short-lived credentials + per-service roles. NOT this package. |
| In-process memory disclosure of plaintext DEK between unwrap and wipe | V8 has no secure-memory primitive. Mitigated by minimal DEK lifetime, not eliminated. |
| Host-level side channels (RowHammer, Spectre, etc.) | OS / hypervisor. |
| Free-text PII in a log `msg` string | Engineers must use structured logging (`log.info({ email }, "...")`, not `log.info("user@x.com signed up")`). `redactString()` catches obvious patterns (JWT, Bearer, SSN, CC, AWS key id) inside strings as a last line of defense. |
| PII inside fields whose names we don't recognize | The redaction list in `redact.ts` is conservative but not exhaustive. Add fields as new domains land. |
| Plaintext PII passed to LLM provider | Anthropic ZDR contract + system prompt enforcement. NOT this package. |
| Compromised application code that has legitimate decrypt access | Code review + audit log (`packages/audit`) tracks every decrypt. |

---

## Key rotation

### DEK rotation (90-day cadence)

DEKs are per-message and not separately rotated — every `encrypt()` call generates a fresh DEK. The 90-day cadence in the PRD refers to **re-encrypting at rest** so that no individual DEK persists in storage older than 90 days.

Re-encryption procedure (run via batch job, not in this package):

1. SELECT ciphertext rows where `created_at < now() - 90d`.
2. For each row: `decrypt(env, tenantId, purpose)` → re-`encrypt(plaintext, tenantId, purpose)` → UPDATE.
3. The new envelope has a freshly-generated DEK and freshly-wrapped KMS ciphertext (KMS's underlying CMK material rotates on its own schedule transparently).

### CMK rotation

AWS KMS handles CMK key-material rotation automatically when `automatic key rotation` is enabled (yearly per AWS). KMS keeps all prior versions internally and uses metadata in the CiphertextBlob to find the right one. No app change required.

### Envelope format rotation (v → v+1)

Bump `ENVELOPE_VERSION` in `src/types.ts`. Add a new code path in `decrypt()` that dispatches on `env.v`. Old ciphertexts still decrypt via the v=N path. Background re-encrypt job rewrites them to v=N+1.

---

## Audit trail

Every KMS Encrypt and Decrypt call is logged in **AWS CloudTrail** with the full EncryptionContext (`{tenant_id, purpose}`). This is a tamper-evident record outside our own database — if an attacker compromises the app DB, CloudTrail still shows what they decrypted.

Application-side, `packages/audit` (separate package, owned by Atlas + Cipher) is expected to log every decrypt call from the app's own perspective into the signed `audit_log` Merkle chain. The two records cross-check.

---

## Verifying

```sh
# From packages/cipher/
npx tsc --noEmit    # type check
npx vitest run      # tests use a mocked KMS client; no AWS calls
```

All tests must pass before merging changes to this package. Anyone adding a new public function MUST add tamper, wrong-tenant, and wrong-purpose tests for it.
