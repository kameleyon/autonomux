"use client";

/**
 * apps/web/components/auth/GoogleButton.tsx
 *
 * Visual-only "Continue with Google" button. OAuth is not wired in Phase 1.x;
 * the button renders for design parity but is disabled and emits a friendly
 * toast on click ("Coming soon").
 */

import { useState } from "react";

import { authStyles as s } from "./AuthLayout";

export function GoogleButton(): React.ReactElement {
  const [clicked, setClicked] = useState(false);
  return (
    <>
      <button
        type="button"
        className={s.social}
        onClick={() => setClicked(true)}
        aria-disabled="true"
        title="Google sign-in is not yet wired"
      >
        <svg className={s.socialIcon} viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12S6.8 21.5 12 21.5c6 0 9.3-4.2 9.3-9.1 0-.6 0-1-.1-1.5H12z"
          />
        </svg>
        Continue with Google
      </button>
      {clicked ? (
        <p className={s.muted} style={{ marginTop: 6, textAlign: "center" }}>
          Google sign-in is coming soon — use email + password for now.
        </p>
      ) : null}
    </>
  );
}
