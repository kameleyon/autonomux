/**
 * @autonomux/auth
 *
 * TOTP + WebAuthn 2FA primitives. Wraps `otplib`, `qrcode`, and
 * `@simplewebauthn/server` behind a stable interface so the rest of the
 * codebase never imports those packages directly.
 *
 * Public surface:
 *   - `generateTotpSecret` / `provisioningUri` / `verifyTotp`        — TOTP
 *   - `generateBackupCodes` / `hashBackupCode` / `verifyBackupCode`  — backup
 *   - `generateRegistrationOptions` / `verifyRegistration`           — WebAuthn enroll
 *   - `generateAuthenticationOptions` / `verifyAuthentication`       — WebAuthn auth
 *   - `checkRateLimit` / `recordAttempt`                             — verify throttle
 *   - `issueStepUpToken` / `verifyStepUpToken`                       — fresh-TOTP gate
 *
 * Secrets handling: TOTP plaintext lives only in memory for the duration of
 * one HTTP request. Persist ONLY via `@autonomux/cipher` envelope.
 */

export {
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  hashBackupCodes,
  provisioningUri,
  verifyBackupCode,
  verifyTotp,
} from "./totp";

export {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type GenerateAuthenticationOptionsArgs,
  type GenerateRegistrationOptionsArgs,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type StoredCredential,
  type VerifiedAuthentication,
  type VerifiedRegistration,
  type VerifyAuthenticationArgs,
  type VerifyRegistrationArgs,
  type WebAuthnUser,
} from "./webauthn";

export {
  checkRateLimit,
  recordAttempt,
  MAX_ATTEMPTS_PER_MINUTE,
  WINDOW_SECONDS,
  type RateLimitContext,
  type RateLimitResult,
} from "./rate-limit";

export {
  issueStepUpToken,
  verifyStepUpToken,
  STEP_UP_TTL_MS,
  type StepUpPurpose,
  type StepUpToken,
} from "./step-up";

export {
  issueTwoFaSessionToken,
  verifyTwoFaSessionToken,
  TWO_FA_SESSION_COOKIE_NAME,
  TWO_FA_SESSION_TTL_MS,
  type TwoFaSessionToken,
} from "./two-fa-session";
