"use client";

/**
 * apps/web/app/sign-up/page.tsx
 *
 * Sign-up form. Client component because we run zxcvbn in-browser for the
 * live strength meter — the server still re-scores on submit (defense-
 * in-depth) inside `./action.ts`.
 *
 * Submits via Server Action (useActionState).
 *
 * Owner: [Forge + Halo + Vega]
 */

import { useActionState, useEffect, useMemo, useState } from "react";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import * as zxcvbnEnglish from "@zxcvbn-ts/language-en";

import { signUpAction, type SignUpResult } from "./action";

zxcvbnOptions.setOptions({
  translations: zxcvbnEnglish.translations,
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommon.dictionary,
    ...zxcvbnEnglish.dictionary,
  },
});

const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;

export default function SignUpPage(): React.ReactElement {
  const [state, formAction, pending] = useActionState<
    SignUpResult | null,
    FormData
  >(signUpAction, null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const score = useMemo<number>(() => {
    if (password.length === 0) return -1;
    return zxcvbn(password, [email, email.split("@")[0] ?? ""]).score;
  }, [email, password]);

  // Announce score changes to screen readers (live region also covers it).
  useEffect(() => {
    // No imperative DOM work — kept here for symmetry / future telemetry hooks.
  }, [score]);

  const meetsLength = password.length >= 12;
  const meetsStrength = score >= 3;
  const canSubmit = email.length > 0 && meetsLength && meetsStrength && !pending;

  return (
    <main
      id="main"
      tabIndex={-1}
      className="wrap"
      style={{ maxWidth: "440px", margin: "0 auto", padding: "var(--sp-48) var(--sp-16)" }}
    >
      <h1
        style={{
          fontSize: "var(--fs-display-m)",
          marginBottom: "var(--sp-24)",
        }}
      >
        Create your <em>AlterEgo</em>.
      </h1>
      <p
        style={{
          color: "var(--ink-soft)",
          marginBottom: "var(--sp-32)",
        }}
      >
        Twelve characters minimum, and pick something memorable — your AlterEgo
        will only ever be as secure as the door you put on it.
      </p>

      <form action={formAction} noValidate>
        {/* Honeypot — visually hidden, non-tabbable. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-9999px",
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
        >
          <label htmlFor="hp">Leave this empty</label>
          <input
            type="text"
            id="hp"
            name="hp"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div style={{ marginBottom: "var(--sp-16)" }}>
          <label
            htmlFor="email"
            style={{
              display: "block",
              fontFamily: "DM Mono, monospace",
              fontSize: "var(--fs-mono-meta)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--ink)",
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={state?.error === "INVALID_INPUT" || state?.error === "EMAIL_TAKEN"}
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
              color: "var(--ink)",
              marginBottom: "var(--sp-8)",
            }}
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-help password-strength"
            aria-invalid={state?.error === "WEAK_PASSWORD"}
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
          <p
            id="password-help"
            style={{
              fontSize: "var(--fs-body-sm)",
              color: "var(--muted)",
              marginTop: "var(--sp-8)",
            }}
          >
            Twelve characters minimum. Strength must reach &quot;Good&quot;.
          </p>
          <PasswordStrengthMeter score={score} />
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
              color: "var(--ink)",
            }}
          >
            {state.message}
            {state.passwordWarning !== undefined && state.passwordWarning.length > 0 ? (
              <> — {state.passwordWarning}</>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: "100%",
            padding: "var(--sp-12) var(--sp-16)",
            fontSize: "var(--fs-body)",
            fontFamily: "inherit",
            fontWeight: 600,
            borderRadius: "var(--r-md)",
            border: "none",
            background: canSubmit ? "var(--brand-orange)" : "var(--muted)",
            color: "var(--ink-on-brand)",
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p
        style={{
          marginTop: "var(--sp-24)",
          fontSize: "var(--fs-body-sm)",
          color: "var(--muted)",
        }}
      >
        Already have an account?{" "}
        <a
          href="/sign-in"
          style={{ color: "var(--brand-orange)" }}
        >
          Sign in
        </a>
        .
      </p>
    </main>
  );
}

function PasswordStrengthMeter({ score }: { score: number }): React.ReactElement {
  const label = score >= 0 ? STRENGTH_LABELS[score] ?? "" : "";
  const pct = score >= 0 ? ((score + 1) / 5) * 100 : 0;
  return (
    <div style={{ marginTop: "var(--sp-12)" }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={Math.max(0, score)}
        aria-label="Password strength"
        style={{
          height: 6,
          width: "100%",
          borderRadius: "var(--r-sm)",
          background: "var(--bg-soft)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background:
              score >= 3
                ? "var(--brand-gold)"
                : score >= 2
                  ? "var(--brand-orange)"
                  : "var(--muted)",
            transition: "width 120ms ease-out",
          }}
        />
      </div>
      <p
        id="password-strength"
        aria-live="polite"
        style={{
          marginTop: "var(--sp-8)",
          fontSize: "var(--fs-body-sm)",
          color: "var(--muted)",
          fontFamily: "DM Mono, monospace",
          letterSpacing: "0.08em",
        }}
      >
        Strength: {label.length > 0 ? label : "—"}
      </p>
    </div>
  );
}
