/* ============================================================
   ControlRoom — detail surfaces (React/Babel → window)
   AutomationDetail (deep view) · RunDetail (step timeline) · AuditView
   ============================================================ */
const { useState: dtUseState } = React;
const DT = window;

/* version history (synthetic, per automation) */
const CR_VERSIONS = {
  "morning-briefing": [
    { v: 7, t: "3 days ago", note: "Added Treasurer alerts to the briefing payload", cur: true },
    { v: 6, t: "May 24", note: "Moved delivery from 6:30 to 7:00 AM" },
    { v: 5, t: "May 12", note: "Switched compose step from Haiku to Sonnet" },
  ],
  "inbox-declutter": [
    { v: 4, t: "6 days ago", note: "Raised per-day archive cap to 50", cur: true },
    { v: 3, t: "May 19", note: "Added 3 senders to the trusted-archive list" },
  ],
  "calendar-guard": [{ v: 2, t: "May 28", note: "Softened the decline-note tone", cur: true }, { v: 1, t: "May 10", note: "Initial version" }],
  "vip-watcher": [{ v: 3, t: "Yesterday", note: "Added Lena to the VIP list", cur: true }, { v: 2, t: "May 22", note: "Throttle to 3/hour per recipient" }, { v: 1, t: "May 8", note: "Initial version" }],
  "wellness-triple": [{ v: 1, t: "3 days ago", note: "Created from Wellness Triple template", cur: true }],
};

/* enrich a run's steps with model/aclass/cost/duration from the job def */
function enrichSteps(jobId, runSteps) {
  const job = window.CR.byId(jobId);
  const defs = job.steps || [];
  return runSteps.map((s, i) => {
    const d = defs[i] || {};
    return { ...s, model: d.model, aclass: d.aclass, input: d.input, note: d.note, skill: d.skill || s.name };
  });
}

/* ── RUN DETAIL (step timeline) ──────────────────────────────── */
function RunDetail({ run, ctx, onBack }) {
  const [open, setOpen] = dtUseState({});
  const steps = enrichSteps(run.jobId, run.steps);
  const toggle = (i) => setOpen((p) => ({ ...p, [i]: !p[i] }));
  const stepCost = (i) => Math.max(1, Math.round((run.costCents || run.totalSteps) / run.totalSteps));
  const stepDur = (i) => Math.max(1, Math.round((run.durationSec || run.totalSteps) / run.totalSteps));
  return (
    <div className="ae-screen">
      <button className="ae-screen-btn ae-screen-btn--ghost" onClick={onBack} style={{ marginBottom: "var(--sp-16)" }}><DT.CRIcon name="ArrowLeft" size={15} />Back</button>
      <div className="ae-screen-head">
        <div className="ae-screen-head__row">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="ae-detail-ico"><DT.CRIcon name={run.icon} size={24} /></span>
            <div>
              <div className="ae-screen-kicker">ControlRoom · run</div>
              <h1 className="ae-screen-h1" style={{ whiteSpace: "normal" }}>{run.jobName}</h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {run.status === "running" ? <button className="ae-screen-btn" onClick={() => ctx.cancelRun(run)}><DT.CRIcon name="Square" size={14} />Cancel</button> : null}
            <button className="ae-screen-btn" onClick={() => ctx.toast({ icon: "RotateCcw", text: "Replaying " + run.jobName + " from scratch…" })}><DT.CRIcon name="RotateCcw" size={14} />Replay</button>
            <button className="ae-screen-btn ae-screen-btn--ghost" onClick={() => ctx.toast({ icon: "Link", text: "Run permalink copied" })}><DT.CRIcon name="Link" size={14} />Share</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: -8, marginBottom: 16 }}>
        <DT.StatusChip status={run.status} />
        <span className="ae-chip-flat"><DT.CRIcon name="Clock" size={12} />{DT.crDur(run.durationSec)}</span>
        <span className="ae-chip-flat"><DT.CRIcon name="Coins" size={12} />{DT.crMoney(run.costCents)}</span>
        <span className="ae-chip-flat"><DT.CRIcon name="ListChecks" size={12} />{run.totalSteps} steps</span>
        <span className="ae-chip-flat"><DT.CRIcon name="ShieldCheck" size={12} />{(window.CR.TIERS.find((t) => t.id === run.tier) || {}).name || run.tier}</span>
      </div>

      <div className="ae-block-label"><DT.CRIcon name="GitBranch" size={14} />Step timeline</div>
      <div className="cr-rd-steps">
        {steps.map((s, i) => {
          const numCls = s.status === "done" ? "cr-rds__num--done" : s.status === "running" ? "cr-rds__num--running" : s.status === "failed" ? "cr-rds__num--failed" : "";
          const ac = window.CR.ACLASS[s.aclass] || { label: s.aclass || "read", tone: "muted" };
          const done = s.status === "done" || run.status === "completed";
          return (
            <div className="cr-rds" key={i}>
              <div className="cr-rds__rail">
                <span className={"cr-rds__num " + numCls}>{s.status === "done" ? <DT.CRIcon name="Check" size={14} /> : s.status === "failed" ? <DT.CRIcon name="X" size={14} /> : i + 1}</span>
                {i < steps.length - 1 ? <span className="cr-rds__line" /> : null}
              </div>
              <div className="cr-rds__card">
                <div className="cr-rds__top">
                  <span className="cr-rds__skill">{s.skill}</span>
                  {s.gate ? <span className="cr-chip-flat" style={{ color: "#a8530e" }}><DT.CRIcon name="Lock" size={11} />approval gate</span> : null}
                </div>
                {s.note ? <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "6px 0 0", lineHeight: 1.5 }}>{s.note}</p> : null}
                <div className="cr-rds__tags">
                  <span className="cr-chip-flat">{s.agent}</span>
                  {s.model ? <span className="cr-chip-flat">{window.CR.MODEL_TIER[s.model] || s.model}</span> : null}
                  <DT.ClassChip aclass={s.aclass || "read"} />
                  {done ? <span className="cr-rds__metric">· {stepDur(i)}s · {DT.crMoney(stepCost(i))}{s.model ? " · " + (s.model === "haiku" ? "1.2k" : "3.4k") + " tok" : ""}</span> : null}
                </div>
                {done ? (
                  <div className="cr-io">
                    <button className="cr-io__btn" onClick={() => toggle(i)}><DT.CRIcon name={open[i] ? "ChevronDown" : "ChevronRight"} size={12} />input · output</button>
                    {open[i] ? (
                      <div className="cr-io__body">{s.input ? "in  ← " + s.input + "\n" : "in  ← (trigger payload)\n"}out → {sampleOut(run.jobId, i)}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {run.status === "completed" || run.status === "failed" ? (
        <div style={{ marginTop: "var(--sp-24)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="ae-block-label" style={{ margin: 0 }}><DT.CRIcon name="MessageSquare" size={14} />Was this run right?</span>
          <button className="cr-qa" onClick={() => ctx.toast({ icon: "ThumbsUp", text: "Thanks — feeds the trust-ramp signal" })}><DT.CRIcon name="ThumbsUp" size={13} />Good</button>
          <button className="cr-qa" onClick={() => ctx.toast({ icon: "ThumbsDown", text: "Noted — we'll watch this automation" })}><DT.CRIcon name="ThumbsDown" size={13} />Off</button>
        </div>
      ) : null}
    </div>
  );
}
function sampleOut(jobId, i) {
  const map = {
    "morning-briefing": ["{ ranked: 5 messages, top: 'Northwind' }", "{ events: 5, conflicts: 1 }", "{ card: '5 of Clubs' }", "{ delivered: ['in-app','email'] }"],
    "inbox-declutter": ["{ new: 6, matched: 4 }", "{ branch: 'archive' }", "{ archived: 4 }"],
    "vip-watcher": ["{ summary: 'Dana re: Q3 terms' }", "{ notified: true }", "{ draft: 'Wednesday works…' }"],
    "calendar-guard": ["{ invite: '30-min sync' }", "{ branch: 'no-agenda' }", "{ draft: 'Could you add an agenda?' }"],
    "wellness-triple": ["{ prompt: 'gratitude' }", "{ timer: '4-7-8' }", "{ reflection: queued }"],
  };
  return (map[jobId] || ["{ ok: true }"])[i] || "{ ok: true }";
}

/* ── AUTOMATION DEEP VIEW ────────────────────────────────────── */
function AutomationDetail({ h, ctx, onBack, onOpenRun }) {
  const versions = CR_VERSIONS[h.id] || [];
  const st = { active: "Active", paused: "Paused", observe: "Observe ramp", draft: "Draft" }[h.status] || h.status;
  const stCls = { active: "ae-jst--active", paused: "ae-jst--paused", observe: "ae-jst--observe", draft: "ae-jst--draft" }[h.status] || "ae-jst--active";
  const paused = h.status === "paused";
  const trend = window.CR.COST_SERIES.map((d) => d.c);
  const synthRun = (r, i) => ({
    id: "hist-" + h.id + "-" + i, jobId: h.id, jobName: h.name, icon: h.icon, tier: h.tier,
    status: r.outcome === "failed" ? "failed" : "completed",
    steps: (h.steps || []).map((s, k) => ({ name: s.skill, agent: s.agent, gate: !!s.gate, status: r.outcome === "failed" && k === (h.steps.length - 1) ? "failed" : "done" })),
    totalSteps: (h.steps || []).length, currentStep: (h.steps || []).length - 1,
    costCents: Math.round(parseFloat(String(r.cost).replace("$", "")) * 100), durationSec: parseInt(r.dur), outcome: r.outcome,
  });
  return (
    <div className="ae-screen">
      <button className="ae-screen-btn ae-screen-btn--ghost" onClick={onBack} style={{ marginBottom: "var(--sp-16)" }}><DT.CRIcon name="ArrowLeft" size={15} />All automations</button>
      <div className="ae-screen-head">
        <div className="ae-screen-head__row">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="ae-detail-ico"><DT.CRIcon name={h.icon} size={24} /></span>
            <div>
              <div className="ae-screen-kicker">ControlRoom · automation</div>
              <h1 className="ae-screen-h1" style={{ whiteSpace: "normal" }}>{h.name}</h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ae-screen-btn ae-screen-btn--primary" onClick={() => ctx.runNow(h.name)}><DT.CRIcon name="Play" size={15} />Run now</button>
            <button className="ae-screen-btn" onClick={() => ctx.togglePause(h.id)}><DT.CRIcon name={paused ? "Play" : "Pause"} size={15} />{paused ? "Resume" : "Pause"}</button>
            <button className="ae-screen-btn ae-screen-btn--ghost" onClick={() => ctx.toast({ icon: "Pencil", text: "Opening " + h.name + " in AutoRoom…" })}><DT.CRIcon name="Pencil" size={15} />Edit</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: -8, marginBottom: 16 }}>
        <span className={"ae-jst " + stCls}>{st}</span>
        <span className="ae-chip-flat"><DT.CRIcon name={h.trigger === "Schedule" ? "Clock" : "Zap"} size={12} />{h.triggerText}</span>
        <span className="ae-chip-flat"><DT.CRIcon name="ShieldCheck" size={12} />{(window.CR.TIERS.find((t) => t.id === h.tier) || {}).name}</span>
        <span className="ae-chip-flat"><DT.CRIcon name="Repeat" size={12} />{h.successRate}% · {h.runsTotal} runs</span>
        <span className="ae-chip-flat"><DT.CRIcon name="CalendarClock" size={12} />next {h.nextRun}</span>
      </div>

      {/* metric tiles */}
      <div className="cr-kpis" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <DT.KPITile icon="CircleCheck" label="Success" value={h.successRate} unit="%" sub={h.fails + " failed in last 30"} />
        <DT.KPITile icon="Coins" label="This month" value={DT.crMoney(h.monthCostCents)} sub={DT.crMoney(h.costPerRunCents) + " / run"} />
        <DT.KPITile icon="Gauge" label="Latency" value={h.p50} unit="s" sub={"p95 " + h.p95 + "s"} />
        <DT.KPITile icon="ListChecks" label="Pipeline" value={(h.steps || []).length} unit=" steps" sub={(window.CR.TIERS.find((t) => t.id === h.tier) || {}).name} />
      </div>

      <div className="cr-block">
        <div className="ae-detail-grid">
          <div className="ae-detail-main">
            <div className="ae-block-label"><DT.CRIcon name="History" size={14} />Run history</div>
            <div className="cr-feed">
              {(h.runs || []).map((r, i) => { const run = synthRun(r, i); return <DT.RunRow key={i} run={run} onOpen={() => onOpenRun(run)} />; })}
            </div>

            <div className="ae-block-label" style={{ marginTop: "var(--sp-24)" }}><DT.CRIcon name="GitCommitVertical" size={14} />Version history</div>
            <div className="cr-panel"><div className="cr-panel__body" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {versions.map((v, i) => (
                <div key={v.v} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <span className="cr-chip-flat" style={{ flexShrink: 0 }}>v{v.v}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "var(--ink)" }}>{v.note}</div>
                    <div style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "var(--muted)" }}>{v.t}</div>
                  </div>
                  {v.cur ? <span className="cr-class cr-class--soft">current</span>
                    : <button className="cr-qa" onClick={() => ctx.confirm({ title: "Roll back to v" + v.v + "?", danger: false, body: "“" + v.note + "” — this replaces the current config (v" + versions[0].v + ") with v" + v.v + ". The current version is kept in history so you can roll forward again.", confirmLabel: "Roll back", onConfirm: () => ctx.toast({ icon: "RotateCcw", text: h.name + " rolled back to v" + v.v }) })}><DT.CRIcon name="RotateCcw" size={12} />Rollback</button>}
                </div>
              ))}
            </div></div>
          </div>

          <div className="ae-detail-side">
            <div className="ae-block-label"><DT.CRIcon name="ChartArea" size={14} />Cost trend</div>
            <div className="cr-panel"><div className="cr-panel__body"><DT.Sparkline values={trend} w={240} h={48} /><div style={{ fontFamily: "DM Mono, monospace", fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>14-day spend · {DT.crMoney(h.monthCostCents)} this month</div></div></div>

            <div className="ae-block-label" style={{ marginTop: "var(--sp-24)" }}><DT.CRIcon name="Plug" size={14} />Integrations</div>
            <div className="cr-panel"><div className="cr-panel__body" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {h.integrations.length ? h.integrations.map((id) => { const it = ctx.integrations.find((x) => x.id === id); return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span className={"cr-dot " + (it.state === "connected" ? "cr-dot--ok" : it.state === "expiring" ? "cr-dot--warn" : "cr-dot--bad")} />
                  <span style={{ fontSize: 13, color: "var(--ink)", flex: 1 }}>{it.name}</span>
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>{it.state}</span>
                </div>
              ); }) : <span style={{ fontSize: 12.5, color: "var(--muted)" }}>No external integrations.</span>}
            </div></div>

            <div className="ae-block-label" style={{ marginTop: "var(--sp-24)" }}><DT.CRIcon name="Wrench" size={14} />Controls</div>
            <div className="cr-panel"><div className="cr-panel__body" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button className="cr-qa" onClick={() => ctx.runNow(h.name + " (clone)")}><DT.CRIcon name="Copy" size={12} />Clone</button>
              <button className="cr-qa" onClick={() => ctx.toast({ icon: "FileDown", text: h.name + ".yaml exported" })}><DT.CRIcon name="FileDown" size={12} />Export YAML</button>
              <button className="cr-qa" onClick={() => ctx.confirm({ title: "Archive " + h.name + "?", danger: false, body: "Archiving soft-deletes the automation and stops it running. Its run history is preserved and you can unarchive any time.", confirmLabel: "Archive", onConfirm: () => { ctx.archive(h.id); onBack(); } })}><DT.CRIcon name="Archive" size={12} />Archive</button>
              <button className="cr-qa cr-qa--danger" onClick={() => ctx.confirm({ title: "Delete " + h.name + "?", danger: true, typeToConfirm: h.name, body: "This permanently deletes the automation and cascades all " + h.runsTotal + " of its runs. This cannot be undone.", confirmLabel: "Delete forever", onConfirm: () => { ctx.toast({ icon: "Trash2", text: h.name + " deleted" }); onBack(); } })}><DT.CRIcon name="Trash2" size={12} />Delete</button>
            </div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── AUDIT LOG ───────────────────────────────────────────────── */
function AuditView({ ctx }) {
  const [verified, setVerified] = dtUseState(true);
  return (
    <div className="ae-screen">
      <DT.ScreenHead kicker="ControlRoom · Audit" title="Every action, <em>verifiable</em>."
        lede="Your own audit log — every action AlterEgo took on your behalf, chained-hashed and tamper-evident. GDPR Article 15, Right of Access."
        actions={<button className="ae-screen-btn" onClick={() => ctx.toast({ icon: "Download", text: "Audit log exported as CSV" })}><DT.CRIcon name="Download" size={15} />Export CSV</button>} />
      <div style={{ marginBottom: 16 }}>
        <span className="cr-verify"><DT.CRIcon name="ShieldCheck" size={14} />Chain verified — all {window.CR.AUDIT.length} entries intact</span>
      </div>
      <div className="cr-audit">
        <div className="cr-audit__row cr-audit__row--head"><span>When</span><span>Action</span><span>Automation</span><span>Hash</span><span /></div>
        {window.CR.AUDIT.map((r) => (
          <div className="cr-audit__row" key={r.id}>
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11.5, color: "var(--muted)" }}>{r.t}</span>
            <span><span className="cr-audit__action">{r.action}</span> <DT.ClassChip aclass={r.aclass} /></span>
            <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{window.CR.byId(r.jobId).name || r.jobId}</span>
            <span className="cr-audit__hash">{r.hash}</span>
            <span className="cr-tamper" title="Tamper-evident"><DT.CRIcon name="ShieldCheck" size={15} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.CRDetail = { RunDetail, AutomationDetail, AuditView };
