/* ============================================================
   autonomux Admin — section views A (Runtime + Money)
   Dashboard · Tenants (+drill-down) · Queue · Integrations · Costs · Health
   ============================================================ */

/* ── Dashboard ────────────────────────────────────────────── */
function DashboardView({ onNav }) {
  return (
    <div className="adm-page">
      <PageHead kicker="Operator console · live" title="Operator <em>dashboard</em>"
        lede="Everything across every tenant — runtime, money, trust, and ops — in one warm pane of glass." />
      <KpiRow items={window.ADM.KPIS} />
      {window.ADM.SECTIONS.map((grp) => (
        <section className="adm-block" key={grp.group}>
          <div className="adm-block__head"><h2 className="adm-block__title">{grp.group}</h2></div>
          <div className="adm-cardgrid">
            {grp.cards.map((c) => (
              <button className="adm-card" key={c.id} onClick={() => onNav(c.id)}>
                <div className="adm-card__top">
                  <span className="adm-card__ico"><AdmIcon name={c.icon} size={19} /></span>
                  <AdmIcon name="ArrowUpRight" size={16} style={{ color: "var(--muted-soft)" }} />
                </div>
                <h3 className="adm-card__title">{c.title}</h3>
                <p className="adm-card__desc">{c.desc}</p>
                <div className="adm-card__stat">{c.stat}</div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── Tenants ──────────────────────────────────────────────── */
function planPill(plan) { return <span className="adm-pill">{plan}</span>; }

function TenantsView({ onOpenTenant }) {
  const [q, setQ] = aUseState("");
  const [filter, setFilter] = aUseState("all");
  const chips = [
    { id: "all", label: "All" }, { id: "Founder", label: "Founder" }, { id: "Pro", label: "Pro" },
    { id: "Personal", label: "Personal" }, { id: "Free", label: "Free" }, { id: "past_due", label: "Past due" },
  ];
  let rows = window.ADM.TENANTS;
  if (q) rows = rows.filter((r) => (r.handle + " " + r.id).toLowerCase().includes(q.toLowerCase()));
  if (filter !== "all") rows = rows.filter((r) => r.plan === filter || r.status === filter);

  const columns = [
    { id: "handle", label: "Tenant", render: (r) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span className="adm-rowlink">{r.handle}</span>
        <span className="adm-mono" style={{ fontSize: 10.5 }}>{r.id}</span>
      </div>
    )},
    { id: "plan", label: "Plan", render: (r) => planPill(r.plan) },
    { id: "status", label: "Status", render: (r) => <Pill status={r.status} /> },
    { id: "runs", label: "Runs · MTD", align: "right", render: (r) => <span className="adm-num">{r.runs.toLocaleString()}</span> },
    { id: "spend", label: "Spend · MTD", align: "right", render: (r) => <span className="adm-num">{r.spend}</span> },
    { id: "members", label: "Seats", align: "right", render: (r) => <span className="adm-num">{r.members}</span> },
    { id: "last", label: "Last activity", render: (r) => <span className="adm-mono">{r.last}</span> },
  ];
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Tenants" title="Tenants"
        lede="Every tenant in the database. Drill into a row for usage, cost, connected accounts, and recent agent runs."
        actions={<button className="adm-btn adm-btn--ghost"><AdmIcon name="Download" size={15} />Export CSV</button>} />
      <Toolbar query={q} onQuery={setQ} placeholder="Search handle or tenant ID…" chips={chips} active={filter} onChip={setFilter} />
      <Block title="Results" meta={rows.length + " matched"}>
        <Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => onOpenTenant(r.id)} />
      </Block>
    </div>
  );
}

function TenantDetailView({ onBack }) {
  const d = window.ADM.TENANT_DETAIL;
  const agentCols = [
    { id: "name", label: "Sub-agent", render: (r) => <span style={{ fontWeight: 500 }}>{r.name}</span> },
    { id: "runs", label: "Runs · MTD", align: "right", render: (r) => <span className="adm-num">{r.runs.toLocaleString()}</span> },
    { id: "last", label: "Last run", render: (r) => <span className="adm-mono">{r.last}</span> },
    { id: "status", label: "Status", render: (r) => <Pill status={r.status} /> },
  ];
  return (
    <div className="adm-page">
      <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={onBack} style={{ marginBottom: "var(--sp-16)" }}><AdmIcon name="ArrowLeft" size={15} />All tenants</button>
      <PageHead kicker={"Tenant · " + d.handle} title={d.handle}
        actions={<React.Fragment>
          <button className="adm-btn adm-btn--ghost"><AdmIcon name="UserCog" size={15} />Impersonate</button>
          <button className="adm-btn adm-btn--ghost"><AdmIcon name="RefreshCw" size={15} />Re-brief</button>
        </React.Fragment>} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: -8, marginBottom: 8 }}>
        <Pill status={d.status} /><span className="adm-pill">{d.plan}</span>
        <span className="adm-pill">{d.region}</span><span className="adm-pill">{d.email}</span>
      </div>
      <Block title="Usage · this month"><div className="adm-dl">{d.usage.map((u, i) => (
        <div className="adm-dl__item" key={i}><span className="adm-dl__k">{u.k}</span><span className="adm-dl__v adm-num">{u.v}</span></div>
      ))}</div></Block>
      <Block title="Sub-agent runs"><Table columns={agentCols} rows={d.agents} rowKey={(r) => r.name} /></Block>
    </div>
  );
}

/* ── Queue ────────────────────────────────────────────────── */
function QueueView() {
  const cols = [
    { id: "id", label: "Job", render: (r) => <span className="adm-mono" style={{ color: "var(--brand-orange)" }}>{r.id}</span> },
    { id: "agent", label: "Agent", render: (r) => <span style={{ fontWeight: 500 }}>{r.agent}</span> },
    { id: "tenant", label: "Tenant", render: (r) => <span className="adm-mono">{r.tenant}</span> },
    { id: "kind", label: "Kind", render: (r) => <span className="adm-sub">{r.kind}</span> },
    { id: "attempt", label: "Attempt", align: "right", render: (r) => <span className="adm-num">{r.attempt}</span> },
    { id: "dur", label: "Duration", align: "right", render: (r) => <span className="adm-num">{r.dur}</span> },
    { id: "status", label: "Status", render: (r) => <Pill status={r.status} /> },
  ];
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Queue" title="Worker <em>queue</em>"
        lede="Railway worker plus BullMQ mirror — what's pending, running, failed, and retrying right now."
        actions={<button className="adm-btn adm-btn--ghost"><AdmIcon name="RefreshCw" size={15} />Refresh</button>} />
      <KpiRow items={window.ADM.QUEUE_KPIS} />
      <Block title="Live jobs" meta="auto-refresh · 5s"><Table columns={cols} rows={window.ADM.QUEUE_JOBS} rowKey={(r) => r.id} /></Block>
    </div>
  );
}

/* ── Integrations health ──────────────────────────────────── */
function IntegrationsView() {
  const cols = [
    { id: "name", label: "Integration", render: (r) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontWeight: 500 }}>{r.name}</span><span className="adm-sub">{r.scope}</span>
      </div>
    )},
    { id: "status", label: "Status", render: (r) => <Pill status={r.status} /> },
    { id: "uptime", label: "Uptime · 30d", align: "right", render: (r) => <span className="adm-num">{r.uptime}</span> },
    { id: "refresh", label: "OAuth fails", align: "right", render: (r) => <span className="adm-num" style={{ color: r.refreshFails > 0 ? "var(--alert-c)" : "var(--muted)" }}>{r.refreshFails}</span> },
    { id: "note", label: "Note", render: (r) => <span className="adm-sub">{r.note}</span> },
  ];
  const degraded = window.ADM.INTEGRATIONS.filter((i) => i.status !== "ok").length;
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Integrations health" title="Integrations <em>health</em>"
        lede="Composio per-tool status, Plaid per-tenant status, and OAuth refresh failures across the fleet." />
      {degraded > 0 ? <Note><b>{degraded} integrations need attention.</b> Plaid OAuth is failing for 11 tenants — refresh tokens expired after the provider's June rotation. X/Twitter is seeing elevated upstream 5xx.</Note> : null}
      <Block title="Connected services" meta={window.ADM.INTEGRATIONS.length + " tracked"}>
        <Table columns={cols} rows={window.ADM.INTEGRATIONS} rowKey={(r) => r.name} />
      </Block>
    </div>
  );
}

/* ── Costs ────────────────────────────────────────────────── */
function CostsView() {
  const modelCols = [
    { id: "name", label: "Model", render: (r) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontWeight: 500 }}>{r.name}</span><span className="adm-sub">{r.role}</span>
      </div>
    )},
    { id: "spend", label: "Spend · MTD", align: "right", render: (r) => <span className="adm-num">${r.spend.toLocaleString()}</span> },
    { id: "share", label: "Share", render: (r) => <div style={{ minWidth: 130 }}><Bar pct={r.pct} hot={r.hot} /></div> },
    { id: "pct", label: "", align: "right", render: (r) => <span className="adm-num adm-sub">{r.pct}%</span> },
  ];
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Costs" title="LLM <em>costs</em> &amp; margin"
        lede="Spend per model and per sub-agent, budget pacing, and blended margin by tier."
        actions={<button className="adm-btn adm-btn--ghost"><AdmIcon name="Bell" size={15} />Budget alerts</button>} />
      <KpiRow items={window.ADM.COST_KPIS} />
      <div className="adm-split" style={{ marginTop: "var(--sp-32)" }}>
        <div className="adm-panel" style={{ padding: "var(--sp-20)" }}>
          <div className="adm-block__head" style={{ marginBottom: "var(--sp-16)" }}><h2 className="adm-block__title">Spend by model</h2></div>
          <Table columns={modelCols} rows={window.ADM.COST_MODELS} rowKey={(r) => r.name} />
        </div>
        <div className="adm-panel" style={{ padding: "var(--sp-20)", display: "flex", flexDirection: "column", gap: "var(--sp-16)" }}>
          <div className="adm-block__head" style={{ margin: 0 }}><h2 className="adm-block__title">Daily spend · 14d</h2></div>
          <Spark data={window.ADM.COST_SPARK} />
          <div className="adm-block__head" style={{ margin: "8px 0 0" }}><h2 className="adm-block__title">By sub-agent</h2></div>
          <div className="adm-list" style={{ gap: 10 }}>
            {window.ADM.COST_AGENTS.map((a) => (
              <div key={a.name} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{a.name}</span><span className="adm-num adm-sub">{a.spend}</span>
                </div>
                <Bar pct={a.share} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Health / SLO ─────────────────────────────────────────── */
function HealthView() {
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Health" title="Service <em>health</em>"
        lede="Per-service SLO board with uptime and error-budget consumption, sourced from the telemetry pipeline." />
      <div className="adm-slo">
        {window.ADM.HEALTH.map((s) => {
          const k = statusKind(s.status);
          const dot = k === "ok" ? "adm-dot--ok" : k === "alert" ? "adm-dot--alert" : "adm-dot--warn";
          const low = s.budget < 30;
          return (
            <div className="adm-slo__card" key={s.name}>
              <div className="adm-slo__row">
                <span className="adm-slo__name"><span className={"adm-dot " + dot} />{s.name}</span>
                <Pill status={s.status} />
              </div>
              <div className="adm-slo__row"><span className="adm-slo__val">{s.uptime} uptime</span><span className="adm-slo__val adm-sub">SLO {s.slo}</span></div>
              <div>
                <Bar pct={s.budget} hot={low} />
                <div className="adm-slo__budget" style={{ marginTop: 6 }}><span>Error budget</span><span style={{ color: low ? "var(--alert-c)" : "var(--muted)" }}>{s.budget}% left</span></div>
              </div>
              <div className="adm-slo__budget"><span>Latency</span><span>{s.latency}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { DashboardView, TenantsView, TenantDetailView, QueueView, IntegrationsView, CostsView, HealthView });
