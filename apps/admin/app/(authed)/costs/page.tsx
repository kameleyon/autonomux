/**
 * Costs — Phase 1.0-A scaffold. Real data wires in Phase 1.0-C (task C4).
 */
export default function CostsPage(): React.ReactElement {
  return (
    <section aria-labelledby="costs-h1">
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
        Placeholder &middot; wires Phase 1.0-C
      </p>
      <h1
        id="costs-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Costs
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
        }}
      >
        LLM cost per tenant, per model, per sub-agent. Budget alerts and
        margin per tier.
      </p>
    </section>
  );
}
