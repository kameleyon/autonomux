# @autonomux/auth

TOTP + WebAuthn 2FA primitives for Autonomux. Wraps `otplib`, `qrcode`, and
`@simplewebauthn/server` behind a stable interface — no consumer ever imports
those packages directly.

Per PRD §7.1:

- TOTP is **mandatory** at signup.
- WebAuthn / passkeys are an **optional second factor**, offered after first sign-in.
- Removing 2FA requires a fresh TOTP within 5 minutes (step-up).
- Verify capped at 5 attempts/minute/user (slow brute force).

## Public API

### TOTP

```ts
import { generateTotpSecret, provisioningUri, verifyTotp } from "@autonomux/auth";

const secret = generateTotpSecret();                  // base32, in-memory only
const uri = provisioningUri(secret, "user@example.com"); // otpauth:// URI
const ok = verifyTotp(secret, "123456");              // boolean, constant-time
```

**Secret material rules:**

- Never log.
- Never put in a URL except the provisioning `otpauth://` URI (which is
  rendered as a QR for the user's authenticator app — it does not travel
  outside that page).
- Never ship to the client bundle.
- Always persist via `@autonomux/cipher.encrypt(secret, tenantId, 'totp_secret')`.

### Backup codes

```ts
import { generateBackupCodes, hashBackupCodes, verifyBackupCode } from "@autonomux/auth";

const codes = generateBackupCodes(10);    // XXXX-XXXX × 10
const hashes = hashBackupCodes(codes);    // sha256 hex, store these
// ... display codes to user ONCE, then forget ...
const matched = verifyBackupCode(input, hashes); // null or matched hex
// On match, splice `matched` out of the stored hash array (single-use).
```

### WebAuthn

```ts
import {
  generateRegistrationOptions, verifyRegistration,
  generateAuthenticationOptions, verifyAuthentication,
} from "@autonomux/auth";

// Enrollment
const opts = await generateRegistrationOptions({ user, rpName, rpID, excludeCredentials });
// store opts.challenge in encrypted cookie (5-min TTL), send opts to browser
const result = await verifyRegistration({ response, expectedChallenge, expectedOrigin, expectedRPID });
// persist result.credentialId + result.credentialPublicKey + result.counter

// Authentication
const opts = await generateAuthenticationOptions({ rpID, allowCredentials });
// store opts.challenge in encrypted cookie, send opts to browser
const result = await verifyAuthentication({ response, expectedChallenge, expectedOrigin, expectedRPID, credential });
// update credential.counter to result.newCounter
```

### Rate limit

```ts
import { checkRateLimit, recordAttempt } from "@autonomux/auth";

const ctx = { sb, userId, kind: "totp", ip, userAgent };
const { allowed, remaining, retryAfterSeconds } = await checkRateLimit(ctx);
if (!allowed) return new Response("Too many attempts", { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
// ... run verify ...
await recordAttempt(ctx, verifySucceeded);
```

### Step-up

```ts
import { issueStepUpToken, verifyStepUpToken } from "@autonomux/auth";

// After a fresh TOTP verify for a destructive op:
const token = issueStepUpToken(
  { userId, issuedAt: Date.now(), purpose: "step_up_2fa_revoke" },
  process.env.AUTH_STEP_UP_SECRET!,
);
// store `token` in httpOnly Secure SameSite=Strict cookie, maxAge=300

// On the destructive endpoint:
const ok = verifyStepUpToken(cookieValue, {
  userId, purpose: "step_up_2fa_revoke", secret: process.env.AUTH_STEP_UP_SECRET!,
});
if (!ok) return new Response("Step-up required", { status: 401 });
```

## Env vars

| Name | Default | Notes |
|---|---|---|
| `WEBAUTHN_RP_NAME` | `Autonomux` | Brand string shown in the authenticator UI. |
| `WEBAUTHN_RP_ID` | — | Must be a registrable suffix of the origin. `localhost` in dev. |
| `WEBAUTHN_ORIGIN` | — | Full origin including scheme — `https://autonomux.io` etc. |
| `AUTH_STEP_UP_SECRET` | — | ≥32-char random string for HMAC-signing step-up tokens. |
| `AUTH_CHALLENGE_SECRET` | — | ≥32-char random string for HMAC-signing WebAuthn challenge cookies. |

## Threat model

| Defended | How |
|---|---|
| TOTP secret theft from DB | Cipher envelope encryption (KMS + AAD-bound) |
| TOTP brute force | Rate limit: 5 attempts / 60s / user, sliding window |
| Backup code DB exposure | SHA-256 one-way; even we cannot recover plaintext |
| TOTP timing oracle on verify | otplib uses constant-time HMAC compare internally |
| Backup code timing oracle | `timingSafeEqual` loop, no short-circuit |
| WebAuthn challenge replay | 5-min TTL, single-use, encrypted cookie |
| WebAuthn cloned authenticator | Signature counter — SimpleWebAuthn throws on regression |
| Step-up token tampering | HMAC-SHA-256 with bound purpose + user |
| Step-up token replay across ops | `purpose` field included in HMAC body |

| NOT defended | Mitigation owner |
|---|---|
| Phishing → real-time TOTP relay | User education + WebAuthn upgrade path (FIDO is phish-resistant) |
| Authenticator app compromise (malware on phone) | Out of scope |
| `AUTH_STEP_UP_SECRET` exfiltration | Doppler-managed; rotate on suspicion |

## What ships in Phase 1.0-B2+B3

Covered:

- TOTP enrollment + verification + backup codes
- WebAuthn/passkey enrollment + authentication
- Rate limiting + step-up tokens
- Audit-logged enroll / revoke / backup-code display
- Encrypted-cookie WebAuthn challenge transport

Deferred to later phases:

- Redis-backed rate limiter (Phase 1.0-C)
- Backup-code re-generation flow (Phase 1.0-C — manual support ticket today)
- "Trusted device" cookie that skips 2FA for 30 days (Phase 1.7)
- Hardware-key attestation enforcement for enterprise tier (Phase 3)
