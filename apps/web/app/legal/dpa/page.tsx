/**
 * apps/web/app/legal/dpa/page.tsx
 *
 * Data Processing Agreement â€” landing page. Describes the agreement,
 * lists what it covers, and (for now) shows a placeholder for the
 * downloadable PDF. The PDF generator ships later in Phase 1.0-B12.
 *
 * Owner: [Comply] Â· Phase 1.0-B9
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description:
    "If you process personal data of EU/UK residents through Autonomux, this is the DPA you sign to satisfy GDPR Art. 28.",
};

const LAST_UPDATED = "2026-05-29";

export default function DPAPage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <h1 style={{ fontSize: "var(--fs-display-s)" }}>
        Data Processing Agreement
      </h1>
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

      <CalloutBox>
        If your use of Autonomux involves personal data of EU, UK, or
        Swiss residents, GDPR Art. 28 requires a written contract between
        controller (you) and processor (us). This page describes ours.
      </CalloutBox>

      <Section title="What this DPA covers.">
        <ul>
          <li>Subject matter and duration of processing.</li>
          <li>Nature and purpose of processing.</li>
          <li>Categories of data subjects and personal data.</li>
          <li>Our obligations as processor (Art. 28(3)).</li>
          <li>
            Sub-processor list (see{" "}
            <Link href="/legal/privacy">Privacy Policy</Link>) and 30-day
            change notice.
          </li>
          <li>Security measures (Annex II to the SCCs).</li>
          <li>
            International transfers â€” EU Standard Contractual Clauses
            (2021/914) and the UK International Data Transfer Addendum.
          </li>
          <li>Audit and inspection rights.</li>
          <li>Data subject rights and assistance.</li>
          <li>
            Breach notification â€” within 72 hours of becoming aware (GDPR
            Art. 33).
          </li>
          <li>Return or deletion of data on termination.</li>
        </ul>
      </Section>

      <Section title="How to sign.">
        <p>
          For most accounts the DPA is incorporated by reference into our{" "}
          <Link href="/legal/terms">Terms of Service</Link>. Enterprise
          customers can request a counter-signed PDF and an executed copy
          of the EU SCCs.
        </p>
        <p>
          Email{" "}
          <a href="mailto:legal@autonomux.io">legal@autonomux.io</a> with
          your entity name, the data categories you expect to process, and
          your DPO contact (if you have one) â€” we will send a signature
          packet.
        </p>
      </Section>

      <Section title="Downloadable PDF.">
        <p
          style={{
            padding: "var(--sp-16) var(--sp-20)",
            border: "1px dashed var(--border-strong)",
            borderRadius: "var(--r-xl)",
            background: "var(--surface)",
            color: "var(--muted)",
          }}
        >
          PDF download will appear here once generation lands (target:
          Phase 1.0-B12). In the meantime, request a copy by email.
        </p>
      </Section>

      <Section title="Questions.">
        <p>
          Email <a href="mailto:legal@autonomux.io">legal@autonomux.io</a>.
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
    <section style={{ marginBottom: "var(--sp-32)" }}>
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
