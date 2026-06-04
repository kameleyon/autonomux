/**
 * apps/web/app/verify-email/page.tsx
 *
 * Email verification surface. User lands here after signing up; enters the
 * 6-digit code from their inbox. Calls Supabase auth.verifyOtp({ type: 'signup' }).
 *
 * Owner: [Vega + Forge]
 */
import { Suspense } from "react";

import { AuthLayout } from "@/components/auth/AuthLayout";

import { VerifyEmailForm } from "./VerifyEmailForm";

export const dynamic = "force-dynamic";

export default function VerifyEmailPage(): React.ReactElement {
  return (
    <Suspense fallback={<main id="main" />}>
      <AuthLayout
        title="Verify your email"
        subtitle="Enter the 6-digit code we sent you. It expires in 60 minutes."
        topbarText="Wrong email?"
        topbarLinkLabel="Start over"
        topbarLinkHref="/sign-up"
      >
        <VerifyEmailForm />
      </AuthLayout>
    </Suspense>
  );
}
