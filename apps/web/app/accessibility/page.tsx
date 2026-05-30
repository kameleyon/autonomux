/**
 * apps/web/app/accessibility/page.tsx
 *
 * Accessibility statement — public commitment to WCAG 2.2 AA, known
 * limitations, contact for accessibility issues. PRD §10.4 requires this
 * surface. [Halo] owns the underlying conformance work.
 *
 * Owner: [Comply + Herald + Halo] · Phase 1.0-C10
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Accessibility",
  description:
    "Our commitment to WCAG 2.2 AA, the conformance approach we follow, current known limitations, and how to report an accessibility issue.",
};

const LAST_UPDATED = "2026-05-29";
const VERSION = "1.0.0";

export default function AccessibilityPage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <h1 style={{ fontSize: "var(--fs-display-s)" }}>Accessibility</h1>
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

      <Section title="Our commitment.">
        <p>
          Autonomux is built to be usable by people with the widest range
          of abilities. Our target is conformance with{" "}
          <a
            href="https://www.w3.org/TR/WCAG22/"
            rel="noopener"
          >
            Web Content Accessibility Guidelines 2.2, Level AA
          </a>{" "}
          across every public-facing and authenticated surface. We treat
          accessibility as a release blocker, not a follow-up.
        </p>
      </Section>

      <Section title="How we approach it.">
        <ul>
          <li>
            <strong>Semantic HTML.</strong> Pages use real headings,
            landmarks, labels, and tables. Custom widgets follow the WAI-
            ARIA Authoring Practices where a native control does not
            exist.
          </li>
          <li>
            <strong>Keyboard parity.</strong> Every interaction is reachable
            from the keyboard. A skip-to-content link is the first focus
            stop on every page.
          </li>
          <li>
            <strong>Focus visibility.</strong> Focus indicators meet WCAG
            2.4.13 (≥3:1 contrast, ≥2 px outline) and are never hidden.
          </li>
          <li>
            <strong>Colour and contrast.</strong> Body text meets 4.5:1;
            large text meets 3:1. Colour is never the only carrier of
            meaning.
          </li>
          <li>
            <strong>Motion and animation.</strong> We respect the{" "}
            <code>prefers-reduced-motion</code> setting and avoid
            attention-grabbing motion in critical flows.
          </li>
          <li>
            <strong>Screen-reader checks.</strong> Critical flows are
            audited with VoiceOver, NVDA, and JAWS. Findings become
            release-blocking issues.
          </li>
          <li>
            <strong>Automated + manual audit.</strong> Every PR runs axe-
            core in CI; quarterly we engage a third-party manual audit
            against WCAG 2.2 AA.
          </li>
        </ul>
      </Section>

      <Section title="Standards we measure against.">
        <ul>
          <li>WCAG 2.2 Level AA — primary target.</li>
          <li>
            EN 301 549 — relevant for European Accessibility Act (EAA)
            obligations entering force June 2025.
          </li>
          <li>
            U.S. Section 508 — relevant for any federal-adjacent customer
            engagement.
          </li>
        </ul>
      </Section>

      <Section title="Known limitations.">
        <p>
          We list known accessibility gaps openly. As of the date above:
        </p>
        <ul>
          <li>
            <strong>Pre-launch surface coverage.</strong> The landing page
            and core onboarding flow are audited. Settings sub-surfaces are
            on the audit queue for Phase 1.0-D.
          </li>
          <li>
            <strong>Voice features.</strong> The Voice sub-agent ships in
            Phase 1.7; equivalent text-only and keyboard-only paths will
            ship at the same time so the surface is not voice-only.
          </li>
          <li>
            <strong>Third-party widgets.</strong> Stripe Checkout and the
            Plaid Link iframe are governed by those vendors&rsquo; own
            accessibility programmes. We monitor their public conformance
            reports and surface known issues here when they affect our
            users.
          </li>
        </ul>
        <p>
          When we identify a new limitation we add it to this list before
          the surface ships, and remove it when conformance is verified.
        </p>
      </Section>

      <Section title="Reporting an issue.">
        <p>
          If you hit a barrier on any Autonomux surface, please tell us.
          Email{" "}
          <a href="mailto:accessibility@autonomux.io">
            accessibility@autonomux.io
          </a>{" "}
          with:
        </p>
        <ul>
          <li>The page or flow where you ran into the issue.</li>
          <li>
            The assistive technology and browser you were using (e.g.
            NVDA + Firefox).
          </li>
          <li>What you expected to happen and what actually happened.</li>
        </ul>
        <p>
          We acknowledge accessibility reports within two business days
          and treat blocker-level issues with the same priority as a
          production outage.
        </p>
      </Section>

      <Section title="Alternative formats.">
        <p>
          If you need a document on this site in an alternative format
          (large print, plain text, a specific reading order), email{" "}
          <a href="mailto:accessibility@autonomux.io">
            accessibility@autonomux.io
          </a>{" "}
          and we will provide it at no charge.
        </p>
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
        </ul>
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
