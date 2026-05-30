/**
 * @autonomux/auth/webauthn
 *
 * Wrappers around `@simplewebauthn/server` 11.x. We isolate the SDK behind
 * a thin layer so the rest of the codebase imports stable named exports and
 * never touches `@simplewebauthn/server` directly.
 *
 * Flow recap (RP = relying party = our server):
 *   Registration:
 *     1. RP calls generateRegistrationOptions() â†’ returns {challenge, ...}.
 *     2. RP stores the challenge in an encrypted cookie (5-min TTL, single-use).
 *     3. Browser calls navigator.credentials.create({publicKey: opts}).
 *     4. RP calls verifyRegistration({challenge, response, ...}). On success,
 *        RP persists the public key.
 *   Authentication:
 *     1. RP calls generateAuthenticationOptions(allowCredentials=user's creds).
 *     2. RP stores challenge in encrypted cookie.
 *     3. Browser calls navigator.credentials.get({publicKey: opts}).
 *     4. RP calls verifyAuthentication. On success, RP updates the counter +
 *        marks session as 2FA-passed.
 *
 * RP ID rules: must be a registrable domain suffix of the origin (e.g.
 * 'autonomux.io' for origin 'https://autonomux.io'). Use 'localhost' in dev.
 *
 * Owner: [Cipher + Shield]
 */

import {
  generateAuthenticationOptions as simpleGenerateAuthOptions,
  generateRegistrationOptions as simpleGenerateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type GenerateAuthenticationOptionsOpts,
  type GenerateRegistrationOptionsOpts,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  CredentialDeviceType,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";

// ---------------------------------------------------------------------------
// Public types â€” narrowed to what callers actually need.
// ---------------------------------------------------------------------------

export interface WebAuthnUser {
  /** Stable user identifier (we use auth.users.id UUID). */
  id: string;
  /** Display name shown to the user during enrollment. */
  name: string;
  /** Human-readable label (usually email or display name). */
  displayName: string;
}

export interface StoredCredential {
  /** base64url-encoded credentialId. */
  credentialId: string;
  /** base64url-encoded COSE public key. */
  publicKey: string;
  /** Signature counter, used for clone detection. */
  counter: number;
  /** Transports the authenticator advertised. */
  transports?: AuthenticatorTransportFuture[];
}

export interface GenerateRegistrationOptionsArgs {
  user: WebAuthnUser;
  rpName: string;
  rpID: string;
  /** Credentials already enrolled by this user (so the authenticator can refuse duplicates). */
  excludeCredentials?: Array<{
    id: string;
    transports?: AuthenticatorTransportFuture[];
  }>;
}

export interface VerifyRegistrationArgs {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string | string[];
  expectedRPID: string;
}

export interface GenerateAuthenticationOptionsArgs {
  rpID: string;
  allowCredentials?: Array<{
    id: string;
    transports?: AuthenticatorTransportFuture[];
  }>;
  userVerification?: "required" | "preferred" | "discouraged";
}

export interface VerifyAuthenticationArgs {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string | string[];
  expectedRPID: string;
  credential: StoredCredential;
  /** Default: require user verification (PIN / biometric). */
  requireUserVerification?: boolean;
}

export interface VerifiedRegistration {
  verified: boolean;
  credentialId: string;
  credentialPublicKey: string;
  counter: number;
  transports: AuthenticatorTransportFuture[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
}

export interface VerifiedAuthentication {
  verified: boolean;
  /** Updated signature counter â€” caller must persist. */
  newCounter: number;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Generate WebAuthn registration options for navigator.credentials.create().
 *
 * The returned `challenge` MUST be stored server-side (encrypted cookie,
 * 5-minute TTL, single-use) and replayed back to `verifyRegistration()`.
 *
 * `userID` is converted to a Uint8Array internally per WebAuthn spec.
 */
export async function generateRegistrationOptions(
  args: GenerateRegistrationOptionsArgs,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const opts: GenerateRegistrationOptionsOpts = {
    rpName: args.rpName,
    rpID: args.rpID,
    userName: args.user.name,
    userDisplayName: args.user.displayName,
    userID: new TextEncoder().encode(args.user.id),
    attestationType: "none",
    excludeCredentials: (args.excludeCredentials ?? []).map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    authenticatorSelection: {
      // Allow both platform (Touch ID, Windows Hello) and cross-platform (YubiKey).
      residentKey: "preferred",
      userVerification: "preferred",
    },
    // Prefer Ed25519 â†’ ES256 â†’ RS256.
    supportedAlgorithmIDs: [-8, -7, -257],
    timeout: 60_000,
  };

  return await simpleGenerateRegistrationOptions(opts);
}

/**
 * Verify the browser's registration response. Returns the public key + counter
 * to persist for future authentication.
 *
 * Throws on ANY verification failure â€” security signal, never swallow.
 */
export async function verifyRegistration(
  args: VerifyRegistrationArgs,
): Promise<VerifiedRegistration> {
  const result: VerifiedRegistrationResponse = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: args.expectedOrigin,
    expectedRPID: args.expectedRPID,
    requireUserVerification: true,
  });

  if (!result.verified || !result.registrationInfo) {
    throw new Error("[auth.webauthn] registration verification failed");
  }

  const info = result.registrationInfo;
  const cred = info.credential;

  return {
    verified: true,
    credentialId: cred.id,
    credentialPublicKey: bufferToBase64Url(cred.publicKey),
    counter: cred.counter,
    transports: cred.transports ?? [],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
  };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Generate WebAuthn authentication options for navigator.credentials.get().
 *
 * `allowCredentials` should be the user's enrolled credentials so the
 * authenticator can pick the right one. Pass an empty list (or omit) to
 * trigger discoverable-credential ("usernameless") flow.
 */
export async function generateAuthenticationOptions(
  args: GenerateAuthenticationOptionsArgs,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const opts: GenerateAuthenticationOptionsOpts = {
    rpID: args.rpID,
    allowCredentials: (args.allowCredentials ?? []).map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    userVerification: args.userVerification ?? "preferred",
    timeout: 60_000,
  };

  return await simpleGenerateAuthOptions(opts);
}

/**
 * Verify the browser's authentication assertion.
 *
 * Caller MUST update the stored credential's counter to `newCounter` on
 * success. A new counter <= old counter is a clone-detection signal and
 * SimpleWebAuthn will throw.
 */
export async function verifyAuthentication(
  args: VerifyAuthenticationArgs,
): Promise<VerifiedAuthentication> {
  const publicKey = base64UrlToBuffer(args.credential.publicKey);

  const result: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: args.expectedOrigin,
    expectedRPID: args.expectedRPID,
    credential: {
      id: args.credential.credentialId,
      publicKey,
      counter: args.credential.counter,
      transports: args.credential.transports,
    },
    requireUserVerification: args.requireUserVerification ?? true,
  });

  if (!result.verified) {
    throw new Error("[auth.webauthn] authentication verification failed");
  }

  return {
    verified: true,
    newCounter: result.authenticationInfo.newCounter,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function bufferToBase64Url(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

function base64UrlToBuffer(b64url: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64url, "base64url"));
}

// Re-export the SimpleWebAuthn JSON types so route handlers can type their
// request bodies without importing the SDK directly.
export type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
};
