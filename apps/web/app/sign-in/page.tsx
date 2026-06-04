/**
 * apps/web/app/sign-in/page.tsx
 *
 * Sign-in surface, split-pane design.
 *
 * Owner: [Vega + Forge]
 */
import { Suspense } from "react";

import { AuthLayout } from "@/components/auth/AuthLayout";

import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default function SignInPage(): React.ReactElement {
  return (
    <Suspense fallback={<main id="main" />}>
      <AuthLayout
        title="Welcome back"
        subtitle="Sign in to pick up where your AlterEgo left off."
        topbarText="New here?"
        topbarLinkLabel="Create an account"
        topbarLinkHref="/sign-up"
      >
        <SignInForm />
      </AuthLayout>
    </Suspense>
  );
}
