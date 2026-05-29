/**
 * apps/web/app/app/settings/security/WebAuthnEnroll.client.tsx
 *
 * Client island for enrolling a WebAuthn passkey.
 *
 *   1. POST /api/webauthn/register/options → returns PublicKeyCredentialCreationOptionsJSON.
 *   2. Browser navigator.credentials.create() via @simplewebauthn/browser.
 *   3. POST /api/webauthn/register/verify with the attestation response.
 *   4. Reload to show the new key in the list.
 *
 * Owner: [Cipher + Shield]
 */

"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useState } from "react";

export function WebAuthnEnrollButton(): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");

  async function handleEnroll(): Promise<void> {
    setErr(null);
    setBusy(true);
    try {
      const optsRes = await fetch("/api/webauthn/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!optsRes.ok) {
        const body = (await optsRes.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? `options failed (${optsRes.status})`);
      }
      const options = await optsRes.json();
      const attestation = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/webauthn/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          response: attestation,
          nickname: nickname.trim() || null,
        }),
      });
      if (!verifyRes.ok) {
        const body = (await verifyRes.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? `verify failed (${verifyRes.status})`);
      }
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "var(--sp-16)" }}>
      <label htmlFor="passkey-nickname">Nickname (optional)</label>
      <input
        id="passkey-nickname"
        type="text"
        value={nickname}
        onChange={(e): void => setNickname(e.target.value)}
        placeholder="YubiKey, iPhone, Work laptop…"
        maxLength={64}
        style={{ display: "block", marginTop: "var(--sp-4)" }}
      />
      <button
        type="button"
        onClick={(): void => {
          void handleEnroll();
        }}
        disabled={busy}
        aria-busy={busy}
        style={{ marginTop: "var(--sp-12)" }}
      >
        {busy ? "Enrolling…" : "Enroll a passkey"}
      </button>
      {err !== null ? (
        <p role="alert" style={{ marginTop: "var(--sp-8)" }}>
          {err}
        </p>
      ) : null}
    </div>
  );
}
