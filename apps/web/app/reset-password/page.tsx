/**
 * apps/web/app/reset-password/page.tsx
 *
 * Lands here from the password-reset email. Supabase has already exchanged
 * the recovery token for a session by the time this page renders (via the
 * auth callback). The form just collects the new password and calls
 * supabase.auth.updateUser({ password }).
 *
 * Owner: [Vega + Forge]
 */
import { AuthLayout } from "@/components/auth/AuthLayout";

import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage(): React.ReactElement {
  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Pick something at least 12 characters. Use a passphrase if you can."
      topbarText="Changed your mind?"
      topbarLinkLabel="Back to sign in"
      topbarLinkHref="/sign-in"
    >
      <ResetPasswordForm />
    </AuthLayout>
  );
}
