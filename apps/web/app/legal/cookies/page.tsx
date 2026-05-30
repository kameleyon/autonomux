/**
 * apps/web/app/legal/cookies/page.tsx
 *
 * Cookie Policy â€” the full disclosure of every cookie autonomux sets.
 * Maintained by [Comply]. Update LAST_UPDATED and add a row whenever a
 * new cookie ships. Preflight will not catch missing rows â€” this is a
 * trust contract, not a lint.
 *
 * Owner: [Comply] Â· Phase 1.0-B9
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie policy",
  description:
    "Every cookie autonomux sets, what it does, how long it lives, and whether you can turn it off.",
};

const LAST_UPDATED = "2026-05-29";

type Category = "Necessary" | "Analytics" | "Marketing";

interface CookieRow {
  name: string;
  purpose: string;
  ttl: string;
  category: Category;
  party: "First-party" | "Third-party";
  notes?: string;
}

const COOKIES: CookieRow[] = [
  {
    name: "autonomux_consent_v1",
    purpose:
      "Stores your cookie preferences. Without it the banner would ask you again every page load.",
    ttl: "12 months",
    category: "Necessary",
    party: "First-party",
    notes: "Readable by client and server. Not HttpOnly by design.",
  },
  {
    name: "sb-access-token",
    purpose: "Signed-in session â€” issued by Supabase Auth.",
    ttl: "1 hour (refreshed automatically)",
    category: "Necessary",
    party: "First-party",
    notes: "HttpOnly. Secure. SameSite=Lax.",
  },
  {
    name: "sb-refresh-token",
    purpose: "Renews your session so you don't have to sign in every hour.",
    ttl: "30 days (rolling)",
    category: "Necessary",
    party: "First-party",
    notes: "HttpOnly. Secure. SameSite=Lax.",
  },
  {
    name: "csrf_token",
    purpose:
      "Protects form submissions from cross-site request forgery (OWASP A01).",
    ttl: "Session",
    category: "Necessary",
    party: "First-party",
    notes: "HttpOnly. Secure. SameSite=Strict.",
  },
];

export default function CookiePolicyPage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <h1 style={{ fontSize: "var(--fs-display-s)" }}>Cookie policy</h1>
      <p
        style={{
          color: "var(--muted)",
          fontFamily: "DM Mono, monospace",
          fontSize: "var(--fs-mono-meta)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          marginTop: "var(--sp-4)",
          marginBottom: "var(--sp-32)",
        }}
      >
        Last updated Â· {LAST_UPDATED}
      </p>

      <Section title="What a cookie is, in plain English.">
        <p>
          A cookie is a small piece of text your browser stores for us. We
          read it back when you return so we can keep you signed in, remember
          your preferences, and (if you let us) understand which parts of the
          product get used.
        </p>
        <p>
          We sort cookies into three categories.{" "}
          <strong>Necessary</strong> cookies fire without asking â€” without
          them you can't sign in.{" "}
          <strong>Analytics</strong> and <strong>marketing</strong> cookies
          only fire after you say yes on the banner or in{" "}
          <Link href="/settings/consent">cookie settings</Link>.
        </p>
      </Section>

      <Section title="The full list.">
        <CookieTable rows={COOKIES} />
        <p
          style={{
            fontSize: "var(--fs-body-sm)",
            color: "var(--muted)",
            marginTop: "var(--sp-16)",
          }}
        >
          We do not currently set any analytics or marketing cookies. When
          we add them, they will appear in this table before they ship.
        </p>
      </Section>

      <Section title="Changing your mind.">
        <p>
          Open <Link href="/settings/consent">cookie settings</Link> at any
          time. Save your new choice â€” that&apos;s it. We do not require an
          email or a support ticket to withdraw consent (GDPR Art. 7(3)).
        </p>
      </Section>

      <Section title="If we change this policy.">
        <p>
          We will bump <code>LAST_UPDATED</code> and, if the change is
          material, we will reset the consent cookie so the banner asks
          again. You are never silently re-consented.
        </p>
      </Section>

      <Section title="Questions.">
        <p>
          Email <a href="mailto:privacy@autonomux.io">privacy@autonomux.io</a>
          . We try to reply within two business days.
        </p>
      </Section>
    </main>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Section(props: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={{ marginBottom: "var(--sp-40)" }}>
      <h2
        style={{
          fontSize: "var(--fs-h-card)",
          marginBottom: "var(--sp-12)",
        }}
      >
        {props.title}
      </h2>
      <div
        style={{
          fontSize: "var(--fs-body)",
          lineHeight: "var(--lh-body)",
          color: "var(--ink-soft)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-12)",
          maxWidth: "72ch",
        }}
      >
        {props.children}
      </div>
    </section>
  );
}

function CookieTable(props: { rows: CookieRow[] }): React.ReactElement {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--fs-body-sm)",
          color: "var(--ink-soft)",
        }}
      >
        <thead>
          <tr style={{ textAlign: "left", background: "var(--surface)" }}>
            <Th>Name</Th>
            <Th>Purpose</Th>
            <Th>Category</Th>
            <Th>Lifetime</Th>
            <Th>Party</Th>
            <Th>Notes</Th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr
              key={row.name}
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Td>
                <code
                  style={{
                    fontFamily: "DM Mono, monospace",
                    fontSize: "var(--fs-mono-data)",
                  }}
                >
                  {row.name}
                </code>
              </Td>
              <Td>{row.purpose}</Td>
              <Td>{row.category}</Td>
              <Td>{row.ttl}</Td>
              <Td>{row.party}</Td>
              <Td>{row.notes ?? "â€”"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th(props: { children: React.ReactNode }): React.ReactElement {
  return (
    <th
      style={{
        padding: "var(--sp-12) var(--sp-12)",
        fontWeight: 600,
        color: "var(--ink)",
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </th>
  );
}

function Td(props: { children: React.ReactNode }): React.ReactElement {
  return (
    <td
      style={{
        padding: "var(--sp-12) var(--sp-12)",
        verticalAlign: "top",
      }}
    >
      {props.children}
    </td>
  );
}
