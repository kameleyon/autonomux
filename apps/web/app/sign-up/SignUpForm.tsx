"use client";

/**
 * apps/web/app/sign-up/SignUpForm.tsx
 *
 * Client form. Runs zxcvbn in-browser for a live strength meter (server
 * re-scores on submit). On success, the action redirects to /verify-email.
 */

import { useActionState, useEffect, useMemo, useState } from "react";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import * as zxcvbnEnglish from "@zxcvbn-ts/language-en";

import { authStyles as s } from "@/components/auth/AuthLayout";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { PasswordField } from "@/components/auth/PasswordField";

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
const STRENGTH_COLORS = [
  "#b81f00",
  "#d35a1a",
  "#e3a317",
  "#5ea342",
  "#2d7a3a",
] as const;

export function SignUpForm(): React.ReactElement {
  const [state, formAction, pending] = useActionState<
    SignUpResult | null,
    FormData
  >(signUpAction, null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const strength = useMemo(() => {
    if (password.length === 0) {
      return { score: 0, warning: "", suggestions: [] as string[] };
    }
    const inputs = [email, email.split("@")[0] ?? ""].filter(
      (v) => v.length > 0,
    );
    const r = zxcvbn(password, inputs);
    return {
      score: r.score as 0 | 1 | 2 | 3 | 4,
      warning: r.feedback.warning ?? "",
      suggestions: r.feedback.suggestions,
    };
  }, [password, email]);

  // Track form inputs (read uncontrolled defaults if SSR back-fills later).
  useEffect(() => {
    const emailEl = document.getElementById("email") as HTMLInputElement | null;
    const pwEl = document.getElementById("pw-password") as HTMLInputElement | null;
    if (emailEl !== null && emailEl.value !== email) setEmail(emailEl.value);
    if (pwEl !== null && pwEl.value !== password) setPassword(pwEl.value);
  }, [email, password]);

  return (
    <>
      <GoogleButton />
      <div className={s.divider}>
        <span>or</span>
      </div>

      {state !== null && state.ok === false ? (
        <div className={`${s.banner} ${s.bannerError}`} role="alert">
          {state.message}
          {state.passwordWarning !== undefined &&
          state.passwordWarning.length > 0 ? (
            <div style={{ marginTop: 4, fontSize: 12.5, opacity: 0.85 }}>
              {state.passwordWarning}
            </div>
          ) : null}
        </div>
      ) : null}

      <form action={formAction} className={s.fields} noValidate>
        {/* Honeypot — real users leave empty */}
        <input
          type="text"
          name="hp"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-9999px",
            width: 1,
            height: 1,
            opacity: 0,
          }}
        />

        <div className={s.field}>
          <label htmlFor="name">Full name</label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            disabled={pending}
          />
        </div>

        <div className={s.field}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            disabled={pending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <PasswordField
          name="password"
          label="Password"
          autoComplete="new-password"
          disabled={pending}
        />

        {/* Strength meter (live, debounced via React batching) */}
        {password.length > 0 ? (
          <div
            aria-live="polite"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <div
              style={{
                height: 4,
                background: "#ece3d6",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${((strength.score + 1) / 5) * 100}%`,
                  background: STRENGTH_COLORS[strength.score],
                  transition: "width 150ms, background 150ms",
                }}
              />
            </div>
            <p
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: STRENGTH_COLORS[strength.score],
                margin: 0,
              }}
            >
              {STRENGTH_LABELS[strength.score]}
              {strength.score < 3 ? " — aim for at least Good" : ""}
            </p>
          </div>
        ) : null}

        {/* Hidden field for password binding to React state */}
        <input
          type="hidden"
          name="__pwsync"
          value={password}
          onChange={() => undefined}
        />

        <button type="submit" className={s.submit} disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className={s.terms}>
        By creating an account you agree to our{" "}
        <a href="/legal/terms">Terms</a> and{" "}
        <a href="/legal/privacy">Privacy Policy</a>.
      </p>

      <p className={s.swap}>
        Already have an account?
        <a href="/sign-in">Sign in</a>
      </p>

      {/* Bind the password input value into our React state for the meter.
          Uses a small effect because PasswordField is its own component. */}
      <PasswordSync onChange={setPassword} />
    </>
  );
}

/** Bridges the PasswordField's internal input value into the parent state. */
function PasswordSync({
  onChange,
}: {
  onChange: (v: string) => void;
}): null {
  useEffect(() => {
    const el = document.getElementById("pw-password") as HTMLInputElement | null;
    if (el === null) return;
    const handler = (): void => onChange(el.value);
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, [onChange]);
  return null;
}
