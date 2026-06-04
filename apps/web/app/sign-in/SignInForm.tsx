"use client";

/**
 * apps/web/app/sign-in/SignInForm.tsx
 *
 * Client form. Reads `?check_email=1` and `?next=/path` from search params.
 * Wires to the existing signInAction (unchanged shape).
 *
 * Note: the TOTP field is collected by the existing action for forward
 * compatibility but is auto-routed through /sign-in/totp if the user has
 * an enrolled factor. We don't show it on this surface; instead the action
 * redirects to /sign-in/totp when a 2FA factor is enrolled.
 */

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";

import { authStyles as s } from "@/components/auth/AuthLayout";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { PasswordField } from "@/components/auth/PasswordField";

import { signInAction, type SignInResult } from "./action";

export function SignInForm(): React.ReactElement {
  const params = useSearchParams();
  const checkEmail = params.get("check_email") === "1";
  const passwordReset = params.get("reset") === "1";
  const verified = params.get("verified") === "1";
  const next = params.get("next") ?? "";

  const [state, formAction, pending] = useActionState<
    SignInResult | null,
    FormData
  >(signInAction, null);

  return (
    <>
      <GoogleButton />
      <div className={s.divider}>
        <span>or</span>
      </div>

      {checkEmail ? (
        <div className={`${s.banner} ${s.bannerSuccess}`} role="status">
          Check your inbox — we sent you a 6-digit code to verify your email.
        </div>
      ) : null}
      {passwordReset ? (
        <div className={`${s.banner} ${s.bannerSuccess}`} role="status">
          Password updated. Sign in with your new password.
        </div>
      ) : null}
      {verified ? (
        <div className={`${s.banner} ${s.bannerSuccess}`} role="status">
          Email verified. You can sign in now.
        </div>
      ) : null}

      {state !== null && state.ok === false ? (
        <div className={`${s.banner} ${s.bannerError}`} role="alert">
          {state.message}
        </div>
      ) : null}

      <form action={formAction} className={s.fields} noValidate>
        <input type="hidden" name="next" value={next} />

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
          />
        </div>

        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          forgotHref="/forgot-password"
          disabled={pending}
        />

        <button type="submit" className={s.submit} disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className={s.swap}>
        Don&apos;t have an account?
        <a href="/sign-up">Sign up</a>
      </p>
    </>
  );
}
