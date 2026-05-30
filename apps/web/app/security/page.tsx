/**
 * apps/web/app/security/page.tsx
 *
 * Public security page — the trust surface auditors, prospects, and
 * counsel will read. Every claim must match engineering reality. Where a
 * control is planned but not yet shipped, we say so on the row instead of
 * implying steady-state. PRD §7 (security model), §8 (logging), §10
 * (compliance), §13 (voice) govern this surface.
 *
 * Owner: [Comply + Herald] · Phase 1.0-C10
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Autonomux protects customer data: architecture, encryption, access controls, audit logging, compliance status, and how to report a vulnerability.",
};

const LAST_UPDATED = "2026-05-29";
const VERSION = "1.0.0";

export default function SecurityPage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <h1 style={{ fontSize: "var(--fs-display-s)" }}>Security</h1>
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

      <Section title="Overview.">
        <p>
          Autonomux is the AlterEgo for your inbox, calendar, money, and
          writing. That role only works if customer data is held to a high
          bar. Every piece of personally identifiable customer data is
          encrypted at rest with an AWS KMS-wrapped per-tenant data key and
          the libsodium XChaCha20-Poly1305 AEAD construction. Transport is
          TLS 1.3 minimum with HSTS. Row-Level Security is enabled on every
          tenant-scoped table. SOC 2 Type II audit kicks off Phase 1.0-D
          with Vanta; an external penetration test is scoped before public
          launch and contracted quarterly thereafter.
        </p>
        <p>
          This page is updated on a documented cadence. The version pin and
          timestamp above are the authoritative state of the program.
        </p>
      </Section>

      <Section title="Architecture.">
        <p>
          The request path and which subprocessor touches which data class:
        </p>
        <dl style={dlStyle}>
          <ArchRow
            stage="1 · Edge"
            body="User → Vercel edge runtime. Handles TLS termination, geo routing, static asset delivery. Receives IP and request metadata; never receives unencrypted customer secrets."
          />
          <ArchRow
            stage="2 · App"
            body="Vercel → Next.js Server Components and API routes. Authenticates the request against Supabase Auth, enforces RLS context, performs encryption and decryption with KMS-wrapped DEKs before any read or write."
          />
          <ArchRow
            stage="3 · Data"
            body="App → Supabase (Postgres + Auth + Storage, US-East). Customer PII, agent state, audit log, billing references. RLS on every tenant-scoped table; service role isolated to a small set of server-side helpers."
          />
          <ArchRow
            stage="4 · Cache + queue"
            body="App → Upstash Redis. Idempotency keys, request IDs, short-term agent working memory, rate-limit counters. No long-lived PII; eviction by TTL."
          />
          <ArchRow
            stage="5 · Worker"
            body="Job dispatch → Railway BullMQ worker. Long-running agent tasks (send email, schedule meeting, run a draft). Payloads are PII-redacted before enqueue; the worker re-fetches sensitive fields from Supabase under its own service identity."
          />
          <ArchRow
            stage="6 · Model"
            body="Worker → Anthropic (Claude Sonnet 4.6 + Haiku 4.5), routed via OpenRouter by default or direct when LLM_PROVIDER=anthropic. Anthropic is contracted under Zero-Data-Retention; prompts and responses are never used to train models."
          />
          <ArchRow
            stage="7 · Integrations"
            body="Worker → Composio (Gmail, Calendar, Drive OAuth broker), Plaid (banking — when Treasurer ships), Resend (transactional email). Composio stores OAuth tokens in its own KMS; Plaid item tokens are envelope-encrypted in our database."
          />
          <ArchRow
            stage="8 · Observability"
            body="App + worker → Sentry (errors, PII-redacted) and Axiom (logs, PII-redacted). AWS KMS wraps the per-tenant data keys; Doppler holds env vars and secret references."
          />
        </dl>
      </Section>

      <Section title="Encryption.">
        <p>By data class:</p>
        <ul>
          <li>
            <strong>PII at rest.</strong> Envelope encryption: AWS KMS holds
            the master key; per-tenant Data Encryption Keys (DEKs) are
            wrapped by that master key and stored alongside the ciphertext.
            App-side AEAD uses libsodium XChaCha20-Poly1305. Tenant keys are
            rotated on a documented schedule and on demand on incident.
          </li>
          <li>
            <strong>PII in transit.</strong> TLS 1.3 minimum on every public
            endpoint. HSTS with preload. Internal calls between Vercel and
            Supabase, between the worker and Anthropic, and between the
            worker and integrations all use TLS over the public internet
            with provider-issued certificates.
          </li>
          <li>
            <strong>OAuth tokens (Gmail, Calendar, Drive).</strong> Stored
            inside Composio under their KMS — we hold a Composio
            connection-ID, not the raw token. Composio is in scope for the
            DPA and SOC 2.
          </li>
          <li>
            <strong>Plaid item tokens.</strong> Envelope-encrypted in our
            database under the same KMS-wrapped DEK as the rest of the
            tenant&rsquo;s PII. Plaintext only exists in memory during a
            Plaid API call.
          </li>
          <li>
            <strong>Backup codes.</strong> SHA-256 one-way hashed before
            storage. We can verify a code you submit; we cannot read what
            we showed you once you close the screen.
          </li>
          <li>
            <strong>TOTP secrets.</strong> Envelope-encrypted at rest. Read
            server-side only, in a single helper, to verify a one-time
            code. Never returned to the client.
          </li>
        </ul>
      </Section>

      <Section title="Authentication.">
        <ul>
          <li>
            <strong>Password.</strong> Minimum 12 characters; zxcvbn score
            of at least 3 required. Argon2id hashing via Supabase Auth.
          </li>
          <li>
            <strong>TOTP.</strong> Mandatory enrollment during onboarding.
            Any RFC 6238 authenticator app works (Google Authenticator,
            1Password, Authy, Bitwarden).
          </li>
          <li>
            <strong>WebAuthn passkeys.</strong> Optional second factor for
            users who prefer hardware-backed authentication.
          </li>
          <li>
            <strong>Step-up.</strong> Sensitive actions — banking changes,
            account deletion, plan downgrade, revoke-all-sessions —
            re-prompt for TOTP regardless of session age.
          </li>
        </ul>
      </Section>

      <Section title="Access controls.">
        <ul>
          <li>
            <strong>Row-Level Security.</strong> Every tenant-scoped
            Postgres table has an RLS policy keyed on{" "}
            <code>auth.uid()</code>. The default deny is enforced at the
            database, not the application.
          </li>
          <li>
            <strong>Service role isolation.</strong> The Supabase service
            role key is held by a small, named set of server-side helpers
            (audit-log writes, cron-driven cleanup, KMS unwrap). No edge
            function and no client code can reach the service role.
          </li>
          <li>
            <strong>Admin surface.</strong> The internal control panel
            lives on a separate domain and a separate Supabase project.
            Admin TOTP enforcement and IP allowlist are wired in
            Phase 1.0-D — until they ship, only the engineering team has
            credentials and access is logged via the same audit chain.
          </li>
          <li>
            <strong>Least privilege.</strong> Engineering access to
            production data is read-only by default; write access is
            time-boxed, audited, and requires a documented ticket.
          </li>
        </ul>
      </Section>

      <Section title="Audit logging.">
        <p>
          Every write to user data is recorded in <code>audit_log</code>, a
          Postgres table whose RLS policies deny <code>UPDATE</code> and{" "}
          <code>DELETE</code> from any role. Rows form a Merkle-style chain:
          each row carries a hash of the previous row&rsquo;s contents, so
          tampering with history is detectable.
        </p>
        <p>
          A daily chain-head checkpoint table is in place; the operator
          can replay the chain at any time via the admin console. Posting
          checkpoints to an external verifiable timestamp service
          (OpenTimestamps) is on the roadmap for Phase 1.7 — until that
          ships, the chain is internally verifiable but not externally
          notarised.
        </p>
        <p>
          Retention: <strong>7 years</strong> on the audit log, per SOC 2
          CC6.1 and the tax-record obligation that drives our billing
          retention.
        </p>
      </Section>

      <Section title="Compliance.">
        <ComplianceTable rows={COMPLIANCE} />
      </Section>

      <Section title="Penetration testing.">
        <p>
          An external, scoped penetration test (budget USD 8&ndash;15k) is
          contracted before public launch. The scope covers the public web
          surface, the authenticated app, the worker queue, and the
          Composio + Plaid integration boundary. Findings are tracked in
          our internal issue tracker with public-summary disclosure for
          fixed issues.
        </p>
        <p>
          After launch, the test is repeated quarterly. The summary report
          is available to enterprise customers under NDA.
        </p>
      </Section>

      <Section title="Bug bounty.">
        <p>
          A coordinated disclosure programme is planned for Phase 1.7,
          either via HackerOne or a self-managed surface. Until that opens,
          please report findings to the address below — we acknowledge
          within two business days and will credit you in our security
          changelog if you would like.
        </p>
      </Section>

      <Section title="Reporting a security issue.">
        <p>
          Email{" "}
          <a href="mailto:security@autonomux.app">security@autonomux.app</a>
          . The address is provisioned; DNS and the PGP key are being
          finalised before public launch. If you would like to encrypt your
          report, request our PGP fingerprint at the same address and we
          will share it out-of-band.
        </p>
        <p>
          Please give us a reasonable disclosure window (we suggest 90 days)
          before publishing. We will not pursue legal action against
          good-faith research conducted within the safe-harbour terms we
          publish at launch.
        </p>
      </Section>

      <Section title="Related documents.">
        <ul>
          <li>
            <Link href="/system-card">AI system card</Link> — model, tools,
            oversight, incident reporting.
          </li>
          <li>
            <Link href="/legal/subprocessors">Subprocessor list</Link> —
            every vendor that touches customer data, what they touch, where
            they sit.
          </li>
          <li>
            <Link href="/legal/privacy">Privacy policy</Link> — what we
            collect, why, and your rights.
          </li>
          <li>
            <Link href="/legal/dpa">Data Processing Agreement</Link> — GDPR
            Art. 28 contract.
          </li>
          <li>
            <Link href="/legal/terms">Terms of service</Link> — including
            the HIPAA refusal contract.
          </li>
        </ul>
      </Section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────

interface ComplianceRow {
  control: string;
  status: string;
  evidence: React.ReactNode;
}

const COMPLIANCE: ReadonlyArray<ComplianceRow> = [
  {
    control: "SOC 2 Type I",
    status: "In progress — Vanta kickoff Phase 1.0-D",
    evidence: "Audit readiness assessment available to enterprise on request",
  },
  {
    control: "SOC 2 Type II",
    status: "Planned month 6 post-launch",
    evidence: "Audit window opens once the control population has 6 months of evidence",
  },
  {
    control: "GDPR",
    status: "Live",
    evidence: "DPA on file, Standard Contractual Clauses 2021/914, DPO designated",
  },
  {
    control: "CCPA / CPRA",
    status: "Live",
    evidence: "Privacy policy §CCPA, in-product rights workflow, no sale or share",
  },
  {
    control: "HIPAA",
    status: "Out of scope by contract",
    evidence: (
      <>
        See <Link href="/legal/terms">Terms of service</Link> §4 — we do
        not accept Protected Health Information and have no Business
        Associate Agreement.
      </>
    ),
  },
  {
    control: "PCI DSS",
    status: "Out of scope — Stripe handles card data",
    evidence: "We never see PAN, CVV, or expiry; tokenised reference only",
  },
  {
    control: "Google CASA Tier 2",
    status: "In submission",
    evidence: "Required for restricted Gmail scopes; tracked alongside SOC 2",
  },
  {
    control: "EU AI Act Art. 50 transparency",
    status: "Live",
    evidence: (
      <>
        <Link href="/system-card">AI system card</Link> published.
      </>
    ),
  },
];

function ComplianceTable(props: {
  rows: ReadonlyArray<ComplianceRow>;
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
          Compliance controls, current status, and where to find evidence.
        </caption>
        <thead>
          <tr style={{ textAlign: "left", background: "var(--surface)" }}>
            <Th>Control</Th>
            <Th>Status</Th>
            <Th>Evidence</Th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr
              key={row.control}
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Td>
                <strong>{row.control}</strong>
              </Td>
              <Td>{row.status}</Td>
              <Td>{row.evidence}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const dlStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(140px, 200px) 1fr",
  gap: "var(--sp-12) var(--sp-24)",
  padding: "var(--sp-20) var(--sp-24)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-xl)",
};

function ArchRow(props: { stage: string; body: string }): React.ReactElement {
  return (
    <>
      <dt
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: "var(--fs-mono-data)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--brand-orange)",
        }}
      >
        {props.stage}
      </dt>
      <dd style={{ color: "var(--ink-soft)" }}>{props.body}</dd>
    </>
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
