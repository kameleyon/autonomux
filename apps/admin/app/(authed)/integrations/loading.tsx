/**
 * Integrations skeleton — Phase 1.0-C5.
 */
export default function IntegrationsLoading(): React.ReactElement {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="integrations-h1"
    >
      <div className="adm-pageheader">
        <p
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-mono-meta)",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--brand-orange)",
          }}
        >
          Phase 1.0-C5 &middot; Integrations health
        </p>
        <h1
          id="integrations-h1"
          style={{ fontSize: "var(--fs-display-s)" }}
        >
          Integrations health
        </h1>
        <p
          style={{
            fontSize: "var(--fs-body-lg)",
            color: "var(--ink-soft)",
            maxWidth: "720px",
          }}
        >
          Aggregating connected_accounts…
        </p>
      </div>

      <div className="adm-table-wrap" aria-hidden="true">
        <div style={{ padding: "var(--sp-16)" }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className="adm-skel adm-skel--line"
              style={{ width: `${55 + ((i * 5) % 35)}%` }}
            />
          ))}
        </div>
      </div>

      <span className="sz-sr-only">Loading integration health</span>
    </section>
  );
}
