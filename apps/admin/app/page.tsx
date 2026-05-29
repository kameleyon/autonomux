/**
 * Admin landing — Phase 1.0-A scaffold.
 *
 * This is the unauthenticated entry point. The only thing you can do
 * from here is move to /sign-in. Real auth wires in Phase 1.0-B.
 */
import Image from "next/image";
import Link from "next/link";

export default function AdminLandingPage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-12)",
          marginBottom: "var(--sp-48)",
        }}
      >
        <Image
          src="/logo.png"
          alt="Autonomux"
          width={44}
          height={44}
          priority
        />
        <div className="adm-brand">
          Autonom<em>ux</em> Admin
        </div>
      </header>

      <section
        style={{
          maxWidth: "640px",
          marginTop: "var(--sp-32)",
        }}
        aria-labelledby="page-h1"
      >
        <p
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-mono-meta)",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--brand-orange)",
            marginBottom: "var(--sp-16)",
          }}
        >
          Phase 1.0 · Foundation · Scaffold
        </p>
        <h1
          id="page-h1"
          style={{
            fontSize: "var(--fs-display-m)",
            marginBottom: "var(--sp-24)",
          }}
        >
          Autonom<em>ux</em> Admin
        </h1>
        <p
          style={{
            fontSize: "var(--fs-body-lg)",
            color: "var(--ink-soft)",
            marginBottom: "var(--sp-32)",
          }}
        >
          Operator console for tenants, costs, integrations health, queue,
          audit, activity, compliance, billing, feature flags, support, and
          health. Operators only.
        </p>

        <Link
          href="/sign-in"
          className="adm-cta"
          aria-label="Sign in to continue to admin console"
        >
          Sign in to continue
        </Link>

        <p
          style={{
            marginTop: "var(--sp-48)",
            fontSize: "var(--fs-body-sm)",
            color: "var(--muted)",
          }}
        >
          Internal &middot; access restricted to operators.
        </p>
      </section>
    </main>
  );
}
