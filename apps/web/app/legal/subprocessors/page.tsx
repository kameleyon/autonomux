/**
 * apps/web/app/legal/subprocessors/page.tsx
 *
 * Subprocessor list — published per GDPR Art. 28(2). Every vendor that
 * touches customer data, what they touch, where they sit, what
 * certifications they hold, and whether a DPA is in place. Updates require
 * a 30-day notice to customers; that commitment is on this page.
 *
 * Owner: [Comply + Herald] · Phase 1.0-C10
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Subprocessors",
  description:
    "Every vendor Autonomux uses to deliver the service, what data they process, where they sit, and how we govern them.",
};

const LAST_UPDATED = "2026-05-29";
const VERSION = "1.0.0";

interface SubprocessorRow {
  vendor: string;
  purpose: string;
  data: string;
  location: string;
  certifications: string;
  dpa: "Yes" | "Yes — when shipped";
  status: "Live" | "Planned with surface";
  notes?: string;
}

const SUBPROCESSORS: ReadonlyArray<SubprocessorRow> = [
  {
    vendor: "Vercel",
    purpose: "Hosting + edge runtime for the web app",
    data: "Request metadata, IP address, edge logs",
    location: "US + global edge",
    certifications: "SOC 2 Type II, ISO 27001",
    dpa: "Yes",
    status: "Live",
  },
  {
    vendor: "Supabase",
    purpose: "Postgres database, authentication, object storage",
    data: "All customer PII, account credentials, agent state, audit log",
    location: "US-East (AWS us-east-1)",
    certifications: "SOC 2 Type II, HIPAA-capable (not in use)",
    dpa: "Yes",
    status: "Live",
  },
  {
    vendor: "Anthropic",
    purpose: "LLM inference (Claude Sonnet 4.6 + Haiku 4.5)",
    data: "Agent prompts and responses",
    location: "US",
    certifications: "SOC 2 Type II",
    dpa: "Yes",
    status: "Live",
    notes:
      "Zero-Data-Retention contract on file; prompts and responses are not used to train models.",
  },
  {
    vendor: "OpenRouter",
    purpose: "LLM proxy and billing aggregator (default route to Anthropic)",
    data: "Agent prompts and responses in transit",
    location: "US",
    certifications: "DPA available",
    dpa: "Yes",
    status: "Live",
    notes:
      "Bypassed by setting LLM_PROVIDER=anthropic to call Anthropic directly.",
  },
  {
    vendor: "Railway",
    purpose: "Worker hosting (BullMQ background jobs)",
    data: "Job payloads after PII redaction; service-role re-fetch of sensitive fields",
    location: "US",
    certifications: "SOC 2 Type II",
    dpa: "Yes",
    status: "Live",
  },
  {
    vendor: "Upstash",
    purpose: "Redis cache and queue",
    data: "Request IDs, idempotency keys, rate-limit counters, short-term agent working memory",
    location: "US",
    certifications: "SOC 2 Type II",
    dpa: "Yes",
    status: "Live",
  },
  {
    vendor: "Axiom",
    purpose: "Log aggregation",
    data: "System logs with PII redacted at source",
    location: "US",
    certifications: "SOC 2 Type II",
    dpa: "Yes",
    status: "Live",
  },
  {
    vendor: "Sentry",
    purpose: "Error and performance monitoring",
    data: "Error traces and breadcrumbs with PII scrubbing at the SDK",
    location: "US + EU regions available",
    certifications: "SOC 2 Type II, ISO 27001",
    dpa: "Yes",
    status: "Live",
  },
  {
    vendor: "AWS KMS",
    purpose: "Encryption key management",
    data: "KMS-wrapped data encryption keys — never plaintext PII",
    location: "US (AWS us-east-1)",
    certifications: "SOC 2 Type II, ISO 27001, FedRAMP, PCI DSS",
    dpa: "Yes",
    status: "Live",
  },
  {
    vendor: "Doppler",
    purpose: "Secrets management",
    data: "Environment variables, API tokens, service credentials",
    location: "US",
    certifications: "SOC 2 Type II",
    dpa: "Yes",
    status: "Live",
  },
  {
    vendor: "Resend",
    purpose: "Transactional email delivery",
    data: "Email address, subject and body of transactional messages",
    location: "US + EU regions available",
    certifications: "SOC 2 Type II",
    dpa: "Yes",
    status: "Live",
  },
  {
    vendor: "Composio",
    purpose: "Agent integration broker (Gmail, Calendar, Drive OAuth)",
    data: "OAuth tokens (held in Composio KMS), connection metadata",
    location: "US",
    certifications: "SOC 2 Type II",
    dpa: "Yes",
    status: "Live",
  },
  {
    vendor: "Plaid",
    purpose: "Bank account read-only access for the Treasurer surface",
    data: "Bank balances, transactions, account metadata",
    location: "US",
    certifications: "SOC 2 Type II, ISO 27001",
    dpa: "Yes — when shipped",
    status: "Planned with surface",
    notes: "Engaged when the Treasurer feature ships in Phase 1.7.",
  },
  {
    vendor: "Stripe",
    purpose: "Billing and payment processing",
    data: "Customer name, billing address, payment-method token. We never see PAN or CVV.",
    location: "US + global",
    certifications: "PCI DSS Level 1, SOC 2 Type II, ISO 27001",
    dpa: "Yes",
    status: "Live",
  },
];

const LIVE_COUNT = SUBPROCESSORS.filter((r) => r.status === "Live").length;
const PLANNED_COUNT = SUBPROCESSORS.length - LIVE_COUNT;

export default function SubprocessorsPage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <h1 style={{ fontSize: "var(--fs-display-s)" }}>Subprocessors</h1>
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
        Last updated ·{" "}
        <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time> · v{VERSION}
      </p>

      <CalloutBox>
        Under GDPR Art. 28(2), we will notify customers at least{" "}
        <strong>30 days</strong> before adding a new subprocessor or
        materially changing one already on this page. To receive that
        notice by email, write to{" "}
        <a href="mailto:privacy@autonomux.app?subject=Subprocessor%20notifications">
          privacy@autonomux.app
        </a>{" "}
        with the subject &ldquo;Subprocessor notifications&rdquo; — we
        will add you to the change list.
      </CalloutBox>

      <Section title="What a subprocessor is.">
        <p>
          A subprocessor is a third-party vendor that processes customer
          personal data on our behalf in order to deliver the service.
          Every subprocessor on this list is bound by a written
          data-processing agreement that mirrors the obligations in our
          own <Link href="/legal/dpa">DPA</Link>. Each is selected on
          security posture, certification, and contractual willingness to
          honour the data-subject rights you have under GDPR and CCPA.
        </p>
        <p>
          {LIVE_COUNT} subprocessors are currently live. {PLANNED_COUNT} is
          engaged conditionally when the dependent product surface ships.
        </p>
      </Section>

      <Section title="The full list.">
        <SubprocessorTable rows={SUBPROCESSORS} />
      </Section>

      <Section title="How we govern them.">
        <ul>
          <li>
            <strong>DPA before access.</strong> No vendor handles customer
            data without a signed DPA covering GDPR Art. 28(3) duties.
          </li>
          <li>
            <strong>Annual review.</strong> Each subprocessor&rsquo;s
            certifications and breach history are reviewed at least once a
            year as part of our SOC 2 control population.
          </li>
          <li>
            <strong>Least data.</strong> Where redaction is possible before
            handoff (logs, error traces, worker payloads), we redact at
            source. Vendors only see what they need to do their job.
          </li>
          <li>
            <strong>Exit plan.</strong> Each integration has a documented
            replacement path so that a vendor offboarding does not strand
            customer data.
          </li>
        </ul>
      </Section>

      <Section title="Related documents.">
        <ul>
          <li>
            <Link href="/security">Security</Link>
          </li>
          <li>
            <Link href="/system-card">AI system card</Link>
          </li>
          <li>
            <Link href="/legal/privacy">Privacy policy</Link>
          </li>
          <li>
            <Link href="/legal/dpa">Data Processing Agreement</Link>
          </li>
        </ul>
      </Section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function SubprocessorTable(props: {
  rows: ReadonlyArray<SubprocessorRow>;
}): React.ReactElement {
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
        <caption className="visually-hidden">
          List of Autonomux subprocessors with purpose, data categories,
          processing location, certifications, DPA status, and operational
          state.
        </caption>
        <thead>
          <tr style={{ textAlign: "left", background: "var(--surface)" }}>
            <Th>Subprocessor</Th>
            <Th>Purpose</Th>
            <Th>Data processed</Th>
            <Th>Location</Th>
            <Th>Certifications</Th>
            <Th>DPA</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr
              key={row.vendor}
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Td>
                <strong>{row.vendor}</strong>
                {row.notes ? (
                  <>
                    <br />
                    <span
                      style={{
                        fontSize: "var(--fs-mono-meta)",
                        color: "var(--muted)",
                      }}
                    >
                      {row.notes}
                    </span>
                  </>
                ) : null}
              </Td>
              <Td>{row.purpose}</Td>
              <Td>{row.data}</Td>
              <Td>{row.location}</Td>
              <Td>{row.certifications}</Td>
              <Td>{row.dpa}</Td>
              <Td>{row.status}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
