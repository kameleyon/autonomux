"use client";

/**
 * apps/web/app/sign-in/page.tsx
 *
 * Sign-in form: email + password + optional TOTP code.
 *
 * Surfaces three explicit banners off the URL search params:
 *   - ?check_email=1  → "Check your inbox for the verification link"
 *   - ?next=/path     → preserved on submit so users land where they came from
 *
 * Owner: [Forge + Halo + Vega]
 */

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { signInAction, type SignInResult } from "./action";

export default function SignInPage(): React.ReactElement {
  return (
    <Suspense fallback={<main id="main" tabIndex={-1} />}>
      <SignInPageInner />
    </Suspense>
  );
}

function SignInPageInner(): React.ReactElement {
  const params = useSearchParams();
  const checkEmail = params.get("check_email") === "1";
  const next = params.get("next") ?? "";

  const [state, formAction, pending] = useActionState<
    SignInResult | null,
    FormData
  >(signInAction, null);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="wrap"
      style={{
        maxWidth: "440px",
        margin: "0 auto",
        padding: "var(--sp-48) var(--sp-16)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--fs-display-m)",
          marginBottom: "var(--sp-24)",
        }}
      >
        Sign in.
      </h1>

      {checkEmail ? (
        <div
          role="status"
          style={{
            marginBottom: "var(--sp-24)",
            padding: "var(--sp-12)",
            borderRadius: "var(--r-md)",
            background: "var(--bg-soft)",
            borderLeft: "3px solid var(--brand-gold)",
            fontSize: "var(--fs-body-sm)",
          }}
        >
          Check your inbox to verify your email — then come back here to sign in.
        </div>
      ) : null}

      <form action={formAction} noValidate>
        <input type="hidden" name="next" value={next} />

        <div style={{ marginBottom: "var(--sp-16)" }}>
          <label
            htmlFor="email"
            style={{
              display: "block",
              fontFamily: "DM Mono, monospace",
              fontSize: "var(--fs-mono-meta)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: "var(--sp-8)",
            }}
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            style={{
              width: "100%",
              padding: "var(--sp-12)",
              fontSize: "var(--fs-body)",
              fontFamily: "inherit",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--ink)",
            }}
          />
        </div>

        <div style={{ marginBottom: "var(--sp-16)" }}>
          <label
            htmlFor="password"
            style={{
              display: "block",
              fontFamily: "DM Mono, monospace",
              fontSize: "var(--fs-mono-meta)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: "var(--sp-8)",
            }}
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            style={{
              width: "100%",
              padding: "var(--sp-12)",
              fontSize: "var(--fs-body)",
              fontFamily: "inherit",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--ink)",
            }}
          />
        </div>

        <div style={{ marginBottom: "var(--sp-16)" }}>
          <label
            htmlFor="totp"
            style={{
              display: "block",
              fontFamily: "DM Mono, monospace",
              fontSize: "var(--fs-mono-meta)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: "var(--sp-8)",
            }}
          >
            TOTP code <span style={{ opacity: 0.6 }}>(optional)</span>
          </label>
          <input
            id="totp"
            name="totp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="123456"
            style={{
              width: "100%",
              padding: "var(--sp-12)",
              fontSize: "var(--fs-body)",
              fontFamily: "DM Mono, monospace",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--ink)",
              letterSpacing: "0.25em",
            }}
          />
          <p
            style={{
              fontSize: "var(--fs-body-sm)",
              color: "var(--muted)",
              marginTop: "var(--sp-8)",
            }}
          >
            Required once you&rsquo;ve enrolled an authenticator app.
          </p>
        </div>

        {state !== null && state.ok === false ? (
          <div
            role="alert"
            style={{
              marginBottom: "var(--sp-16)",
              padding: "var(--sp-12)",
              borderRadius: "var(--r-md)",
              background: "var(--bg-soft)",
              borderLeft: "3px solid var(--brand-orange)",
              fontSize: "var(--fs-body-sm)",
            }}
          >
            {state.message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          style={{
            width: "100%",
            padding: "var(--sp-12) var(--sp-16)",
            fontSize: "var(--fs-body)",
            fontFamily: "inherit",
            fontWeight: 600,
            borderRadius: "var(--r-md)",
            border: "none",
            background: pending ? "var(--muted)" : "var(--brand-orange)",
            color: "var(--ink-on-brand)",
            cursor: pending ? "wait" : "pointer",
          }}
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p
        style={{
          marginTop: "var(--sp-24)",
          fontSize: "var(--fs-body-sm)",
          color: "var(--muted)",
        }}
      >
        New here?{" "}
        <a
          href="/sign-up"
          style={{ color: "var(--brand-orange)" }}
        >
          Create an account
        </a>
        .
      </p>
    </main>
  );
}
