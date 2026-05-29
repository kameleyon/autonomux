/**
 * Audit log — Phase 1.0-A scaffold. Viewer + chain verify wires Phase 1.0-C (C2).
 */
export default function AuditLogPage(): React.ReactElement {
  return (
    <section aria-labelledby="audit-h1">
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
        id="audit-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Audit log
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
        }}
      >
        Searchable audit trail with 7-year retention and signed-chain
        verification per PRD §7.5.
      </p>
    </section>
  );
}
