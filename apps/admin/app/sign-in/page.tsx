"use client";

/**
 * Admin sign-in — Phase 1.0-A placeholder.
 *
 * Form intentionally does not submit anywhere. Auth (Supabase email +
 * password + TOTP, IP allowlist, WireGuard mesh per PRD §7.1) wires in
 * Phase 1.0-B. The visible status copy is honest about that.
 */
import Image from "next/image";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

export default function AdminSignInPage(): React.ReactElement {
  const emailId = useId();
  const passwordId = useId();
  const totpId = useId();
  const statusId = useId();
  const [status, setStatus] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setStatus("Auth wires in Phase 1.0-B. No request was sent.");
  }

  return (
    <main id="main" tabIndex={-1} className="wrap">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-12)",
          marginBottom: "var(--sp-32)",
        }}
      >
        <Image
          src="/logo.png"
          alt="Autonomux"
          width={44}
          height={44}
          priority
        />
        <div className="adm-brand">
          Autonom<em>ux</em> Admin
        </div>
      </header>

      <section
        style={{ maxWidth: "480px" }}
        aria-labelledby="signin-h1"
      >
        <p
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-mono-meta)",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--brand-orange)",
            marginBottom: "var(--sp-12)",
          }}
        >
          Placeholder &middot; not wired
        </p>
        <h1
          id="signin-h1"
          style={{
            fontSize: "var(--fs-display-s)",
            marginBottom: "var(--sp-16)",
          }}
        >
          Sign in
        </h1>
        <p
          style={{
            fontSize: "var(--fs-body)",
            color: "var(--muted)",
            marginBottom: "var(--sp-24)",
          }}
        >
          Email, password, and a 6-digit TOTP code from your authenticator.
          Real auth wires in Phase 1.0-B.
        </p>

        <form
          className="adm-form"
          onSubmit={handleSubmit}
          noValidate
          aria-describedby={status ? statusId : undefined}
        >
          <div className="adm-field">
            <label className="adm-label" htmlFor={emailId}>
              Email
            </label>
            <input
              id={emailId}
              className="adm-input"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor={passwordId}>
              Password
            </label>
            <input
              id={passwordId}
              className="adm-input"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={12}
              required
            />
            <span className="adm-hint">Twelve characters minimum.</span>
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor={totpId}>
              TOTP code
            </label>
            <input
              id={totpId}
              className="adm-input"
              name="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
            <span className="adm-hint">
              Six digits from your authenticator app.
            </span>
          </div>

          <button type="submit" className="adm-cta">
            Sign in
          </button>

          {status ? (
            <p
              id={statusId}
              role="status"
              aria-live="polite"
              className="adm-status"
            >
              {status}
            </p>
          ) : null}
        </form>

        <p
          style={{
            marginTop: "var(--sp-32)",
            fontSize: "var(--fs-body-sm)",
            color: "var(--muted)",
          }}
        >
          <Link href="/">&larr; Back to admin landing</Link>
        </p>
      </section>
    </main>
  );
}
