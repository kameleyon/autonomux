/**
 * apps/web/app/app/page.tsx
 *
 * /app landing — the post-sign-in surface.
 *
 * Layout: a single hero (chat with AlterEgo) leads, three secondary cards
 * sit beneath it (integrations, sub-agents, privacy), and a thin footer row
 * of small text links handles the settings nav. The asymmetric grid does
 * the visual hierarchy work — primary action reads as primary at a glance.
 *
 * Owner: [Arch + Forge]
 */
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth-helpers";

type SecondaryCard = {
  readonly href: string;
  readonly title: string;
  readonly desc: string;
  readonly cta: string;
};

const SECONDARY: ReadonlyArray<SecondaryCard> = [
  {
    href: "/app/settings/integrations",
    title: "Integrations",
    desc: "Connect Gmail, Google Calendar, and more so AlterEgo can reach beyond the browser.",
    cta: "Manage connections",
  },
  {
    href: "/app/chat",
    title: "Sub-agents",
    desc: "Mailroom and Scheduler are live. Scribe, Oracle, Treasurer, Voice, and Companion are on deck.",
    cta: "See the roster",
  },
  {
    href: "/app/settings/data",
    title: "Privacy & data",
    desc: "Export everything we hold on you (GDPR Art. 20) or delete your tenant entirely (Art. 17).",
    cta: "Review your data",
  },
];

const FOOTER_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/app/onboarding/totp", label: "Enroll 2FA" },
  { href: "/app/settings/security", label: "Security settings" },
];

export default async function AppHomePage(): Promise<React.ReactElement> {
  const supabase = await createClient();
  const user = await requireAuth(supabase);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="wrap"
      style={{
        maxWidth: "1040px",
        margin: "0 auto",
        padding: "var(--sp-48) var(--sp-24)",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <p
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: "var(--fs-mono-meta)",
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: "rgba(255, 250, 245, 0.92)",
          marginBottom: "var(--sp-12)",
          textShadow: "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        Signed in &middot; {user.email}
      </p>
      <h1
        style={{
          fontSize: "var(--fs-display-m)",
          marginBottom: "var(--sp-16)",
          color: "rgba(255, 250, 245, 0.98)",
          textShadow: "0 1px 2px rgba(0,0,0,0.4)",
          lineHeight: 1.08,
        }}
      >
        Your <em style={{ fontStyle: "italic" }}>AlterEgo</em> is ready.
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "rgba(255, 245, 235, 0.9)",
          marginBottom: "var(--sp-40)",
          maxWidth: "680px",
          textShadow: "0 1px 2px rgba(0,0,0,0.3)",
          lineHeight: 1.5,
        }}
      >
        Mailroom and Scheduler are wired. Scribe, Oracle, Treasurer, Voice,
        and Companion follow. Open a thread to put any of them to work.
      </p>

      {/* ── Hero card: Chat ───────────────────────────────────────── */}
      <Link
        href="/app/chat"
        style={{ textDecoration: "none", display: "block" }}
      >
        <div
          className="app-shell-card"
          style={{
            padding: "36px 40px",
            marginBottom: "var(--sp-24)",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
            gap: "32px",
            minHeight: "180px",
            overflow: "hidden",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: "var(--fs-mono-meta)",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--brand-orange)",
                margin: 0,
                marginBottom: "10px",
              }}
            >
              Start here
            </p>
            <h2
              style={{
                fontSize: "var(--fs-display-s)",
                color: "var(--ink)",
                margin: 0,
                marginBottom: "10px",
                lineHeight: 1.15,
              }}
            >
              Chat with{" "}
              <em style={{ fontStyle: "italic", color: "var(--brand-orange)" }}>
                AlterEgo
              </em>
            </h2>
            <p
              style={{
                fontSize: "var(--fs-body-lg)",
                color: "var(--ink-soft)",
                margin: 0,
                maxWidth: "520px",
                lineHeight: 1.55,
              }}
            >
              Open a thread and put your second self to work — triage your
              inbox, scan today&apos;s calendar, draft a reply, surface what
              changed since you last looked.
            </p>
          </div>
          <div
            aria-hidden="true"
            style={{
              fontSize: "44px",
              color: "var(--brand-orange)",
              fontWeight: 300,
              lineHeight: 1,
              paddingRight: "8px",
              flexShrink: 0,
            }}
          >
            →
          </div>
        </div>
      </Link>

      {/* ── Secondary row ─────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
          gap: "var(--sp-20)",
          marginBottom: "var(--sp-32)",
        }}
      >
        {SECONDARY.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            style={{ textDecoration: "none", display: "block" }}
          >
            <div
              className="app-shell-card"
              style={{
                padding: "26px 28px",
                height: "100%",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <h3
                style={{
                  fontSize: "var(--fs-h-step)",
                  color: "var(--ink)",
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {c.title}
              </h3>
              <p
                style={{
                  fontSize: "var(--fs-body-sm)",
                  color: "var(--ink-soft)",
                  margin: 0,
                  lineHeight: 1.55,
                  flex: 1,
                }}
              >
                {c.desc}
              </p>
              <p
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "var(--fs-mono-meta)",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--brand-orange)",
                  margin: 0,
                  marginTop: "4px",
                }}
              >
                {c.cta} &rarr;
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Footer text links ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--sp-20)",
          alignItems: "center",
          paddingTop: "var(--sp-20)",
          borderTop: "1px solid rgba(255, 250, 245, 0.18)",
        }}
      >
        <span
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-mono-meta)",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255, 250, 245, 0.7)",
          }}
        >
          More
        </span>
        {FOOTER_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              fontSize: "var(--fs-body-sm)",
              color: "rgba(255, 250, 245, 0.85)",
              textDecoration: "underline",
              textDecorationColor: "rgba(255, 250, 245, 0.35)",
              textUnderlineOffset: "3px",
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </main>
  );
}
