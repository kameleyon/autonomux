/**
 * Queue — Phase 1.0-A scaffold. Real worker mirror wires after Sprint A4.
 */
export default function QueuePage(): React.ReactElement {
  return (
    <section aria-labelledby="queue-h1">
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
        Placeholder &middot; wires after Sprint A4
      </p>
      <h1
        id="queue-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Queue
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
        }}
      >
        Railway worker plus BullMQ mirror — pending, running, failed, and
        retry counts per job class.
      </p>
    </section>
  );
}
