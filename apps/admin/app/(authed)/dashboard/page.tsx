/**
 * Admin dashboard — Phase 1.0-A scaffold.
 *
 * Cards mirror PRD §3.2. Each one names what'll ship there at v1.0-C.
 * No live counters yet — Sprint A is scaffold-only.
 */
type SectionCard = {
  href: string;
  kicker: string;
  title: string;
  desc: string;
};

const SECTIONS: ReadonlyArray<SectionCard> = [
  {
    href: "/tenants",
    kicker: "PRD §3.2",
    title: "Tenants",
    desc: "Tenant list, drill-down, usage, cost, errors, sub-agent runs, last activity.",
  },
  {
    href: "/costs",
    kicker: "PRD §3.2",
    title: "Costs",
    desc: "LLM cost per tenant, per model, per sub-agent, budget alerts, margin per tier.",
  },
  {
    href: "/integrations",
    kicker: "PRD §3.2",
    title: "Integrations health",
    desc: "Composio per-tool status, Plaid per-tenant status, OAuth refresh failures.",
  },
  {
    href: "/queue",
    kicker: "PRD §3.2",
    title: "Queue",
    desc: "Railway worker plus BullMQ mirror — pending, running, failed, retries.",
  },
  {
    href: "/audit-log",
    kicker: "PRD §3.2",
    title: "Audit log",
    desc: "Searchable, exportable, 7-year retention, signed-chain verification.",
  },
  {
    href: "/activity",
    kicker: "PRD §3.2",
    title: "Activity log",
    desc: "User-facing activity mirror — what the tenant sees, surfaced for support.",
  },
  {
    href: "/compliance",
    kicker: "PRD §3.2",
    title: "Compliance",
    desc: "GDPR export queue, deletion queue, DPA generator, CASA audit trail, SOC 2 evidence.",
  },
  {
    href: "/billing",
    kicker: "PRD §3.2",
    title: "Billing",
    desc: "Stripe MRR, churn, LTV, cohort retention, refund processing.",
  },
  {
    href: "/feature-flags",
    kicker: "PRD §3.2",
    title: "Feature flags",
    desc: "GrowthBook console, percent rollouts, per-tenant overrides.",
  },
  {
    href: "/support",
    kicker: "PRD §3.2",
    title: "Support",
    desc: "Impersonate-with-audit, force re-OAuth, reset agent memory, resend briefing.",
  },
  {
    href: "/health",
    kicker: "PRD §3.2",
    title: "Health",
    desc: "Per-service SLO board, uptime, error budgets.",
  },
];

export default function AdminDashboardPage(): React.ReactElement {
  return (
    <section aria-labelledby="dash-h1">
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
        Phase 1.0-A &middot; Scaffold
      </p>
      <h1
        id="dash-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Operator <em>dashboard</em>
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
          marginBottom: "var(--sp-32)",
        }}
      >
        Placeholder cards for each cpanel section. Live counters and data
        wire in Phase 1.0-C.
      </p>

      <div className="adm-grid">
        {SECTIONS.map((section) => (
          <a
            key={section.href}
            className="adm-card"
            href={section.href}
            aria-label={`Open ${section.title}`}
            style={{ textDecoration: "none" }}
          >
            <span className="adm-card__kicker">{section.kicker}</span>
            <h2 className="adm-card__title">{section.title}</h2>
            <p className="adm-card__desc">{section.desc}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
