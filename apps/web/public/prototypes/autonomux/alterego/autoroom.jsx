/* ============================================================
   AlterEgo — AutoRoom (React/Babel → window)
   Grounded in AUTOROOM_PRD.md + AUTOROOM_FUNCTIONALITIES.md:
   template gallery landing · job pipelines · 5 trust tiers ·
   action classes · cost discipline · run history.
   ============================================================ */
const { useState: arUseState } = React;
const ArIcon = window.Icon;

const AE_OUTCOME = {
  ok: { label: "ok", cls: "ae-out--ok" },
  approved: { label: "approved", cls: "ae-out--ok" },
  observed: { label: "observed", cls: "ae-out--obs" },
  failed: { label: "failed", cls: "ae-out--fail" },
};
const AE_STATUS = {
  active: { label: "Active", cls: "ae-jst--active" },
  paused: { label: "Paused", cls: "ae-jst--paused" },
  observe: { label: "Observe ramp", cls: "ae-jst--observe" },
  draft: { label: "Draft", cls: "ae-jst--draft" },
};

function tierName(id) { var t = window.AE.TIERS.find((x) => x.id === id); return t ? t.name : id; }

/* ── Job card (My Automations) ───────────────────────────────── */
function JobCard({ job, onOpen, onToggle }) {
  const st = AE_STATUS[job.status] || AE_STATUS.active;
  const on = job.status === "active" || job.status === "observe";
  const out = AE_OUTCOME[job.lastOutcome] || AE_OUTCOME.ok;
  return (
    <button className="ae-job" onClick={() => onOpen(job.id)}>
      <div className="ae-job__top">
        <span className="ae-job__ico"><ArIcon name={job.icon} size={19} /></span>
        <div className="ae-job__head">
          <span className="ae-job__name">{job.name}</span>
          <span className="ae-job__trigger"><ArIcon name={job.trigger === "Schedule" ? "Clock" : job.trigger === "Event" ? "Zap" : "Hand"} size={12} />{job.triggerText}</span>
        </div>
        <span className={"ae-jst " + st.cls}>{st.label}</span>
      </div>
      <p className="ae-job__desc">{job.desc}</p>
      <div className="ae-job__foot">
        <span className="ae-job__tier"><ArIcon name="ShieldCheck" size={13} />{tierName(job.tier)}</span>
        <span className="ae-job__meta">{job.steps.length} steps</span>
        <span className="ae-job__meta">{job.costPerRun}/run</span>
        <span className="ae-job__meta ae-job__meta--right">
          <span className={"ae-out " + out.cls}>{out.label}</span> · {job.lastRun}
        </span>
      </div>
    </button>
  );
}

/* ── Template card ───────────────────────────────────────────── */
function TemplateCard({ tpl, onUse }) {
  return (
    <div className="ae-tpl">
      <div className="ae-tpl__top">
        <span className="ae-tpl__ico"><ArIcon name={tpl.icon} size={18} /></span>
        <span className={"ae-tpl__phase" + (tpl.phase === "MVP" ? " ae-tpl__phase--live" : "")}>{tpl.phase === "MVP" ? "Available" : "Phase " + tpl.phase}</span>
      </div>
      <div className="ae-tpl__name">{tpl.name}</div>
      <p className="ae-tpl__desc">{tpl.desc}</p>
      <div className="ae-tpl__agents">{tpl.agents}</div>
      <button className="ae-tpl__use" disabled={tpl.phase !== "MVP"} onClick={() => onUse(tpl)}>
        {tpl.phase === "MVP" ? <React.Fragment><ArIcon name="Plus" size={14} />Use template</React.Fragment> : "Coming soon"}
      </button>
    </div>
  );
}

/* ── Trust-tier ladder ───────────────────────────────────────── */
function TierLadder({ tier }) {
  const idx = window.AE.TIER_INDEX[tier] || 0;
  return (
    <div className="ae-tiers">
      {window.AE.TIERS.map((t, i) => (
        <div className={"ae-tier" + (i === idx ? " ae-tier--active" : "") + (i < idx ? " ae-tier--past" : "")} key={t.id}>
          <div className="ae-tier__head">
            <span className="ae-tier__ico"><ArIcon name={t.icon} size={15} /></span>
            <span className="ae-tier__name">{t.name}</span>
            {i === idx ? <span className="ae-tier__badge">Current</span> : null}
          </div>
          <p className="ae-tier__desc">{t.desc}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Step pipeline ───────────────────────────────────────────── */
function StepPipeline({ steps }) {
  return (
    <div className="ae-pipe">
      {steps.map((s, i) => {
        const ac = window.AE.ACLASS[s.aclass] || { label: s.aclass, tone: "muted" };
        return (
          <div className="ae-step" key={s.id}>
            <div className="ae-step__rail">
              <span className="ae-step__num">{i + 1}</span>
              {i < steps.length - 1 ? <span className="ae-step__line" /> : null}
            </div>
            <div className="ae-step__card">
              <div className="ae-step__top">
                <span className="ae-step__skill">{s.skill}</span>
                {s.gate ? <span className="ae-step__gate"><ArIcon name="Lock" size={11} />approval gate</span> : null}
              </div>
              <p className="ae-step__note">{s.note}</p>
              {s.input ? <div className="ae-step__var"><ArIcon name="CornerDownRight" size={12} />{s.input}</div> : null}
              <div className="ae-step__tags">
                <span className="ae-step__agent">{s.agent}</span>
                <span className="ae-step__model">{window.AE.MODEL_TIER[s.model]}</span>
                <span className={"ae-step__aclass ae-ac--" + ac.tone}>{ac.label}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Job detail ──────────────────────────────────────────────── */
function JobDetail({ job, onBack }) {
  const st = AE_STATUS[job.status] || AE_STATUS.active;
  return (
    <div className="ae-screen">
      <button className="ae-screen-btn ae-screen-btn--ghost" onClick={onBack} style={{ marginBottom: "var(--sp-16)" }}><ArIcon name="ArrowLeft" size={15} />All automations</button>
      <div className="ae-screen-head">
        <div className="ae-screen-head__row">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="ae-detail-ico"><ArIcon name={job.icon} size={24} /></span>
            <div>
              <div className="ae-screen-kicker">AutoRoom · automation</div>
              <h1 className="ae-screen-h1" style={{ whiteSpace: "normal" }}>{job.name}</h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ae-screen-btn"><ArIcon name="Play" size={15} />Run now</button>
            <button className="ae-screen-btn ae-screen-btn--ghost"><ArIcon name="Pencil" size={15} />Edit</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: -10, marginBottom: 8 }}>
        <span className={"ae-jst " + st.cls}>{st.label}</span>
        <span className="ae-chip-flat"><ArIcon name={job.trigger === "Schedule" ? "Clock" : "Zap"} size={12} />{job.triggerText}</span>
        <span className="ae-chip-flat"><ArIcon name="ShieldCheck" size={12} />{tierName(job.tier)}</span>
        <span className="ae-chip-flat"><ArIcon name="Coins" size={12} />{job.costPerRun}/run</span>
        <span className="ae-chip-flat"><ArIcon name="Repeat" size={12} />{job.successRate}% · {job.runsTotal} runs</span>
      </div>
      <p className="ae-screen-lede" style={{ marginTop: 12 }}>{job.desc}</p>

      {job.rampDay ? (
        <div className="ae-ramp"><ArIcon name="GraduationCap" size={16} /><span><b>Trust ramp — day {job.rampDay} of 7.</b> New automations watch quietly in Observe first. After 5 clean runs you'll be invited to promote it to Propose.</span></div>
      ) : null}

      <div className="ae-detail-grid">
        <div className="ae-detail-main">
          <div className="ae-block-label"><ArIcon name="GitBranch" size={14} />Pipeline · {job.steps.length} steps</div>
          <StepPipeline steps={job.steps} />

          <div className="ae-block-label" style={{ marginTop: "var(--sp-24)" }}><ArIcon name="History" size={14} />Recent runs</div>
          <div className="ae-runs">
            <div className="ae-runs__head"><span>When</span><span>Duration</span><span>Cost</span><span style={{ textAlign: "right" }}>Outcome</span></div>
            {job.runs.map((r, i) => {
              const out = AE_OUTCOME[r.outcome] || AE_OUTCOME.ok;
              return (
                <div className="ae-runs__row" key={i}>
                  <span className="ae-mono2">{r.t}</span><span className="ae-mono2">{r.dur}</span><span className="ae-mono2">{r.cost}</span>
                  <span style={{ textAlign: "right" }}><span className={"ae-out " + out.cls}>{out.label}</span></span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ae-detail-side">
          <div className="ae-block-label"><ArIcon name="ShieldCheck" size={14} />Trust tier</div>
          <TierLadder tier={job.tier} />

          <div className="ae-block-label" style={{ marginTop: "var(--sp-24)" }}><ArIcon name="LockKeyhole" size={14} />Scope &amp; guards</div>
          <div className="ae-guards">
            {job.guards.map((g, i) => (
              <div className="ae-guard" key={i}><span className="ae-guard__k">{g.k}</span><span className="ae-guard__v">{g.v}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── AutoRoom landing + router ───────────────────────────────── */
function AutoroomView() {
  const [tab, setTab] = arUseState("mine");
  const [openId, setOpenId] = arUseState(null);
  const [cat, setCat] = arUseState("all");
  const [icp, setIcp] = arUseState("All");
  const [q, setQ] = arUseState("");
  const [jobs, setJobs] = arUseState(window.AE.JOBS);

  if (openId) {
    const job = jobs.find((j) => j.id === openId);
    if (job) return <JobDetail job={job} onBack={() => setOpenId(null)} />;
  }

  let tpls = window.AE.TEMPLATES;
  if (cat !== "all") tpls = tpls.filter((t) => t.cat === cat);
  if (icp !== "All") tpls = tpls.filter((t) => t.icp.indexOf(icp) !== -1);
  if (q) tpls = tpls.filter((t) => (t.name + " " + t.desc + " " + t.agents).toLowerCase().includes(q.toLowerCase()));

  const activeCount = jobs.filter((j) => j.status === "active" || j.status === "observe").length;

  return (
    <div className="ae-screen">
      <div className="ae-screen-head">
        <div className="ae-screen-head__row">
          <div>
            <div className="ae-screen-kicker">AutoRoom</div>
            <h1 className="ae-screen-h1" style={{ whiteSpace: "normal" }}>Standing orders for your <em>second self</em>.</h1>
          </div>
        </div>
        <p className="ae-screen-lede">Define a routine once — a trigger, a few chained skills, and how much rope you give it — and AlterEgo runs it between your sessions, forever.</p>
      </div>

      <div className="ae-tabs">
        <button className={"ae-tab" + (tab === "mine" ? " ae-tab--active" : "")} onClick={() => setTab("mine")}>Your automations <span className="ae-tab__c">{jobs.length}</span></button>
        <button className={"ae-tab" + (tab === "templates" ? " ae-tab--active" : "")} onClick={() => setTab("templates")}>Templates <span className="ae-tab__c">{window.AE.TEMPLATES.length}</span></button>
      </div>

      {tab === "mine" ? (
        <React.Fragment>
          <div className="ae-mine-bar">
            <span className="ae-mine-stat">{activeCount} running · {jobs.length - activeCount} idle</span>
            <button className="ae-screen-btn ae-screen-btn--primary" onClick={() => setTab("templates")}><ArIcon name="Plus" size={15} />New automation</button>
          </div>
          <div className="ae-jobs">
            {jobs.map((j) => <JobCard key={j.id} job={j} onOpen={setOpenId} />)}
          </div>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <div className="ae-tpl-toolbar">
            <div className="ae-archive-search" style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <ArIcon name="Search" size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" />
            </div>
          </div>
          <div className="ae-tpl-filters">
            {window.AE.TEMPLATE_CATS.map((c) => <button key={c.id} className={"ae-fchip" + (cat === c.id ? " ae-fchip--active" : "")} onClick={() => setCat(c.id)}>{c.label}</button>)}
            <span className="ae-fdiv" />
            {window.AE.TEMPLATE_ICPS.map((p) => <button key={p} className={"ae-fchip ae-fchip--icp" + (icp === p ? " ae-fchip--active" : "")} onClick={() => setIcp(p)}>{p}</button>)}
          </div>
          <div className="ae-tpls">
            {tpls.map((t) => <TemplateCard key={t.id} tpl={t} onUse={() => setTab("mine")} />)}
          </div>
          {tpls.length === 0 ? <div className="ae-search-empty" style={{ borderRadius: 12, background: "rgba(255,250,245,0.1)" }}>No templates match those filters.</div> : null}
        </React.Fragment>
      )}
    </div>
  );
}

Object.assign(window, { AutoroomView });
