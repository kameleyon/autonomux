/* ============================================================
   ControlRoom — surfaces (React/Babel → window)
   Overview · Runs · Activity · Approvals · Costs · Integrations
   · Automations (+detail +run-detail) · Audit
   Shared state + handlers arrive via the `ctx` prop from cr-app.
   ============================================================ */
const { useState: svUseState, useMemo: svUseMemo } = React;
const SV = window;

function tierLabel(id) { const t = window.CR.TIERS.find((x) => x.id === id); return t ? t.name : id; }
function jobName(id) { const j = window.CR.byId(id); return j.name || id; }

/* ── reusable section header on the wash ─────────────────────── */
function BlockHead({ icon, title, count, children }) {
  return (
    <div className="cr-block__head">
      <span className="cr-block__title"><SV.CRIcon name={icon} size={13} />{title}{count != null ? <span className="cr-count">{count}</span> : null}</span>
      {children ? <span className="cr-block__actions">{children}</span> : null}
    </div>
  );
}

/* ── Integration strip (compact) ─────────────────────────────── */
function IntegrationStrip({ integrations }) {
  const dotCls = (s) => s === "connected" ? "cr-dot--ok" : s === "expiring" ? "cr-dot--warn" : "cr-dot--bad";
  return (
    <div className="cr-panel">
      <div className="cr-panel__head"><span className="cr-panel__title"><SV.CRIcon name="Plug" size={14} />Integrations</span></div>
      <div className="cr-panel__body" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {integrations.map((it) => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span className={"cr-dot " + dotCls(it.state)} />
            <span style={{ fontSize: 13, color: "var(--ink)", flex: 1 }}>{it.name}</span>
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10.5, color: it.state === "disconnected" ? "var(--brand-red)" : it.state === "expiring" ? "#a8530e" : "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{it.state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Approval card ───────────────────────────────────────────── */
function ApprovalCard({ a, onDecide, onConfirm }) {
  const urgent = a.ttlMin <= 20;
  const decide = (state) => {
    if (state === "approved" && a.highRisk) {
      onConfirm({
        title: "Confirm with 2FA", danger: false,
        body: `This is a high-risk action (${(window.CR.ACLASS[a.aclass] || {}).label}). In production you'd complete a 2FA step-up here before it executes.`,
        confirmLabel: "Verify & approve",
        onConfirm: () => onDecide(a.id, "approved"),
      });
    } else { onDecide(a.id, state); }
  };
  return (
    <div className={"cr-appr" + (urgent && !a.state ? " cr-appr--urgent" : "") + (a.state ? " cr-appr--resolved" : "")}>
      <span className="cr-appr__ico"><SV.CRIcon name={a.icon} size={19} /></span>
      <div className="cr-appr__body">
        <div className="cr-appr__title">{a.title}</div>
        <div className="cr-appr__detail">{a.detail}</div>
        <div className="cr-appr__chips">
          <SV.ClassChip aclass={a.aclass} />
          {a.costCents ? <span className="cr-chip-flat"><SV.CRIcon name="Coins" size={11} />{SV.crMoney(a.costCents)} if approved</span> : null}
          {a.highRisk ? <span className="cr-2fa"><SV.CRIcon name="ShieldCheck" size={11} />2FA step-up</span> : null}
          <span className="cr-chip-flat">{a.agent}</span>
        </div>
      </div>
      <div className="cr-appr__right">
        <span className={"cr-ttl" + (urgent ? " cr-ttl--urgent" : "")}><SV.CRIcon name="Timer" size={12} />{a.ttlMin}m left</span>
        {a.state ? (
          <span className={"cr-appr__done " + (a.state === "approved" ? "cr-appr__done--ok" : "cr-appr__done--no")}>
            <SV.CRIcon name={a.state === "approved" ? "Check" : "X"} size={13} />{a.state === "approved" ? "Approved" : "Denied"}
          </span>
        ) : (
          <div className="cr-appr__actions">
            <button className="cr-qa" onClick={() => decide("denied")}>Deny</button>
            <button className="cr-qa cr-qa--primary" onClick={() => decide("approved")}>Approve</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── OVERVIEW (landing) ──────────────────────────────────────── */
function OverviewView({ ctx }) {
  const live = ctx.runs.filter((r) => r.status === "running" || r.status === "queued" || r.status === "awaiting_approval");
  const pending = ctx.approvals.filter((a) => !a.state);
  const b = window.CR.BUDGET;
  const successAvg = Math.round(window.CR.HEALTH.reduce((s, h) => s + h.successRate, 0) / window.CR.HEALTH.length);
  return (
    <div className="ae-screen">
      <SV.ScreenHead kicker="ControlRoom" title="Everything your <em>second self</em> is doing."
        lede="What's running now, what it just did, and what's waiting on you — live, in one place." />

      <div className="cr-kpis">
        <SV.KPITile icon="Activity" label="Running now" value={live.filter((r) => r.status === "running").length} sub={live.filter((r) => r.status === "queued").length + " queued · " + live.filter((r) => r.status === "awaiting_approval").length + " awaiting"} accent />
        <SV.KPITile icon="ShieldAlert" label="Needs you" value={pending.length} sub={pending.length ? "<b>" + pending.filter((a) => a.ttlMin <= 20).length + " urgent</b> · approve soon" : "all clear"} />
        <SV.KPITile icon="Coins" label="Today" value={SV.crMoney(b.todayCents)} sub={"this month " + SV.crMoney(b.monthUsedCents) + " of " + SV.crMoney(b.monthCeilingCents)} pct={(b.monthUsedCents / b.monthCeilingCents) * 100} />
        <SV.KPITile icon="CircleCheck" label="Success rate" value={successAvg} unit="%" sub="across 5 automations · last 30 runs" />
      </div>

      <div className="cr-block">
        <div className="cr-grid2">
          <div>
            <BlockHead icon="Radio" title="Live run feed" count={live.length}>
              <button className="cr-fchip" onClick={() => ctx.setView("runs")}>Open feed<SV.CRIcon name="ArrowRight" size={12} /></button>
            </BlockHead>
            <div className="cr-feed">
              {live.length === 0 ? <div className="cr-empty">No runs in flight. Scheduled jobs will appear here the moment they fire.</div>
                : live.map((r) => <SV.RunRow key={r.id} run={r} fresh={ctx.freshIds.has(r.id)} onOpen={ctx.openRun} onPin={ctx.pinRun} onCancel={ctx.cancelRun} />)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-16)" }}>
            <div>
              <BlockHead icon="ShieldAlert" title="Approvals" count={pending.length}>
                {pending.length ? <button className="cr-fchip" onClick={() => ctx.setView("approvals")}>All<SV.CRIcon name="ArrowRight" size={12} /></button> : null}
              </BlockHead>
              {pending.slice(0, 2).map((a) => <div key={a.id} style={{ marginBottom: 8 }}><ApprovalCard a={a} onDecide={ctx.decide} onConfirm={ctx.confirm} /></div>)}
              {pending.length === 0 ? <div className="cr-empty">Nothing waiting on you.</div> : null}
            </div>
            <IntegrationStrip integrations={ctx.integrations} />
          </div>
        </div>
      </div>

      <div className="cr-block">
        <BlockHead icon="History" title="Recent activity">
          <button className="cr-fchip" onClick={() => ctx.setView("activity")}>Full timeline<SV.CRIcon name="ArrowRight" size={12} /></button>
        </BlockHead>
        <div className="cr-timeline">
          {ctx.activity.slice(0, 5).map((it) => <ActivityRow key={it.id} it={it} ctx={ctx} />)}
        </div>
      </div>
    </div>
  );
}

/* ── RUNS (full live feed) ───────────────────────────────────── */
const RUN_FILTERS = [
  { id: "all", label: "All" }, { id: "running", label: "Running" },
  { id: "awaiting_approval", label: "Awaiting" }, { id: "queued", label: "Queued" },
  { id: "completed", label: "Completed" }, { id: "failed", label: "Failed" },
];
function RunsView({ ctx }) {
  const [filter, setFilter] = svUseState("all");
  const [q, setQ] = svUseState("");
  const [sel, setSel] = svUseState([]);
  let rows = ctx.runs;
  if (filter !== "all") rows = rows.filter((r) => r.status === filter);
  if (q) rows = rows.filter((r) => r.jobName.toLowerCase().includes(q.toLowerCase()));
  const toggleSel = (id) => setSel((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  return (
    <div className="ae-screen">
      <SV.ScreenHead kicker="ControlRoom · Runs" title="The <em>live</em> run feed."
        lede="Every run in flight and just-finished, streaming in real time. Pin one to keep it on top; cancel anything mid-flight." />
      <div className="cr-filters">
        {RUN_FILTERS.map((f) => <button key={f.id} className={"cr-fchip" + (filter === f.id ? " cr-fchip--active" : "")} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        <span className="cr-search"><SV.CRIcon name="Search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by automation…" /></span>
      </div>
      {sel.length ? (
        <div className="cr-bulk">
          <span className="cr-bulk__count">{sel.length} selected</span>
          <span className="cr-bulk__sp" />
          <button className="cr-qa" onClick={() => { ctx.toast({ icon: "Check", text: "Acknowledged " + sel.length + " runs" }); setSel([]); }}>Acknowledge</button>
          <button className="cr-qa cr-qa--danger" onClick={() => { ctx.bulkCancel(sel); setSel([]); }}>Cancel running</button>
          <button className="cr-iconbtn" onClick={() => setSel([])}><SV.CRIcon name="X" size={15} /></button>
        </div>
      ) : null}
      <div className="cr-feed">
        {rows.length === 0 ? <div className="cr-empty">No runs match this filter.</div>
          : rows.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
              <button className={"cr-iconbtn cr-iconbtn--wash" + (sel.includes(r.id) ? " cr-iconbtn--on" : "")} style={{ alignSelf: "center" }} onClick={() => toggleSel(r.id)} title="Select">
                <SV.CRIcon name={sel.includes(r.id) ? "SquareCheckBig" : "Square"} size={16} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}><SV.RunRow run={r} fresh={ctx.freshIds.has(r.id)} onOpen={ctx.openRun} onPin={ctx.pinRun} onCancel={ctx.cancelRun} /></div>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ── ACTIVITY timeline row ───────────────────────────────────── */
function ActivityRow({ it, ctx }) {
  const out = it.outcome === "failed" ? "ae-out--fail" : it.outcome === "observed" ? "ae-out--obs" : "ae-out--ok";
  return (
    <div className={"cr-act" + (!it.ack ? " cr-act--unack" : "")}>
      <span className="cr-act__ico"><SV.CRIcon name={it.icon} size={16} /></span>
      <div className="cr-act__main">
        <span className="cr-act__line"><b>{jobName(it.jobId)}</b> {it.verb}</span>
        <span className="cr-act__sub">{it.detail}</span>
      </div>
      <span className="cr-act__meta">
        <span className={"ae-out " + out}>{it.outcome}</span>
        {it.costCents ? <span className="cr-act__time">{SV.crMoney(it.costCents)}</span> : null}
        <span className="cr-act__time">{it.t}</span>
        <span className="cr-act__actions">
          {it.undoable && !it.undone ? <button className="cr-iconbtn" title="Undo" onClick={() => ctx.undo(it.id)}><SV.CRIcon name="Undo2" size={15} /></button> : null}
          {!it.ack ? <button className="cr-iconbtn" title="Acknowledge" onClick={() => ctx.ack(it.id)}><SV.CRIcon name="Check" size={15} /></button> : null}
        </span>
      </span>
    </div>
  );
}
function ActivityView({ ctx }) {
  const [q, setQ] = svUseState("");
  const unack = ctx.activity.filter((a) => !a.ack).length;
  let items = ctx.activity;
  if (q) items = items.filter((a) => (a.detail + " " + jobName(a.jobId)).toLowerCase().includes(q.toLowerCase()));
  const today = items.filter((a) => a.ts < 720);
  const earlier = items.filter((a) => a.ts >= 720);
  return (
    <div className="ae-screen">
      <SV.ScreenHead kicker="ControlRoom · Activity" title="What AlterEgo <em>did</em>."
        lede="A chronological feed of every action — pulled from the audit log and run history. Acknowledge what you've seen; undo what's still reversible."
        actions={unack ? <button className="ae-screen-btn" onClick={ctx.ackAll}><SV.CRIcon name="CheckCheck" size={15} />Acknowledge all ({unack})</button> : null} />
      <div className="cr-filters">
        <span className="cr-search"><SV.CRIcon name="Search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity — recipient, subject, file…" /></span>
      </div>
      {today.length ? <div className="cr-day">Today</div> : null}
      <div className="cr-timeline">{today.map((it) => <ActivityRow key={it.id} it={it} ctx={ctx} />)}</div>
      {earlier.length ? <div className="cr-day">Earlier</div> : null}
      <div className="cr-timeline">{earlier.map((it) => <ActivityRow key={it.id} it={it} ctx={ctx} />)}</div>
      {items.length === 0 ? <div className="cr-empty cr-empty--light">Nothing matches “{q}”.</div> : null}
    </div>
  );
}

/* ── APPROVALS inbox ─────────────────────────────────────────── */
function ApprovalsView({ ctx }) {
  const pending = ctx.approvals.filter((a) => !a.state).sort((x, y) => x.ttlMin - y.ttlMin);
  const resolved = ctx.approvals.filter((a) => a.state);
  return (
    <div className="ae-screen">
      <SV.ScreenHead kicker="ControlRoom · Approvals" title="What <em>needs you</em>."
        lede="Pending decisions across every automation, sorted by how soon they expire. High-risk actions ask for a 2FA step-up."
        actions={pending.length ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ae-screen-btn" onClick={() => ctx.confirm({ title: "Deny all pending?", danger: false, body: pending.length + " approvals will be denied. The automations stay active; only these specific actions are declined.", confirmLabel: "Deny all", onConfirm: () => ctx.decideAll("denied") })}>Deny all</button>
            <button className="ae-screen-btn ae-screen-btn--primary" onClick={() => ctx.confirm({ title: "Approve all pending?", danger: false, body: pending.length + " actions will execute, including any irreversible ones. High-risk items still require their 2FA step-up.", confirmLabel: "Approve all", onConfirm: () => ctx.decideAll("approved") })}>Approve all</button>
          </div>
        ) : null} />
      <div className="cr-approvals">
        {pending.length === 0 ? <div className="cr-empty cr-empty--light">Inbox zero. Nothing is waiting on your decision.</div>
          : pending.map((a) => <ApprovalCard key={a.id} a={a} onDecide={ctx.decide} onConfirm={ctx.confirm} />)}
      </div>
      {resolved.length ? (
        <div className="cr-block">
          <BlockHead icon="History" title="Recently decided" />
          <div className="cr-approvals">{resolved.map((a) => <ApprovalCard key={a.id} a={a} onDecide={ctx.decide} onConfirm={ctx.confirm} />)}</div>
        </div>
      ) : null}
    </div>
  );
}

/* ── COSTS dashboard ─────────────────────────────────────────── */
function CostsView({ ctx }) {
  const b = window.CR.BUDGET;
  const agentTotal = window.CR.COST_BY_AGENT.reduce((s, x) => s + x.cents, 0);
  const modelTotal = window.CR.COST_BY_MODEL.reduce((s, x) => s + x.cents, 0);
  const topJobs = [...window.CR.HEALTH].sort((a, b) => b.monthCostCents - a.monthCostCents);
  const maxJob = topJobs[0].monthCostCents;
  return (
    <div className="ae-screen">
      <SV.ScreenHead kicker="ControlRoom · Costs" title="What it <em>costs</em> to run you."
        lede="Spend broken down by day, automation, sub-agent, and model — against your monthly ceiling."
        actions={<button className="ae-screen-btn" onClick={() => ctx.toast({ icon: "Download", text: "Cost report exported as CSV" })}><SV.CRIcon name="Download" size={15} />Export CSV</button>} />
      <div className="cr-kpis">
        <SV.KPITile icon="Coins" label="This month" value={SV.crMoney(b.monthUsedCents)} sub={"of " + SV.crMoney(b.monthCeilingCents) + " ceiling · " + Math.round(b.monthUsedCents / b.monthCeilingCents * 100) + "% used"} pct={b.monthUsedCents / b.monthCeilingCents * 100} accent />
        <SV.KPITile icon="CalendarDays" label="This week" value={SV.crMoney(b.weekCents)} sub="14% under last week" />
        <SV.KPITile icon="Sun" label="Today" value={SV.crMoney(b.todayCents)} sub="9 runs so far" />
        <SV.KPITile icon="TrendingUp" label="Avg / run" value="$0.04" sub="across 1,343 runs this month" />
      </div>

      <div className="cr-block">
        <div className="cr-grid2">
          <div className="cr-panel">
            <div className="cr-panel__head"><span className="cr-panel__title"><SV.CRIcon name="ChartArea" size={14} />Spend · last 14 days</span><span className="cr-panel__meta">cents/day</span></div>
            <div className="cr-panel__body"><SV.AreaChart data={window.CR.COST_SERIES} /></div>
          </div>
          <div className="cr-panel">
            <div className="cr-panel__head"><span className="cr-panel__title"><SV.CRIcon name="ChartPie" size={14} />By sub-agent</span></div>
            <div className="cr-panel__body"><SV.Donut segments={window.CR.COST_BY_AGENT} total={agentTotal} centerLabel={SV.crMoney(agentTotal)} centerSub="30 days" /></div>
          </div>
        </div>
      </div>

      <div className="cr-block">
        <div className="cr-grid2">
          <div className="cr-panel">
            <div className="cr-panel__head"><span className="cr-panel__title"><SV.CRIcon name="ListOrdered" size={14} />Top automations</span><span className="cr-panel__meta">this month</span></div>
            <div className="cr-panel__body" style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {topJobs.map((j) => (
                <div className="cr-leg" key={j.id}>
                  <span className="cr-leg__name" style={{ flex: "0 0 130px" }}>{j.name}</span>
                  <span className="cr-leg__bar"><span style={{ width: (j.monthCostCents / maxJob * 100) + "%", background: "linear-gradient(90deg,#f26b1a,#e63312)" }} /></span>
                  <span className="cr-leg__val">{SV.crMoney(j.monthCostCents)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="cr-panel">
            <div className="cr-panel__head"><span className="cr-panel__title"><SV.CRIcon name="Cpu" size={14} />By model</span></div>
            <div className="cr-panel__body"><SV.Donut segments={window.CR.COST_BY_MODEL} total={modelTotal} centerLabel={SV.crMoney(modelTotal)} centerSub="30 days" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── INTEGRATIONS ────────────────────────────────────────────── */
function IntegrationsView({ ctx }) {
  const stCls = (s) => "cr-intg__state--" + s;
  const stLabel = { connected: "Connected", expiring: "Expiring", disconnected: "Disconnected" };
  return (
    <div className="ae-screen">
      <SV.ScreenHead kicker="ControlRoom · Integrations" title="Where your <em>second self</em> connects."
        lede="Per-integration health and the automations that depend on each. Reconnect refreshes OAuth; revoking auto-pauses anything that relies on it." />
      <div className="cr-intg-grid">
        {ctx.integrations.map((it) => (
          <div className="cr-intg" key={it.id}>
            <div className="cr-intg__top">
              <span className="cr-intg__ico"><SV.CRIcon name={it.icon} size={19} /></span>
              <span className="cr-intg__name">{it.name}</span>
              <span className={"cr-intg__state " + stCls(it.state)}>{stLabel[it.state]}</span>
            </div>
            <p className="cr-intg__detail">{it.detail}</p>
            <div className="cr-intg__foot">
              <span className="cr-intg__affected">{it.affected.length} automation{it.affected.length === 1 ? "" : "s"}</span>
              <span className="cr-intg__btns">
                {it.state === "disconnected"
                  ? <button className="cr-qa cr-qa--primary" onClick={() => ctx.reconnect(it.id)}><SV.CRIcon name="Plug" size={13} />Connect</button>
                  : <React.Fragment>
                      <button className="cr-qa" onClick={() => ctx.reconnect(it.id)}><SV.CRIcon name="RefreshCw" size={13} />Reconnect</button>
                      <button className="cr-qa cr-qa--danger" onClick={() => ctx.confirm({ title: "Revoke " + it.name + "?", danger: true, body: "This disconnects " + it.name + " and auto-pauses the " + it.affected.length + " automation(s) that depend on it. You can reconnect later.", confirmLabel: "Revoke & pause", onConfirm: () => ctx.toast({ icon: "Unplug", text: it.name + " revoked · " + it.affected.length + " automations paused" }) })}>Revoke</button>
                    </React.Fragment>}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── AUTOMATIONS health grid + detail ────────────────────────── */
const AE_STATUS_CR = { active: { label: "Active", cls: "ae-jst--active" }, paused: { label: "Paused", cls: "ae-jst--paused" }, observe: { label: "Observe ramp", cls: "ae-jst--observe" }, draft: { label: "Draft", cls: "ae-jst--draft" } };
function HealthCard({ h, ctx, onOpen }) {
  const st = AE_STATUS_CR[h.status] || AE_STATUS_CR.active;
  const dotCls = (id) => { const it = ctx.integrations.find((x) => x.id === id); return it ? (it.state === "connected" ? "cr-dot--ok" : it.state === "expiring" ? "cr-dot--warn" : "cr-dot--bad") : "cr-dot--ok"; };
  const paused = h.status === "paused";
  return (
    <div className="cr-hc" onClick={() => onOpen(h.id)}>
      <div className="cr-hc__top">
        <span className="cr-hc__ico"><SV.CRIcon name={h.icon} size={19} /></span>
        <div className="cr-hc__head">
          <span className="cr-hc__name">{h.name}</span>
          <span className="cr-hc__trigger"><SV.CRIcon name={h.trigger === "Schedule" ? "Clock" : "Zap"} size={11} />{h.triggerText}</span>
        </div>
        <span className={"ae-jst " + st.cls}>{st.label}</span>
      </div>
      <div className="cr-hc__metrics">
        <div className="cr-hc__m"><span className="cr-hc__mk">Success</span><span className={"cr-hc__mv " + (h.successRate >= 98 ? "cr-hc__mv--ok" : h.successRate >= 90 ? "" : "cr-hc__mv--warn")}>{h.successRate}%</span></div>
        <div className="cr-hc__m"><span className="cr-hc__mk">Avg cost</span><span className="cr-hc__mv">{SV.crMoney(h.costPerRunCents)}</span></div>
        <div className="cr-hc__m"><span className="cr-hc__mk">Avg run</span><span className="cr-hc__mv">{h.avgDurSec}s</span></div>
      </div>
      <div className="cr-hc__spark">
        <div className="cr-hc__sparkrow">
          {h.spark.map((v, i) => <span key={i} className={"cr-tick " + (v ? "cr-tick--ok" : "cr-tick--fail")} style={{ height: v ? "100%" : "55%" }} />)}
        </div>
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9.5, color: "var(--muted-soft)", letterSpacing: "0.06em" }}>LAST 30 RUNS · {h.fails} failed</span>
      </div>
      <div className="cr-hc__foot" onClick={(e) => e.stopPropagation()}>
        <span className="cr-hc__qa">
          <button className="cr-qa" onClick={() => ctx.runNow(h.name)}><SV.CRIcon name="Play" size={12} />Run</button>
          <button className="cr-qa" onClick={() => ctx.togglePause(h.id)}><SV.CRIcon name={paused ? "Play" : "Pause"} size={12} />{paused ? "Resume" : "Pause"}</button>
          <button className="cr-qa" onClick={() => ctx.toast({ icon: "Pencil", text: "Opening " + h.name + " in AutoRoom…" })}><SV.CRIcon name="Pencil" size={12} />Edit</button>
        </span>
        <span className="cr-hc__intg">
          {h.integrations.length ? h.integrations.map((id) => <span key={id} className={"cr-dot " + dotCls(id)} title={id} />) : <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "var(--muted-soft)" }}>no integrations</span>}
        </span>
      </div>
    </div>
  );
}

const AUTO_FILTERS = [
  { id: "all-active", label: "All active" }, { id: "needs-attention", label: "Needs attention" },
  { id: "most-expensive", label: "Most expensive" }, { id: "recently-changed", label: "Recently changed" }, { id: "archived", label: "Archived" },
];
function AutomationsView({ ctx, viewId }) {
  const [filter, setFilter] = svUseState(viewId && viewId !== "automations" ? viewId : "all-active");
  React.useEffect(() => { if (viewId) setFilter(viewId); }, [viewId]);
  let rows = [...ctx.health];
  if (filter === "needs-attention") rows = rows.filter((h) => h.fails > 0 || h.successRate < 98 || ctx.approvals.some((a) => !a.state && a.jobId === h.id));
  else if (filter === "most-expensive") rows = rows.sort((a, b) => b.monthCostCents - a.monthCostCents);
  else if (filter === "archived") rows = rows.filter((h) => h.status === "paused");
  else rows = rows.filter((h) => h.status !== "paused");
  return (
    <div className="ae-screen">
      <SV.ScreenHead kicker="ControlRoom · Automations" title="Is each job <em>okay?</em>"
        lede="A health card per automation — success rate, cost, the last 30 runs, and the integrations it leans on. Open one for the full picture."
        actions={<button className="ae-screen-btn ae-screen-btn--primary" onClick={() => ctx.confirm({ title: "Pause all automations?", danger: false, body: "Every active automation stops until you resume. In-flight runs finish their current step first. Use this for vacations or incidents.", confirmLabel: "Pause everything", onConfirm: () => ctx.pauseAll() })}><SV.CRIcon name="CirclePause" size={15} />Pause all</button>} />
      <div className="cr-filters">
        {AUTO_FILTERS.map((f) => <button key={f.id} className={"cr-fchip" + (filter === f.id ? " cr-fchip--active" : "")} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      <div className="cr-health-grid">
        {rows.length === 0 ? <div className="cr-empty cr-empty--light">Nothing here — that's a good thing.</div>
          : rows.map((h) => <HealthCard key={h.id} h={h} ctx={ctx} onOpen={ctx.openAutomation} />)}
      </div>
    </div>
  );
}

window.CRSurfaces = { OverviewView, RunsView, ActivityView, ApprovalsView, CostsView, IntegrationsView, AutomationsView, ApprovalCard, ActivityRow, HealthCard, BlockHead };
