/* ============================================================
   autonomux Admin — section views B (Trust + Ops)
   Audit log · Activity · Compliance · Billing · Feature flags · Support
   ============================================================ */

/* ── Audit log ────────────────────────────────────────────── */
function AuditView() {
  const [q, setQ] = aUseState("");
  const [verified, setVerified] = aUseState(false);
  const [verifying, setVerifying] = aUseState(false);
  const chips = [{ id: "all", label: "All actors" }, { id: "admin", label: "Admin" }, { id: "agent", label: "Agent" }, { id: "user", label: "User" }];
  const [actor, setActor] = aUseState("all");
  let rows = window.ADM.AUDIT;
  if (q) rows = rows.filter((r) => (r.action + r.actor + r.tenant).toLowerCase().includes(q.toLowerCase()));
  if (actor !== "all") rows = rows.filter((r) => r.kind === actor);

  const verify = () => { setVerifying(true); setTimeout(() => { setVerifying(false); setVerified(true); }, 1100); };
  const cols = [
    { id: "ts", label: "Timestamp", render: (r) => <span className="adm-mono">{r.ts}</span> },
    { id: "actor", label: "Actor", render: (r) => <span style={{ fontWeight: 500 }}>{r.actor}</span> },
    { id: "kind", label: "Kind", render: (r) => <span className="adm-pill">{r.kind}</span> },
    { id: "action", label: "Action", render: (r) => <span className="adm-mono" style={{ color: "var(--brand-orange)" }}>{r.action}</span> },
    { id: "tenant", label: "Tenant", render: (r) => <span className="adm-mono">{r.tenant}</span> },
  ];
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Audit log" title="Audit <em>log</em>"
        lede="Every privileged action, signed into a tamper-evident chain. Searchable, exportable, 7-year retention."
        actions={<React.Fragment>
          <button className="adm-btn adm-btn--ghost"><AdmIcon name="Download" size={15} />Export</button>
          <button className={"adm-btn " + (verified ? "adm-btn--ghost" : "adm-btn--primary")} onClick={verify} disabled={verifying || verified}>
            <AdmIcon name={verified ? "ShieldCheck" : "ShieldQuestion"} size={15} />
            {verifying ? "Verifying…" : verified ? "Chain verified" : "Verify chain"}
          </button>
        </React.Fragment>} />
      {verified ? <Note><b>Signed chain verified.</b> All 1,402,883 entries hash-link correctly back to genesis. No tampering detected.</Note> : null}
      <Toolbar query={q} onQuery={setQ} placeholder="Search action, actor, tenant…" chips={chips} active={actor} onChip={setActor} />
      <Block title="Events" meta={rows.length + " shown · 7-yr retention"}><Table columns={cols} rows={rows} rowKey={(r) => r.ts} /></Block>
    </div>
  );
}

/* ── Activity (user-facing mirror) ────────────────────────── */
function ActivityView() {
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Activity log" title="Activity <em>mirror</em>"
        lede="Exactly what the tenant sees in their own activity feed — surfaced here for support context."
        actions={<span className="adm-env"><span className="adm-dot adm-dot--live" />Live</span>} />
      <Block title="Recent activity" meta="all tenants">
        <div className="adm-list">
          {window.ADM.ACTIVITY.map((a, i) => (
            <div className="adm-listrow" key={i}>
              <span className="adm-card__ico" style={{ width: 34, height: 34 }}><AdmIcon name={a.icon} size={17} /></span>
              <div className="adm-listrow__main">
                <span className="adm-listrow__title">{a.title}</span>
                <span className="adm-listrow__sub">{a.detail}</span>
              </div>
              <span className="adm-mono">{a.tenant}</span>
              <span className="adm-mono adm-sub" style={{ minWidth: 44, textAlign: "right" }}>{a.ts}</span>
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}

/* ── Compliance ───────────────────────────────────────────── */
function ComplianceView() {
  const qCols = [
    { id: "kind", label: "Request", render: (r) => <span style={{ fontWeight: 500 }}>{r.kind}</span> },
    { id: "tenant", label: "Tenant", render: (r) => <span className="adm-mono">{r.tenant}</span> },
    { id: "requested", label: "Requested", render: (r) => <span className="adm-mono">{r.requested}</span> },
    { id: "due", label: "SLA", render: (r) => <span className="adm-sub">{r.due}</span> },
    { id: "status", label: "Status", render: (r) => <Pill status={r.status} label={r.status === "ok" ? "done" : "open"} /> },
    { id: "act", label: "", align: "right", render: () => <button className="adm-btn adm-btn--ghost adm-btn--sm">Process</button> },
  ];
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Compliance" title="Compliance &amp; <em>evidence</em>"
        lede="GDPR export and deletion queues, DPA generation, and continuous CASA / SOC 2 evidence."
        actions={<button className="adm-btn adm-btn--primary"><AdmIcon name="FileText" size={15} />Generate DPA</button>} />
      <Block title="Subject-request queues" meta="GDPR Art. 15 / 17 · 30-day SLA">
        <Table columns={qCols} rows={window.ADM.COMPLIANCE_QUEUES} rowKey={(r) => r.kind + r.tenant} />
      </Block>
      <Block title="Evidence & attestations" meta="continuous">
        <div className="adm-list">
          {window.ADM.COMPLIANCE_EVIDENCE.map((e) => (
            <div className="adm-listrow" key={e.name}>
              <Pill status={e.status} label={e.status === "ok" ? "current" : "due soon"} />
              <div className="adm-listrow__main"><span className="adm-listrow__title">{e.name}</span><span className="adm-listrow__sub">{e.note}</span></div>
              <button className="adm-btn adm-btn--ghost adm-btn--sm"><AdmIcon name="Download" size={14} />Evidence</button>
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}

/* ── Billing ──────────────────────────────────────────────── */
function BillingView() {
  const cols = [
    { id: "plan", label: "Plan", render: (r) => <span style={{ fontWeight: 500 }}>{r.plan}</span> },
    { id: "price", label: "Price", render: (r) => <span className="adm-mono">{r.price}</span> },
    { id: "subs", label: "Subscribers", align: "right", render: (r) => <span className="adm-num">{r.subs.toLocaleString()}</span> },
    { id: "mrr", label: "MRR", align: "right", render: (r) => <span className="adm-num">{r.mrr}</span> },
    { id: "share", label: "MRR share", render: (r) => <div style={{ minWidth: 130 }}><Bar pct={r.share} hot={r.plan === "Pro"} /></div> },
  ];
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Billing" title="Billing &amp; <em>revenue</em>"
        lede="Stripe MRR, churn, and LTV, plus cohort retention and the dunning queue."
        actions={<button className="adm-btn adm-btn--ghost"><AdmIcon name="ExternalLink" size={15} />Open Stripe</button>} />
      <KpiRow items={window.ADM.BILLING_KPIS} />
      <div className="adm-split" style={{ marginTop: "var(--sp-32)" }}>
        <div className="adm-panel" style={{ padding: "var(--sp-20)" }}>
          <div className="adm-block__head" style={{ marginBottom: "var(--sp-16)" }}><h2 className="adm-block__title">MRR by plan</h2></div>
          <Table columns={cols} rows={window.ADM.BILLING_PLANS} rowKey={(r) => r.plan} />
        </div>
        <div className="adm-panel" style={{ padding: "var(--sp-20)", display: "flex", flexDirection: "column", gap: "var(--sp-12)" }}>
          <div className="adm-block__head" style={{ margin: 0 }}><h2 className="adm-block__title">Cohort retention</h2></div>
          <span className="adm-sub" style={{ fontSize: 12 }}>% of Jan 2026 cohort still active, by month</span>
          <Spark data={window.ADM.COHORT} />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "DM Mono, monospace", fontSize: 11, color: "var(--muted)" }}>
            <span>M0</span><span>M6</span>
          </div>
          <div className="adm-slo__budget" style={{ marginTop: 4 }}><span>6-month retention</span><span style={{ color: "var(--ink)" }}>65%</span></div>
        </div>
      </div>
    </div>
  );
}

/* ── Feature flags ────────────────────────────────────────── */
function FlagsView() {
  const [flags, setFlags] = aUseState(window.ADM.FLAGS.map((f) => ({ ...f })));
  const toggle = (i) => setFlags((prev) => prev.map((f, j) => j === i ? { ...f, on: !f.on, rollout: !f.on && f.rollout === 0 ? 5 : f.rollout } : f));
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Feature flags" title="Feature <em>flags</em>"
        lede="GrowthBook console — percent rollouts and per-tenant overrides. Changes write to the audit log."
        actions={<button className="adm-btn adm-btn--primary"><AdmIcon name="Plus" size={15} />New flag</button>} />
      <Block title="Active flags" meta={flags.filter((f) => f.on).length + " of " + flags.length + " on"}>
        <div className="adm-list">
          {flags.map((f, i) => (
            <div className="adm-listrow" key={f.key}>
              <button className={"adm-toggle" + (f.on ? " adm-toggle--on" : "")} onClick={() => toggle(i)} aria-label={"Toggle " + f.key} aria-pressed={f.on} />
              <div className="adm-listrow__main">
                <span className="adm-listrow__title" style={{ fontFamily: "DM Mono, monospace", fontSize: 13.5 }}>{f.key}</span>
                <span className="adm-listrow__sub">{f.desc}</span>
              </div>
              <span className="adm-pill">{f.scope}</span>
              <div style={{ minWidth: 110, display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="adm-mono adm-sub" style={{ textAlign: "right" }}>{f.on ? f.rollout + "% rollout" : "off"}</span>
                <Bar pct={f.on ? f.rollout : 0} />
              </div>
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}

/* ── Support ──────────────────────────────────────────────── */
function SupportView() {
  const [tenant, setTenant] = aUseState("");
  const [done, setDone] = aUseState(null);
  const run = (id) => { setDone(id); setTimeout(() => setDone(null), 1800); };
  return (
    <div className="adm-page">
      <PageHead kicker="PRD §3.2 · Support" title="Support <em>tools</em>"
        lede="Operator actions on a tenant's account. Everything here is logged to the audit chain — no silent access." />
      <div className="adm-panel" style={{ padding: "var(--sp-20)", marginBottom: "var(--sp-24)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className="adm-dl__k" style={{ alignSelf: "center" }}>Target tenant</span>
        <div className="adm-search" style={{ maxWidth: 320 }}>
          <AdmIcon name="Search" size={16} />
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="handle or tenant ID…" />
        </div>
        {tenant ? <span className="adm-pill adm-pill--ok"><span className="adm-dot adm-dot--ok" />{tenant}</span> : <span className="adm-sub">Select a tenant to enable actions</span>}
      </div>
      <div className="adm-cardgrid">
        {window.ADM.SUPPORT_TOOLS.map((t) => {
          const danger = t.id === "resetmem";
          const isDone = done === t.id;
          return (
            <div className="adm-card" key={t.id} style={{ cursor: "default" }}>
              <div className="adm-card__top">
                <span className="adm-card__ico" style={danger ? { background: "var(--alert-bg)", color: "var(--alert-c)" } : null}><AdmIcon name={t.icon} size={19} /></span>
              </div>
              <h3 className="adm-card__title" style={{ fontSize: 18 }}>{t.title}</h3>
              <p className="adm-card__desc">{t.desc}</p>
              <button className={"adm-btn adm-btn--sm " + (danger ? "adm-btn--danger" : "adm-btn--ghost")} style={{ marginTop: 6, alignSelf: "flex-start" }} disabled={!tenant} onClick={() => run(t.id)}>
                {isDone ? <React.Fragment><AdmIcon name="Check" size={14} />Logged</React.Fragment> : (danger ? "Reset memory" : "Run")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { AuditView, ActivityView, ComplianceView, BillingView, FlagsView, SupportView });
