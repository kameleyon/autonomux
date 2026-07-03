/**
 * apps/web/app/docs/page.tsx
 *
 * Docs section — native, warm-only palette matching the landing. This is the
 * docs TEMPLATE shell (top bar + sticky sidebar nav + content column) with a
 * starter Overview page. Content sections are anchors so the sidebar scrolls
 * to them. Linked from the landing nav ("Docs").
 *
 * (The Claude Design `Docs.html` can be swapped in later once the design-MCP
 * scope is granted; this keeps the section shippable now.)
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { DocsSidebarToggle } from "./DocsSidebarToggle";
import "./docs.css";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How autonomux works — your AlterEgo, the sub-agents, accountability, and getting started.",
};

const NAV = [
  {
    label: "Start here",
    items: [
      { href: "#overview", text: "Overview" },
      { href: "#getting-started", text: "Getting started" },
      { href: "#accountability", text: "Accountability" },
    ],
  },
  {
    label: "The agents",
    items: [
      { href: "#alterego", text: "Your AlterEgo" },
      { href: "#sub-agents", text: "Sub-agents" },
      { href: "#autoroom", text: "AutoRoom" },
    ],
  },
  {
    label: "Reference",
    items: [
      { href: "#privacy", text: "Privacy & data" },
      { href: "#pricing", text: "Plans" },
    ],
  },
];

export default function DocsPage(): React.ReactElement {
  return (
    <div className="dx">
      {/* top bar */}
      <header className="dx__bar">
        <Link className="dx__brand" href="/">
          <Image src="/logowhite.png" alt="autonomux" width={30} height={30} />
          <span className="dx__brand-word">
            autonom<em>ux</em>
          </span>
        </Link>
        <span className="dx__bar-sep" aria-hidden="true">
          /
        </span>
        <span className="dx__bar-title">Docs</span>
        <span className="dx__bar-spacer" />
        <Link className="dx__bar-home" href="/">
          Back to site
        </Link>
      </header>

      <div className="dx__shell">
        {/* sidebar */}
        <DocsSidebarToggle>
          {NAV.map((group) => (
            <div className="dx__side-group" key={group.label}>
              <div className="dx__side-label">{group.label}</div>
              {group.items.map((it, i) => (
                <a
                  key={it.href}
                  className={
                    "dx__side-link" +
                    (group.label === "Start here" && i === 0
                      ? " dx__side-link--active"
                      : "")
                  }
                  href={it.href}
                >
                  {it.text}
                </a>
              ))}
            </div>
          ))}
        </DocsSidebarToggle>

        {/* content */}
        <main className="dx__main">
          <div className="dx__eyebrow">Documentation</div>
          <h1 className="dx__h1">
            How your <em>AlterEgo</em> works.
          </h1>
          <p className="dx__lede">
            autonomux is a personal AI orchestrator that acts on your behalf
            across email, calendar, money, and writing — under explicit, audited
            control. This guide walks through what it does and how to trust it
            with the real stuff.
          </p>

          <div className="dx__cards">
            <a className="dx__card" href="#getting-started">
              <div className="dx__card-title">Getting started</div>
              <div className="dx__card-desc">
                Create your account, connect Gmail and Calendar, and get your
                first morning briefing.
              </div>
            </a>
            <a className="dx__card" href="#accountability">
              <div className="dx__card-title">Accountability</div>
              <div className="dx__card-desc">
                The confirmation gate, reversible actions, and the signed audit
                log — how control stays with you.
              </div>
            </a>
          </div>

          <h2 className="dx__h2" id="overview">
            Overview
          </h2>
          <p className="dx__p">
            You always talk to one AlterEgo — a second self with more time, a
            longer memory, and a way into your digital life. Behind it, a roster
            of specialists (the sub-agents) do the work. You never manage them
            directly.
          </p>
          <p className="dx__p">
            Everything reversible runs on its own. Anything irreversible —
            sending mail, paying a bill, publishing — waits for your explicit
            yes, unless you&apos;ve set a trusted rule for it.
          </p>

          <h2 className="dx__h2" id="getting-started">
            Getting started
          </h2>
          <ol className="dx__ul">
            <li className="dx__li">
              <Link href="/sign-up">Create an account</Link> and verify your
              email.
            </li>
            <li className="dx__li">
              Connect Gmail and Google Calendar (read-only to start).
            </li>
            <li className="dx__li">
              Open the app and ask AlterEgo to triage your inbox or read your
              day — or wait for your <code className="dx__code">6 AM</code>{" "}
              morning briefing.
            </li>
          </ol>
          <div className="dx__note">
            AlterEgo never sends, pays, or publishes without your confirmation on
            the first run. Trust is earned per action class.
          </div>

          <h2 className="dx__h2" id="accountability">
            Accountability
          </h2>
          <p className="dx__p">
            Accountability isn&apos;t a feature bolted on — it&apos;s the
            foundation the whole agent stands on. Three guarantees:
          </p>
          <ul className="dx__ul">
            <li className="dx__li">
              <strong>Signed, tamper-evident audit log.</strong> Every write to
              your data is chained with a cryptographic hash you can replay and
              verify.
            </li>
            <li className="dx__li">
              <strong>Confirmation gate on anything irreversible.</strong>{" "}
              Sending, paying, publishing — none happen without your explicit
              yes.
            </li>
            <li className="dx__li">
              <strong>Encrypted, per-tenant, never shared.</strong> Your memory
              is encrypted at rest with your own key and never used to train
              across accounts.
            </li>
          </ul>

          <h2 className="dx__h2" id="alterego">
            Your AlterEgo
          </h2>
          <p className="dx__p">
            AlterEgo is the single relationship you manage. It briefs you,
            proposes actions with its reasoning shown, waits for your approval on
            anything irreversible, then acts and logs the result.
          </p>

          <h2 className="dx__h2" id="sub-agents">
            Sub-agents
          </h2>
          <p className="dx__p">The specialists behind your AlterEgo:</p>
          <ul className="dx__ul">
            <li className="dx__li">
              <strong>Mailroom</strong> — ranks your inbox, drafts replies in
              your voice, archives the noise.
            </li>
            <li className="dx__li">
              <strong>Scheduler</strong> — watches for conflicts, proposes slots,
              drafts declines.
            </li>
            <li className="dx__li">
              <strong>Scribe</strong> — turns notes into drafts that sound like
              you.
            </li>
            <li className="dx__li">
              <strong>Treasurer</strong> — bank balance, upcoming bills, honest
              spend insight.
            </li>
            <li className="dx__li">
              <strong>Oracle</strong> — a daily reading, rendered fresh with your
              date context.
            </li>
          </ul>

          <h2 className="dx__h2" id="autoroom">
            AutoRoom
          </h2>
          <p className="dx__p">
            Standing automations that run on a trigger — a schedule or an event —
            through a trust tier you set, from Observe (shows what it would do)
            up to Full autonomy (executes silently, trusted-action rules only).
          </p>

          <h2 className="dx__h2" id="privacy">
            Privacy &amp; data
          </h2>
          <p className="dx__p">
            Your memory lives in your own tenant, encrypted at rest, and is never
            used to train across accounts. You can export or delete it at any
            time.
          </p>
          <div className="dx__note">
            Do not paste patient information into AlterEgo. We are not a covered
            entity and do not accept PHI.
          </div>

          <h2 className="dx__h2" id="pricing">
            Plans
          </h2>
          <p className="dx__p">
            Start free and grow into your full AlterEgo — see{" "}
            <Link href="/#pricing">pricing</Link> for the current tiers.
          </p>
        </main>
      </div>
    </div>
  );
}
