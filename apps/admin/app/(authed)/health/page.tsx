/**
 * Health — Phase 1.0-A scaffold. SLO board wires alongside Phase 1.0-B telemetry.
 */
export default function HealthPage(): React.ReactElement {
  return (
    <section aria-labelledby="health-h1">
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
        Placeholder &middot; wires Phase 1.0-B
      </p>
      <h1
        id="health-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Health
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
        }}
      >
        Per-service SLO board with uptime and error-budget consumption,
        sourced from the telemetry pipeline.
      </p>
    </section>
  );
}
