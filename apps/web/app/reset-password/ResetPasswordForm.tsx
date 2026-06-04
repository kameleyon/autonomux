"use client";

import { useActionState, useEffect, useState } from "react";

import { authStyles as s } from "@/components/auth/AuthLayout";
import { PasswordField } from "@/components/auth/PasswordField";

import {
  resetPasswordAction,
  type ResetPasswordResult,
} from "./action";

export function ResetPasswordForm(): React.ReactElement {
  const [state, formAction, pending] = useActionState<
    ResetPasswordResult | null,
    FormData
  >(resetPasswordAction, null);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  useEffect(() => {
    const a = document.getElementById("pw-newpw") as HTMLInputElement | null;
    const b = document.getElementById("pw-confirmpw") as HTMLInputElement | null;
    const h1 = (): void => setPw1(a?.value ?? "");
    const h2 = (): void => setPw2(b?.value ?? "");
    a?.addEventListener("input", h1);
    b?.addEventListener("input", h2);
    return () => {
      a?.removeEventListener("input", h1);
      b?.removeEventListener("input", h2);
    };
  }, []);

  const mismatch = pw2.length > 0 && pw1 !== pw2;
  const valid = pw1.length >= 12 && pw1 === pw2;

  return (
    <>
      {state !== null && state.ok === false ? (
        <div className={`${s.banner} ${s.bannerError}`} role="alert">
          {state.message}
        </div>
      ) : null}

      <form action={formAction} className={s.fields} noValidate>
        <PasswordField
          id="pw-newpw"
          name="newpw"
          label="New password"
          autoComplete="new-password"
          disabled={pending}
        />
        <PasswordField
          id="pw-confirmpw"
          name="confirmpw"
          label="Confirm new password"
          autoComplete="new-password"
          disabled={pending}
        />

        {mismatch ? (
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: "#b81f00",
              fontWeight: 500,
            }}
          >
            Passwords don&apos;t match.
          </p>
        ) : null}

        <button
          type="submit"
          className={s.submit}
          disabled={pending || !valid}
        >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>

      <p className={s.swap}>
        <a href="/sign-in">Back to sign in</a>
      </p>
    </>
  );
}
