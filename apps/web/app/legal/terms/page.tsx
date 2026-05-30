/**
 * apps/web/app/legal/terms/page.tsx
 *
 * Terms of Service â€” placeholder template. Counsel review required
 * before launch.
 *
 * Includes the locked PRD Â§10.3 HIPAA refusal contract. That section is
 * load-bearing; do not soften the wording without consulting [Comply].
 *
 * Owner: [Comply] Â· Phase 1.0-B9
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The agreement between you and Autonomux. What we do, what you can do with it, and what happens if either of us breaks the rules.",
};

const LAST_UPDATED = "2026-05-29";

export default function TermsOfServicePage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <h1 style={{ fontSize: "var(--fs-display-s)" }}>Terms of service</h1>
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
        Draft. Counsel review required before public launch. By using the
        service you agree to these terms as updated from time to time.
      </CalloutBox>

      <Section title="1. What Autonomux is.">
        <p>
          Autonomux gives you an &quot;AlterEgo&quot; â€” an AI assistant that
          can read and act on your email, calendar, money, and writing tools
          on your behalf, within limits you set. We are a software service,
          not your lawyer, doctor, accountant, or financial adviser.
        </p>
      </Section>

      <Section title="2. Your account.">
        <p>
          You must be at least 16 to create an account. You agree to keep
          your sign-in details safe and to tell us promptly at{" "}
          <a href="mailto:security@autonomux.io">security@autonomux.io</a>{" "}
          if you suspect unauthorised access.
        </p>
      </Section>

      <Section title="3. Acceptable use.">
        <p>You agree not to:</p>
        <ul>
          <li>Use the service to do anything illegal.</li>
          <li>
            Harm or harass other people, infringe their copyright, or send
            spam.
          </li>
          <li>
            Reverse-engineer the service except where applicable law lets
            you.
          </li>
          <li>
            Resell, sublicense, or white-label the service without a written
            agreement.
          </li>
          <li>Train competing AI models on our outputs.</li>
        </ul>
      </Section>

      <Section title="4. HIPAA â€” protected health information.">
        <CalloutBox tone="warn">
          <strong>Do not paste patient information into AlterEgo.</strong>{" "}
          We do not have a Business Associate Agreement. We are not a HIPAA
          covered entity, and we are not a business associate. The founder
          is a registered nurse â€” this rule is non-negotiable.
        </CalloutBox>
        <p>
          Specifically: do not submit identifiable health data about anyone
          other than yourself, do not submit any health data about a patient
          in your care, and do not use AlterEgo to draft clinical
          documentation about identifiable patients. Mailroom triage
          automatically flags inbound mail with detected PHI patterns and
          redacts before any LLM call; repeat violations may result in
          account suspension.
        </p>
        <p>
          If you need a HIPAA-aligned assistant for clinical work, please
          use a vendor with a signed BAA. We will be happy to refer you.
        </p>
      </Section>

      <Section title="5. Your content.">
        <p>
          You keep ownership of everything you give the AlterEgo. You grant
          us a limited, worldwide licence to process that content solely to
          deliver the service to you. We do not train our own foundation
          models on your content, and our LLM subprocessors (e.g.
          Anthropic) are bound to zero-data-retention terms.
        </p>
      </Section>

      <Section title="6. Subscription, billing, refunds.">
        <p>
          Paid tiers renew automatically until you cancel. You may cancel
          anytime from your account settings; service continues to the end
          of the paid period. We refund pro rata in cases of material
          service failure on our side.
        </p>
      </Section>

      <Section title="7. Service availability.">
        <p>
          We aim for 99.5% monthly uptime but do not guarantee it. Planned
          maintenance is announced in advance where possible.
        </p>
      </Section>

      <Section title="8. Liability cap.">
        <p>
          To the maximum extent permitted by law, our total liability to you
          arising out of or relating to the service is capped at the
          subscription fees you paid us in the twenty-four (24) months
          before the event giving rise to the claim. Nothing in these terms
          limits liability that cannot be limited by law (e.g. fraud, death
          or personal injury caused by negligence).
        </p>
      </Section>

      <Section title="9. Indemnity.">
        <p>
          You agree to defend and indemnify us against third-party claims
          arising from your misuse of the service, including content you
          submit that infringes someone else&apos;s rights.
        </p>
      </Section>

      <Section title="10. Governing law and venue.">
        <p>
          These terms are governed by the laws of the State of Delaware,
          USA, without regard to its conflict-of-laws rules. Disputes will
          be resolved in the state and federal courts located in Wilmington,
          Delaware. (Final jurisdiction to be confirmed by counsel before
          launch.)
        </p>
      </Section>

      <Section title="11. Termination.">
        <p>
          You may terminate at any time by closing your account. We may
          suspend or terminate your account for material breach of these
          terms, after notice and a reasonable cure period where the breach
          is curable. Sections 4, 8, 9, 10, and 12 survive termination.
        </p>
      </Section>

      <Section title="12. Changes to these terms.">
        <p>
          We will email registered users at least 14 days before any
          material change takes effect. Continued use of the service after
          the effective date means you accept the new terms.
        </p>
      </Section>

      <Section title="13. Related documents.">
        <ul>
          <li>
            <Link href="/legal/privacy">Privacy policy</Link>
          </li>
          <li>
            <Link href="/legal/cookies">Cookie policy</Link>
          </li>
          <li>
            <Link href="/legal/dpa">Data Processing Agreement</Link>
          </li>
        </ul>
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

function CalloutBox(props: {
  children: React.ReactNode;
  tone?: "info" | "warn";
}): React.ReactElement {
  const tone = props.tone ?? "info";
  const borderColor =
    tone === "warn" ? "var(--brand-red)" : "var(--brand-amber)";
  const bg =
    tone === "warn" ? "rgba(230, 51, 18, 0.06)" : "var(--surface-warm)";
  return (
    <aside
      role="note"
      style={{
        padding: "var(--sp-16) var(--sp-20)",
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: "var(--r-xl)",
        marginBottom: "var(--sp-16)",
        fontSize: "var(--fs-body-sm)",
        color: "var(--ink-soft)",
      }}
    >
      {props.children}
    </aside>
  );
}
