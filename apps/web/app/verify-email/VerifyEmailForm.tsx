"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { authStyles as s } from "@/components/auth/AuthLayout";

import {
  resendVerifyAction,
  verifyEmailAction,
  type VerifyResult,
} from "./action";

const RESEND_COOLDOWN_S = 30;

export function VerifyEmailForm(): React.ReactElement {
  const params = useSearchParams();
  const emailFromUrl = params.get("email") ?? "";

  const [state, formAction, pending] = useActionState<
    VerifyResult | null,
    FormData
  >(verifyEmailAction, null);

  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resentBanner, setResentBanner] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown === 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async (): Promise<void> => {
    setResentBanner(null);
    const fd = new FormData();
    fd.set("email", emailFromUrl);
    const result = await resendVerifyAction(fd);
    if (result.ok) {
      setResentBanner("Sent. Check your inbox.");
      setCooldown(RESEND_COOLDOWN_S);
    } else {
      setResentBanner(result.message);
    }
  };

  return (
    <>
      {emailFromUrl.length > 0 ? (
        <div className={`${s.banner} ${s.bannerSuccess}`} role="status">
          We sent a 6-digit code to <strong>{emailFromUrl}</strong>.
        </div>
      ) : null}

      {state !== null && state.ok === false ? (
        <div className={`${s.banner} ${s.bannerError}`} role="alert">
          {state.message}
        </div>
      ) : null}

      {resentBanner !== null ? (
        <div className={`${s.banner} ${s.bannerSuccess}`} role="status">
          {resentBanner}
        </div>
      ) : null}

      <form action={formAction} className={s.fields} noValidate>
        <input type="hidden" name="email" value={emailFromUrl} />

        <div className={s.field}>
          <label htmlFor="code">6-digit code</label>
          <input
            id="code"
            ref={codeRef}
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            placeholder="123456"
            required
            disabled={pending}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className={s.otpInput}
          />
        </div>

        <button
          type="submit"
          className={s.submit}
          disabled={pending || code.length !== 6}
        >
          {pending ? "Verifying…" : "Verify email"}
        </button>
      </form>

      <p className={s.swap}>
        Didn&apos;t get it?
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || emailFromUrl.length === 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </p>

      <p className={`${s.swap}`} style={{ marginTop: 8 }}>
        <a href="/sign-in">Back to sign in</a>
      </p>
    </>
  );
}
