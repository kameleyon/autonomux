"use client";

import { useActionState } from "react";

import { authStyles as s } from "@/components/auth/AuthLayout";

import {
  forgotPasswordAction,
  type ForgotPasswordResult,
} from "./action";

export function ForgotPasswordForm(): React.ReactElement {
  const [state, formAction, pending] = useActionState<
    ForgotPasswordResult | null,
    FormData
  >(forgotPasswordAction, null);

  // On success we render a success-only state — the form is replaced.
  if (state !== null && state.ok === true) {
    return (
      <div className={`${s.banner} ${s.bannerSuccess}`} role="status">
        If an account exists for that email, we just sent a reset link. It
        expires in 60 minutes. Check your inbox (and spam folder).
        <p className={s.muted} style={{ marginTop: 10 }}>
          Didn&apos;t arrive? Wait a minute, then try again.
        </p>
      </div>
    );
  }

  return (
    <>
      {state !== null && state.ok === false ? (
        <div className={`${s.banner} ${s.bannerError}`} role="alert">
          {state.message}
        </div>
      ) : null}

      <form action={formAction} className={s.fields} noValidate>
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

        <button type="submit" className={s.submit} disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className={s.swap}>
        Remembered it?
        <a href="/sign-in">Sign in</a>
      </p>
    </>
  );
}
