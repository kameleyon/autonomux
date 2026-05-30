/**
 * Feature flags — loading skeleton.
 *
 * Renders the page chrome + a single visually-hidden status line so SRs
 * announce that data is loading without surfacing a noisy spinner.
 */
export default function FeatureFlagsLoading(): React.ReactElement {
  return (
    <section aria-labelledby="flags-h1" aria-busy="true">
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
        PRD §3.2 &middot; Feature flags
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
        role="status"
        className="sz-sr-only"
        aria-live="polite"
      >
        Loading flag table.
      </p>
      <div
        aria-hidden="true"
        style={{
          height: "var(--sp-64)",
          background: "var(--surface-warm)",
          borderRadius: "8px",
          marginBottom: "var(--sp-12)",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          height: "calc(var(--sp-64) * 4)",
          background: "var(--surface-warm)",
          borderRadius: "8px",
        }}
      />
    </section>
  );
}
