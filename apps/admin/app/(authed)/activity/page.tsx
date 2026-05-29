/**
 * Activity log mirror — Phase 1.0-A scaffold. Wires Phase 1.0-C (task C3).
 */
export default function ActivityPage(): React.ReactElement {
  return (
    <section aria-labelledby="activity-h1">
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
        id="activity-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Activity log
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
        }}
      >
        Same activity feed the tenant sees in their app, mirrored here for
        support workflows.
      </p>
    </section>
  );
}
