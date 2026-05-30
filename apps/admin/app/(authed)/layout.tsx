/**
 * AppShell — authed layout for the admin cpanel.
 *
 * Phase 1.0-A scaffold. Owns the single <main id="main"> landmark; child
 * (authed) pages MUST NOT render their own <main>. Auth gating, sign-out
 * wiring, and session middleware land in Phase 1.0-B.
 */
import Image from "next/image";
import Link from "next/link";

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/", label: "Dashboard" },
  { href: "/tenants", label: "Tenants" },
  { href: "/costs", label: "Costs" },
  { href: "/integrations", label: "Integrations" },
  { href: "/queue", label: "Queue" },
  { href: "/audit-log", label: "Audit log" },
  { href: "/activity", label: "Activity" },
  { href: "/compliance", label: "Compliance" },
  { href: "/billing", label: "Billing" },
  { href: "/feature-flags", label: "Feature flags" },
  { href: "/support", label: "Support" },
  { href: "/health", label: "Health" },
];

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="adm-shell">
      <header className="adm-shell__header">
        <Link
          href="/dashboard"
          aria-label="Autonomux admin home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-12)",
            textDecoration: "none",
          }}
        >
          <Image
            src="/logo.png"
            alt=""
            width={32}
            height={32}
            priority
          />
          <span className="adm-brand">
            Autonom<em>ux</em> Admin
          </span>
        </Link>
        <button
          type="button"
          className="adm-cta adm-cta--ghost"
          aria-label="Sign out (wires in Phase 1.0-B)"
          disabled
        >
          Sign out
        </button>
      </header>

      <nav
        className="adm-shell__sidebar"
        aria-label="Admin sections"
      >
        <ul className="adm-nav">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link className="adm-nav__link" href={item.href}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Jury F-Halo-01 fix 2026-05-29: tabIndex={-1} makes the skip-link
       *  target programmatically focusable across Safari/Firefox/Chromium.
       *  Without it, `#main` jumps scroll but the user's keyboard focus
       *  stays on the skip link. */}
      <main id="main" tabIndex={-1} className="adm-shell__main">
        {children}
      </main>
    </div>
  );
}
