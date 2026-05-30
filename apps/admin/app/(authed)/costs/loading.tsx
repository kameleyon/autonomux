/**
 * Costs skeleton — Phase 1.0-C4.
 * No DB call; renders instantly.
 */
export default function CostsLoading(): React.ReactElement {
  return (
    <section aria-busy="true" aria-live="polite" aria-labelledby="costs-h1">
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
          Phase 1.0-C4 &middot; Cost rollups
        </p>
        <h1 id="costs-h1" style={{ fontSize: "var(--fs-display-s)" }}>
          Costs
        </h1>
        <p
          style={{
            fontSize: "var(--fs-body-lg)",
            color: "var(--ink-soft)",
            maxWidth: "720px",
          }}
        >
          Summing rollups…
        </p>
      </div>

      <div className="adm-grid" style={{ marginBottom: "var(--sp-32)" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <article key={i} className="adm-counter" aria-hidden="true">
            <span
              className="adm-skel adm-skel--line"
              style={{ width: "40%" }}
            />
            <span
              className="adm-skel adm-skel--line"
              style={{ width: "60%", height: "1.6em" }}
            />
            <span
              className="adm-skel adm-skel--line"
              style={{ width: "50%" }}
            />
          </article>
        ))}
      </div>

      <div className="adm-grid" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="adm-counter">
            <span
              className="adm-skel adm-skel--line"
              style={{ width: "40%" }}
            />
            <span
              className="adm-skel adm-skel--line"
              style={{ width: "70%", height: "1.6em" }}
            />
            <span
              className="adm-skel adm-skel--line"
              style={{ width: "55%" }}
            />
          </article>
        ))}
      </div>

      <span className="sz-sr-only">Loading cost rollups</span>
    </section>
  );
}
