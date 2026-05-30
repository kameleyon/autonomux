/**
 * apps/web/app/legal/dmca/page.tsx
 *
 * DMCA policy + designated agent + takedown / counter-notice procedure +
 * repeat-infringer policy. Required surface for OCILLA safe-harbour
 * (17 U.S.C. Â§512). Counsel review required before launch; agent
 * registration with the U.S. Copyright Office (eDMCA) must be completed
 * before this page goes live.
 *
 * Owner: [Comply + Herald] Â· Phase 1.0-C10
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DMCA policy",
  description:
    "How to report copyright infringement on Autonomux, how to file a counter-notice, and our repeat-infringer policy.",
};

const LAST_UPDATED = "2026-05-29";
const VERSION = "1.0.0";

export default function DMCAPage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <h1 style={{ fontSize: "var(--fs-display-s)" }}>DMCA policy</h1>
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
        Last updated Â·{" "}
        <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time> Â· v{VERSION}
      </p>

      <CalloutBox>
        Autonomux respects the rights of copyright holders. If you believe
        content stored or processed through our service infringes your
        copyright, please follow the takedown procedure below. Knowingly
        false reports may result in liability under 17 U.S.C. Â§512(f).
      </CalloutBox>

      <Section title="Designated agent.">
        <p>
          Under the Digital Millennium Copyright Act (17 U.S.C. Â§512(c)(2)),
          notifications of claimed infringement should be sent to our
          designated agent:
        </p>
        <address
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-xl)",
            padding: "var(--sp-20) var(--sp-24)",
            fontStyle: "normal",
            lineHeight: "var(--lh-body)",
          }}
        >
          DMCA Designated Agent
          <br />
          Autonomux, Inc.
          <br />
          Postal address â€” to be confirmed before public launch.
          <br />
          Email:{" "}
          <a href="mailto:dmca@autonomux.io">dmca@autonomux.io</a>
          <br />
          Phone â€” to be confirmed before public launch.
        </address>
        <p>
          The agent will be registered with the U.S. Copyright Office via
          the eDMCA system prior to public launch. The registration record
          will be linked here once active.
        </p>
      </Section>

      <Section title="How to file a takedown notice.">
        <p>
          To be effective under Â§512(c)(3), your written notice must
          include all of the following:
        </p>
        <ol style={{ paddingLeft: "var(--sp-24)" }}>
          <li>
            A physical or electronic signature of the copyright owner or a
            person authorised to act on the owner&rsquo;s behalf.
          </li>
          <li>
            Identification of the copyrighted work claimed to have been
            infringed, or â€” for multiple works at a single site â€” a
            representative list.
          </li>
          <li>
            Identification of the material claimed to be infringing,
            described with enough specificity to allow us to locate it
            (URL, account identifier, message identifier, etc.).
          </li>
          <li>
            Your contact information â€” name, postal address, telephone
            number, and email address.
          </li>
          <li>
            A statement that you have a good-faith belief that use of the
            material is not authorised by the copyright owner, its agent,
            or the law.
          </li>
          <li>
            A statement, under penalty of perjury, that the information in
            the notice is accurate and that you are authorised to act on
            behalf of the copyright owner.
          </li>
        </ol>
        <p>
          We acknowledge receipt within two business days and act on
          conforming notices within ten business days.
        </p>
      </Section>

      <Section title="Counter-notice.">
        <p>
          If you believe your content was removed in error or
          misidentified, you may file a counter-notice under Â§512(g)(3). It
          must include:
        </p>
        <ol style={{ paddingLeft: "var(--sp-24)" }}>
          <li>Your physical or electronic signature.</li>
          <li>
            Identification of the removed material and the location at
            which it appeared before removal.
          </li>
          <li>
            A statement under penalty of perjury that you have a good-faith
            belief the material was removed as a result of mistake or
            misidentification.
          </li>
          <li>
            Your name, postal address, and telephone number, plus a
            statement that you consent to the jurisdiction of the federal
            district court for the judicial district where your address
            is located (or, if outside the United States, the federal
            district where Autonomux is located), and that you will accept
            service of process from the person who provided the original
            notice or their agent.
          </li>
        </ol>
        <p>
          On receipt of a conforming counter-notice we will forward it to
          the complaining party. Unless they file an action seeking a court
          order against you within ten business days, we will restore the
          material between ten and fourteen business days after receipt.
        </p>
      </Section>

      <Section title="Repeat-infringer policy.">
        <p>
          We will terminate, in appropriate circumstances and at our sole
          discretion, the accounts of users we identify as repeat
          infringers. A repeat infringer is a user against whom we have
          received more than one conforming takedown notice that we acted
          on, or whose conduct otherwise warrants termination on the
          record. Termination decisions are made by a human reviewer with
          documented rationale.
        </p>
      </Section>

      <Section title="Misuse.">
        <p>
          Knowingly material misrepresentation that material is infringing
          (or that material was removed by mistake) creates liability under
          17 U.S.C. Â§512(f) for damages, including costs and attorneys&rsquo;
          fees. Please send accurate notices.
        </p>
      </Section>

      <Section title="Related documents.">
        <ul>
          <li>
            <Link href="/legal/terms">Terms of service</Link>
          </li>
          <li>
            <Link href="/legal/privacy">Privacy policy</Link>
          </li>
        </ul>
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
          maxWidth: "78ch",
        }}
      >
        {props.children}
      </div>
    </section>
  );
}

function CalloutBox(props: { children: React.ReactNode }): React.ReactElement {
  return (
    <aside
      role="note"
      style={{
        padding: "var(--sp-16) var(--sp-20)",
        background: "var(--surface-warm)",
        border: "1px solid var(--brand-amber)",
        borderRadius: "var(--r-xl)",
        marginBottom: "var(--sp-32)",
        fontSize: "var(--fs-body-sm)",
        color: "var(--ink-soft)",
      }}
    >
      {props.children}
    </aside>
  );
}
