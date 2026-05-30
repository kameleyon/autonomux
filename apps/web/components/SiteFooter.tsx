/**
 * apps/web/components/SiteFooter.tsx
 *
 * Site footer â€” links to legal + trust surfaces. Server component, no
 * client-side JS. Wired into the root layout so every public page surfaces
 * the trust pages (Security, AI System Card, Subprocessors, etc.).
 *
 * Owner: [Comply + Herald] Â· Phase 1.0-C10
 */
import Link from "next/link";

const COLS: ReadonlyArray<{
  heading: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}> = [
  {
    heading: "Product",
    links: [
      { href: "/", label: "Overview" },
      { href: "/system-card", label: "AI system card" },
    ],
  },
  {
    heading: "Trust",
    links: [
      { href: "/security", label: "Security" },
      { href: "/legal/subprocessors", label: "Subprocessors" },
      { href: "/accessibility", label: "Accessibility" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms of service" },
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/cookies", label: "Cookie policy" },
      { href: "/legal/dpa", label: "Data processing addendum" },
      { href: "/legal/dmca", label: "DMCA" },
    ],
  },
  {
    heading: "Contact",
    links: [
      { href: "mailto:hello@autonomux.io", label: "hello@autonomux.io" },
      { href: "mailto:security@autonomux.io", label: "security@autonomux.io" },
      { href: "mailto:privacy@autonomux.io", label: "privacy@autonomux.io" },
    ],
  },
];

export function SiteFooter(): React.ReactElement {
  return (
    <footer
      role="contentinfo"
      style={{
        position: "relative",
        zIndex: 1,
        borderTop: "1px solid var(--border)",
        marginTop: "var(--sp-64)",
        background: "var(--surface)",
      }}
    >
      <div
        className="wrap"
        style={{
          paddingTop: "var(--sp-48)",
          paddingBottom: "var(--sp-48)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--sp-32)",
            marginBottom: "var(--sp-32)",
          }}
        >
          {COLS.map((col) => (
            <div key={col.heading}>
              <h2
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "var(--fs-mono-meta)",
                  letterSpacing: "0.24em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: "var(--sp-16)",
                  fontWeight: 500,
                }}
              >
                {col.heading}
              </h2>
              <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--sp-8)",
                }}
              >
                {col.links.map((link) => {
                  const isMail = link.href.startsWith("mailto:");
                  return (
                    <li key={link.href}>
                      {isMail ? (
                        <a
                          href={link.href}
                          style={{
                            fontSize: "var(--fs-body-sm)",
                            color: "var(--ink-soft)",
                          }}
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          style={{
                            fontSize: "var(--fs-body-sm)",
                            color: "var(--ink-soft)",
                          }}
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div
          style={{
            paddingTop: "var(--sp-24)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: "var(--sp-12)",
            fontSize: "var(--fs-mono-meta)",
            fontFamily: "DM Mono, monospace",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          <span>Â© {new Date().getFullYear()} Autonomux, Inc.</span>
          <span>Made with care Â· Delaware, USA</span>
        </div>
      </div>
    </footer>
  );
}
