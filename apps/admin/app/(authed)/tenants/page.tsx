/**
 * Tenants — Phase 1.0-A scaffold. Real list wires in Phase 1.0-C (task C1).
 */
export default function TenantsPage(): React.ReactElement {
  return (
    <section aria-labelledby="tenants-h1">
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
        id="tenants-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Tenants
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
        }}
      >
        Tenant list with filtering and per-tenant drill-down — usage, cost,
        errors, sub-agent runs, last activity.
      </p>
    </section>
  );
}
