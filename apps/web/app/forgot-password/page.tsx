/**
 * apps/web/app/forgot-password/page.tsx
 *
 * "I forgot my password" surface. User enters their email; we call
 * supabase.auth.resetPasswordForEmail which sends a Resend-delivered
 * email with a link to /reset-password.
 *
 * Owner: [Vega + Forge]
 */
import { AuthLayout } from "@/components/auth/AuthLayout";

import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage(): React.ReactElement {
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      topbarText="Remembered it?"
      topbarLinkLabel="Back to sign in"
      topbarLinkHref="/sign-in"
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
