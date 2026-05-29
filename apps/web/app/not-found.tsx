/**
 * 404 — keep the brand even on errors.
 */
export default function NotFound(): React.ReactElement {
  return (
    <main id="main" className="wrap">
      <p
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: "var(--fs-mono-meta)",
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: "var(--brand-orange)",
          marginBottom: "var(--sp-16)",
        }}
      >
        404 · Not Found
      </p>
      <h1 style={{ fontSize: "var(--fs-display-s)" }}>
        That page <em>doesn&rsquo;t exist</em>.
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          marginTop: "var(--sp-16)",
        }}
      >
        <a href="/">Back to home →</a>
      </p>
    </main>
  );
}
