/**
 * apps/web/app/app/page.tsx
 *
 * /app landing — Phase 1.0 placeholder.
 *
 * Once a signed-in user passes middleware (auth + email verified + 2FA),
 * they land here. Sprint D will replace this with the AlterEgo dashboard.
 * Until then, this is a directory of the operator-facing surfaces that
 * already exist so the user has somewhere to go after sign-in.
 *
 * Owner: [Arch + Forge]
 */
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth-helpers";

type Card = {
  href: string;
  title: string;
  desc: string;
  state: "available" | "wired-soon";
};

const CARDS: ReadonlyArray<Card> = [
  {
    href: "/app/onboarding/totp",
    title: "Enroll 2FA",
    desc: "Add a TOTP factor — required before AlterEgo touches anything outside the browser.",
    state: "available",
  },
  {
    href: "/app/settings/security",
    title: "Security",
    desc: "Manage 2FA factors, WebAuthn keys, active sessions, revoke devices.",
    state: "available",
  },
  {
    href: "/app/settings/data",
    title: "Privacy & data",
    desc: "Export everything we have on you (GDPR Art. 20) or delete your tenant (Art. 17).",
    state: "available",
  },
  {
    href: "/app/chat",
    title: "Chat with AlterEgo",
    desc: "Open a thread and put it to work — triage your inbox, draft a reply, surface what changed.",
    state: "available",
  },
  {
    href: "#",
    title: "Sub-agents",
    desc: "Mailroom · Scheduler · Scribe · Oracle · Treasurer · Voice · Companion.",
    state: "wired-soon",
  },
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
        maxWidth: "920px",
        margin: "0 auto",
        padding: "var(--sp-48) var(--sp-16)",
      }}
    >
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
          marginBottom: "var(--sp-24)",
          color: "rgba(255, 250, 245, 0.98)",
          textShadow: "0 1px 2px rgba(0,0,0,0.4)",
        }}
      >
        Your AlterEgo is being assembled.
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "rgba(255, 245, 235, 0.88)",
          marginBottom: "var(--sp-40)",
          maxWidth: "640px",
          textShadow: "0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        Phase 1.0 foundation is live. The orchestrator + sub-agents ship in
        Sprint D. In the meantime, here&apos;s what already works.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--sp-16)",
        }}
      >
        {CARDS.map((c) => {
          const isLive = c.state === "available";
          const inner = (
            <div
              className="app-shell-card"
              style={{
                padding: "var(--sp-24)",
                height: "100%",
              }}
            >
              <h2
                style={{
                  fontSize: "var(--fs-h-step)",
                  marginBottom: "var(--sp-8)",
                  color: "var(--ink)",
                }}
              >
                {c.title}
              </h2>
              <p
                style={{
                  fontSize: "var(--fs-body-sm)",
                  color: "var(--ink-soft)",
                  margin: 0,
                }}
              >
                {c.desc}
              </p>
              {!isLive && (
                <p
                  style={{
                    marginTop: "var(--sp-12)",
                    fontFamily: "DM Mono, monospace",
                    fontSize: "var(--fs-mono-meta)",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--brand-red)",
                    fontWeight: 600,
                  }}
                >
                  Coming · Sprint D
                </p>
              )}
            </div>
          );
          return isLive ? (
            <Link
              key={c.title}
              href={c.href}
              style={{ textDecoration: "none" }}
            >
              {inner}
            </Link>
          ) : (
            <div key={c.title}>{inner}</div>
          );
        })}
      </div>
    </main>
  );
}
