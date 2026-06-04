"use client";

/**
 * apps/web/components/auth/PasswordField.tsx
 *
 * Password input with show/hide toggle. Reusable across sign-in, sign-up,
 * and reset-password forms.
 */

import { useState } from "react";

import { authStyles as s } from "./AuthLayout";

export interface PasswordFieldProps {
  readonly id?: string;
  readonly name: string;
  readonly label: string;
  readonly autoComplete: "current-password" | "new-password";
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly forgotHref?: string;
  readonly disabled?: boolean;
}

export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  placeholder = "••••••••",
  required = true,
  forgotHref,
  disabled = false,
}: PasswordFieldProps): React.ReactElement {
  const [shown, setShown] = useState(false);
  const inputId = id ?? `pw-${name}`;

  return (
    <div className={s.field}>
      <div className={s.fieldRow}>
        <label htmlFor={inputId}>{label}</label>
        {forgotHref !== undefined ? (
          <a className={s.fieldLink} href={forgotHref}>
            Forgot password?
          </a>
        ) : null}
      </div>
      <div className={s.pwWrap}>
        <input
          id={inputId}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          minLength={autoComplete === "new-password" ? 12 : undefined}
        />
        <button
          type="button"
          className={s.pwToggle}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
          tabIndex={-1}
        >
          {shown ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-10-7-10-7a18.45 18.45 0 014.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 10 7 10 7a18.5 18.5 0 01-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
