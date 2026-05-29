/**
 * Feature flags — Phase 1.0-A scaffold. GrowthBook wires Phase 1.0-C (C6).
 */
export default function FeatureFlagsPage(): React.ReactElement {
  return (
    <section aria-labelledby="flags-h1">
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
        id="flags-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Feature flags
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
        }}
      >
        GrowthBook console with percent rollouts and per-tenant overrides.
      </p>
    </section>
  );
}
