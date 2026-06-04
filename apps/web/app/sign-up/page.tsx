/**
 * apps/web/app/sign-up/page.tsx
 *
 * Sign-up surface, split-pane design.
 *
 * Owner: [Vega + Forge]
 */
import { AuthLayout } from "@/components/auth/AuthLayout";

import { SignUpForm } from "./SignUpForm";

export const dynamic = "force-dynamic";

export default function SignUpPage(): React.ReactElement {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your AlterEgo in under a minute."
      topbarText="Have an account?"
      topbarLinkLabel="Sign in"
      topbarLinkHref="/sign-in"
    >
      <SignUpForm />
    </AuthLayout>
  );
}
