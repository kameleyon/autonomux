/**
 * Billing — Phase 1.0-A scaffold. Stripe wiring happens Phase 1.4.
 */
export default function BillingPage(): React.ReactElement {
  return (
    <section aria-labelledby="billing-h1">
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
        Placeholder &middot; wires Phase 1.4
      </p>
      <h1
        id="billing-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Billing
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
        }}
      >
        Stripe MRR, churn, LTV, cohort retention, and refund processing
        flow.
      </p>
    </section>
  );
}
