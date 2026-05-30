/**
 * Activity log skeleton — Phase 1.0-C3.
 * No DB call here; renders instantly while the page server-component fetches.
 */
export default function ActivityLoading(): React.ReactElement {
  return (
    <section aria-busy="true" aria-live="polite" aria-labelledby="activity-h1">
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
          Phase 1.0-C3 &middot; Activity mirror
        </p>
        <h1 id="activity-h1" style={{ fontSize: "var(--fs-display-s)" }}>
          Activity log
        </h1>
        <p
          style={{
            fontSize: "var(--fs-body-lg)",
            color: "var(--ink-soft)",
            maxWidth: "720px",
          }}
        >
          Loading the mirrored feed…
        </p>
      </div>

      <div
        aria-hidden="true"
        className="adm-skel adm-skel--block"
        style={{ marginBottom: "var(--sp-24)", height: "120px" }}
      />

      <div className="adm-table-wrap" aria-hidden="true">
        <div style={{ padding: "var(--sp-16)" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className="adm-skel adm-skel--line"
              style={{ width: `${60 + ((i * 7) % 30)}%` }}
            />
          ))}
        </div>
      </div>

      <span className="sz-sr-only">Loading activity entries</span>
    </section>
  );
}
