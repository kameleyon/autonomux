/**
 * apps/web/lib/twofa/config.ts
 *
 * Resolves WebAuthn relying-party + step-up config from env.
 * Throws hard if required env is missing — fail closed.
 */

import "server-only";

export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  origin: string;
}

function req(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    throw new Error(`[twofa/config] Missing required env: ${name}`);
  }
  return v;
}

export function getWebAuthnConfig(): WebAuthnConfig {
  return {
    rpName: process.env.WEBAUTHN_RP_NAME ?? "Autonomux",
    rpID: req("WEBAUTHN_RP_ID"),
    origin: req("WEBAUTHN_ORIGIN"),
  };
}

export function getStepUpSecret(): string {
  return req("AUTH_STEP_UP_SECRET");
}
