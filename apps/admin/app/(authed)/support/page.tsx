/**
 * Support — Phase 1.0-A scaffold. Impersonation-with-audit wires Phase 1.1.
 */
export default function SupportPage(): React.ReactElement {
  return (
    <section aria-labelledby="support-h1">
      <p
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: "var(--fs-mono-meta)",
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: "var(--brand-orange)",
          marginBottom: "var(--sp-12)",
        }}
      >
        Placeholder &middot; wires Phase 1.1
      </p>
      <h1
        id="support-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Support
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
        }}
      >
        Impersonate-with-audit, force re-OAuth, reset agent memory, and
        resend briefing actions.
      </p>
    </section>
  );
}
