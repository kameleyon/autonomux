/**
 * apps/web/app/legal/privacy/page.tsx
 *
 * Privacy Policy — GDPR Art. 13 / 14 disclosure, plus the CCPA "right to
 * know" categories.
 *
 * This is a placeholder template. Counsel review required before launch.
 * Every claim of fact (e.g. retention windows) MUST match the
 * engineering reality before LAST_UPDATED moves to a launch date.
 *
 * Owner: [Comply] · Phase 1.0-B9
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What we collect, why we collect it, who we share it with, and how to ask us to delete it.",
};

const LAST_UPDATED = "2026-05-29";

export default function PrivacyPolicyPage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <h1 style={{ fontSize: "var(--fs-display-s)" }}>Privacy policy</h1>
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
        Last updated · {LAST_UPDATED}
      </p>

      <CalloutBox>
        This is a draft. Final wording requires counsel review before the
        public launch. We will update <code>LAST_UPDATED</code> when that
        review lands.
      </CalloutBox>

      <Section title="Who we are.">
        <p>
          Autonomux (&quot;we,&quot; &quot;us&quot;) is the controller of
          your personal data within the meaning of GDPR Art. 4(7). You can
          reach us at{" "}
          <a href="mailto:privacy@autonomux.io">privacy@autonomux.io</a>.
        </p>
        <p>
          Postal address and Data Protection Officer details will be added
          before launch.
        </p>
      </Section>

      <Section title="What data we collect.">
        <ul>
          <li>
            <strong>Account data</strong> — email, hashed password, name (if
            you provide it), profile preferences.
          </li>
          <li>
            <strong>Content you give your AlterEgo</strong> — messages,
            documents, integrations you authorise (Gmail, Calendar, etc.).
            We process these to do the work you asked for.
          </li>
          <li>
            <strong>Technical data</strong> — IP address, user agent, error
            traces. Used for security, debugging, and abuse prevention.
          </li>
          <li>
            <strong>Usage data</strong> — which features you use, when. Only
            collected if you opted in to analytics on the cookie banner.
          </li>
        </ul>
      </Section>

      <Section title="Why we collect it (legal basis).">
        <p>Each category of data has a basis under GDPR Art. 6:</p>
        <ul>
          <li>
            <strong>Contract (Art. 6(1)(b))</strong> — account data and
            content you submit; we cannot deliver the service without it.
          </li>
          <li>
            <strong>Legitimate interest (Art. 6(1)(f))</strong> — security
            logs, error traces, abuse detection. Our interest is keeping
            the service safe; we weigh this against your rights.
          </li>
          <li>
            <strong>Consent (Art. 6(1)(a))</strong> — analytics, marketing,
            and any cookie outside the necessary category. Withdrawable
            anytime at <Link href="/settings/consent">cookie settings</Link>.
          </li>
          <li>
            <strong>Legal obligation (Art. 6(1)(c))</strong> — tax records,
            response to lawful requests from authorities.
          </li>
        </ul>
      </Section>

      <Section title="Who we share it with (subprocessors).">
        <p>
          We use a small set of subprocessors to run the service. Each is
          bound by a data-processing addendum. The current list:
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — database, auth, storage (US / EU
            regions per your tenant).
          </li>
          <li>
            <strong>Anthropic</strong> — Claude API for AlterEgo
            reasoning. Inputs are not used to train models (zero-data-
            retention enterprise terms).
          </li>
          <li>
            <strong>Resend</strong> — transactional email.
          </li>
          <li>
            <strong>Stripe</strong> — payment processing. We never see your
            card number.
          </li>
          <li>
            <strong>Sentry</strong> — error monitoring. PII scrubbing
            enabled at the SDK.
          </li>
          <li>
            <strong>Vercel</strong> — hosting and edge runtime.
          </li>
        </ul>
        <p>
          The full, dated list lives at{" "}
          <a href="/legal/subprocessors">/legal/subprocessors</a>. We notify
          users 30 days before adding a new one.
        </p>
      </Section>

      <Section title="How long we keep it.">
        <ul>
          <li>
            <strong>Account data</strong> — for the life of your account,
            plus 30 days after deletion to honor recovery requests.
          </li>
          <li>
            <strong>Content</strong> — until you delete it or close your
            account.
          </li>
          <li>
            <strong>Security logs</strong> — 13 months, then aggregated.
          </li>
          <li>
            <strong>Billing records</strong> — 7 years (tax-law obligation).
          </li>
        </ul>
      </Section>

      <Section title="Your rights.">
        <p>Under GDPR Art. 15–22 and CCPA §1798.100–.150 you may:</p>
        <ul>
          <li>
            <strong>Access</strong> — request a copy of the data we hold
            about you.
          </li>
          <li>
            <strong>Rectify</strong> — correct inaccurate data.
          </li>
          <li>
            <strong>Erase</strong> — ask us to delete your account and
            content (&quot;right to be forgotten&quot;).
          </li>
          <li>
            <strong>Restrict / object</strong> — pause specific processing.
          </li>
          <li>
            <strong>Portability</strong> — get your content in a structured,
            machine-readable format.
          </li>
          <li>
            <strong>Withdraw consent</strong> — at{" "}
            <Link href="/settings/consent">cookie settings</Link>, anytime.
          </li>
          <li>
            <strong>Lodge a complaint</strong> — with your local
            supervisory authority (EU) or the California Attorney General.
          </li>
        </ul>
        <p>
          Email <a href="mailto:privacy@autonomux.io">privacy@autonomux.io</a>{" "}
          to exercise any of these. We aim to respond within 30 days.
        </p>
      </Section>

      <Section title="CCPA — California residents.">
        <p>
          We do not sell or share personal information for cross-context
          behavioural advertising. If we ever do, you will see a &quot;Do
          Not Sell or Share My Personal Information&quot; link in the
          footer.
        </p>
      </Section>

      <Section title="International transfers.">
        <p>
          Data may move between the EU, the UK, and the US. Transfers
          outside the EEA use Standard Contractual Clauses (SCCs) under
          GDPR Art. 46 plus, where relevant, the EU-US Data Privacy
          Framework.
        </p>
      </Section>

      <Section title="Children.">
        <p>
          Autonomux is not for users under 16. We do not knowingly collect
          data from children. If you believe a child has signed up, email{" "}
          <a href="mailto:privacy@autonomux.io">privacy@autonomux.io</a>{" "}
          and we will delete the account.
        </p>
      </Section>

      <Section title="Changes to this policy.">
        <p>
          When we change material terms we will email registered users at
          least 14 days before the change takes effect and bump{" "}
          <code>LAST_UPDATED</code>.
        </p>
      </Section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────

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
