/* ============================================================
   ControlRoom — app root: shell, sidebar, live engine, routing
   (React/Babel). Reuses alterego/theme.css + tweaks-panel.jsx.
   ============================================================ */
const { useState: aUse, useEffect: aEff, useRef: aRef, useCallback: aCb } = React;
const A = window;

const CR_NAV = [
  { id: "overview", label: "Overview", icon: "LayoutDashboard" },
  { id: "runs", label: "Runs", icon: "Radio" },
  { id: "activity", label: "Activity", icon: "History" },
  { id: "approvals", label: "Approvals", icon: "ShieldAlert", badge: "approvals" },
  { id: "costs", label: "Costs", icon: "Coins" },
  { id: "integrations", label: "Integrations", icon: "Plug" },
  { id: "automations", label: "Automations", icon: "Workflow" },
  { id: "audit", label: "Audit log", icon: "FileCheck2" },
];

const CR_TWEAKS = /*EDITMODE-BEGIN*/{
  "blaze": 1,
  "density": "comfortable",
  "liveSpeed": 1,
  "landing": "overview"
}/*EDITMODE-END*/;

/* ── Sidebar ─────────────────────────────────────────────────── */
function CRSidebar({ view, onNav, viewId, onView, pending, open, onClose, collapsed, onToggleCollapse }) {
  const [profileOpen, setProfileOpen] = aUse(false);
  const ref = aRef(null);
  aEff(() => {
    if (!profileOpen) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setProfileOpen(false); };
    document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f);
  }, [profileOpen]);
  const viewCounts = { "all-active": window.CR.HEALTH.filter((h) => h.status !== "paused").length, "needs-attention": window.CR.HEALTH.filter((h) => h.fails > 0 || h.successRate < 98).length, "most-expensive": window.CR.HEALTH.length, "recently-changed": 4, "archived": window.CR.HEALTH.filter((h) => h.status === "paused").length };
  return (
    <React.Fragment>
      {open ? <div className="ae-backdrop" onClick={onClose} /> : null}
      <aside className={"ae-sidebar" + (collapsed ? " ae-sidebar--collapsed" : "") + (open ? " ae-sidebar--open" : "")} aria-label="ControlRoom navigation">
        <div className="ae-side-head">
          <a className="ae-brand" href="AlterEgo.html" title="Back to AlterEgo" style={{ textDecoration: "none" }}>
            <img className="ae-brand-logo" src="alterego/logo.png" alt="autonomux" />
            <span className="ae-brand-word">autonom<em>ux</em></span>
          </a>
          <button className="ae-icon-ghost" onClick={onToggleCollapse} aria-label="Collapse"><A.CRIcon name={collapsed ? "PanelLeftOpen" : "PanelLeftClose"} size={18} /></button>
        </div>

        <nav className="ae-nav" aria-label="Primary">
          {CR_NAV.map((n) => (
            <button key={n.id} className={"ae-nav-item" + (view === n.id ? " ae-nav-item--active" : "")} onClick={() => onNav(n.id)} title={n.label}>
              <span className="ae-nav-icon"><A.CRIcon name={n.icon} size={18} /></span>
              <span className="ae-nav-label">{n.label}</span>
              {n.badge === "approvals" && pending ? <span className="ae-nav-badge">{pending}</span> : null}
            </button>
          ))}
        </nav>

        <div className="ae-rail-label">Custom views</div>
        <ul className="cr-views">
          {window.CR.VIEWS.map((v) => (
            <li key={v.id}>
              <button className={"cr-view" + (view === "automations" && viewId === v.id ? " cr-view--active" : "")} onClick={() => onView(v.id)} title={v.desc}>
                <span className="cr-view__ico"><A.CRIcon name={v.icon} size={15} /></span>
                <span className="cr-view__name">{v.name}</span>
                <span className="cr-view__count">{viewCounts[v.id] != null ? viewCounts[v.id] : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="cr-rail-actions">
          <button className="cr-save-view" onClick={() => onView("__save__")}><A.CRIcon name="Plus" size={13} />Save current view</button>
        </div>

        <div className="ae-account" ref={ref} style={{ marginTop: "auto" }}>
          {profileOpen ? (
            <div className="ae-profile-menu" role="menu">
              <a className="ae-profile-item" href="AlterEgo.html"><A.CRIcon name="MessageSquare" size={16} /><span>AlterEgo chat</span></a>
              <a className="ae-profile-item" href="AlterEgo.html"><A.CRIcon name="Workflow" size={16} /><span>AutoRoom</span></a>
              <div className="ae-profile-sep" />
              <button className="ae-profile-item" role="menuitem"><A.CRIcon name="Settings" size={16} /><span>Settings</span></button>
              <button className="ae-profile-item ae-profile-item--danger" role="menuitem" onClick={() => { (window.top || window).location.href = "/sign-out"; }}><A.CRIcon name="LogOut" size={16} /><span>Log out</span></button>
            </div>
          ) : null}
          <button className={"ae-account-row" + (profileOpen ? " ae-account-row--open" : "")} onClick={() => setProfileOpen((v) => !v)}>
            <span className="ae-avatar">L</span>
            <div className="ae-account-text">
              <div className="ae-account-email">lightspiritux@gmail.com</div>
              <div className="ae-account-sub">Tenant · Active</div>
            </div>
            <span className="ae-account-caret"><A.CRIcon name="ChevronsUpDown" size={15} /></span>
          </button>
        </div>
      </aside>
    </React.Fragment>
  );
}

/* ── live engine helpers ─────────────────────────────────────── */
let CR_UID = 1000;
function relabel(r) { r.startedLabel = "just now"; return r; }

/* ── App ─────────────────────────────────────────────────────── */
function CRApp() {
  const [t, setTweak] = A.useTweaks(CR_TWEAKS);
  const [view, setView] = aUse(() => { try { return localStorage.getItem("cr-view") || CR_TWEAKS.landing; } catch (e) { return CR_TWEAKS.landing; } });
  const [viewId, setViewId] = aUse(null);
  const [runs, setRuns] = aUse(() => window.CR.LIVE_SEED.map((r) => ({ ...r, steps: r.steps.map((s) => ({ ...s })) })));
  const [approvals, setApprovals] = aUse(() => window.CR.APPROVALS.map((a) => ({ ...a, state: null })));
  const [activity, setActivity] = aUse(() => window.CR.ACTIVITY.map((a) => ({ ...a })));
  const [integrations, setIntegrations] = aUse(() => window.CR.INTEGRATIONS.map((i) => ({ ...i })));
  const [health, setHealth] = aUse(() => window.CR.HEALTH.map((h) => ({ ...h })));
  const [budget, setBudget] = aUse(() => ({ ...window.CR.BUDGET }));
  const [selRun, setSelRun] = aUse(null);
  const [selAuto, setSelAuto] = aUse(null);
  const [toasts, setToasts] = aUse([]);
  const [confirmState, setConfirmState] = aUse({ open: false });
  const [navOpen, setNavOpen] = aUse(false);
  const [live, setLive] = aUse(true);
  const [collapsed, setCollapsed] = aUse(() => { try { return localStorage.getItem("cr-collapsed") === "1"; } catch (e) { return false; } });
  const [freshIds, setFreshIds] = aUse(() => new Set());

  const runsRef = aRef(runs); aEff(() => { runsRef.current = runs; }, [runs]);
  const liveRef = aRef(live); aEff(() => { liveRef.current = live; }, [live]);
  const speedRef = aRef(t.liveSpeed); aEff(() => { speedRef.current = t.liveSpeed; }, [t.liveSpeed]);

  // apply tweaks to DOM
  aEff(() => { document.documentElement.style.setProperty("--blaze", t.blaze); }, [t.blaze]);
  aEff(() => { document.documentElement.setAttribute("data-density", t.density); }, [t.density]);
  aEff(() => { try { localStorage.setItem("cr-view", view); } catch (e) {} }, [view]);

  const pending = approvals.filter((a) => !a.state).length;

  // ── toasts ──
  const toast = aCb((o) => {
    const id = "to-" + (CR_UID++);
    setToasts((p) => [...p, { ...o, id }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), o.undo ? 4600 : 3200);
  }, []);
  const dismissToast = (to) => setToasts((p) => p.filter((x) => x.id !== to.id));

  const confirm = aCb((o) => setConfirmState({ open: true, ...o }), []);
  const closeConfirm = () => setConfirmState({ open: false });
  const doConfirm = () => { const fn = confirmState.onConfirm; closeConfirm(); if (fn) fn(); };

  const markFresh = (id) => {
    setFreshIds((p) => { const n = new Set(p); n.add(id); return n; });
    setTimeout(() => setFreshIds((p) => { const n = new Set(p); n.delete(id); return n; }), 600);
  };

  // ── the tick ──
  aEff(() => {
    let timer = null;
    const tick = () => {
      if (liveRef.current) {
        const cur = runsRef.current;
        const newActivity = [];
        let addCost = 0;
        let next = cur.map((r) => {
          if (r.status !== "running") return r;
          const nr = { ...r, steps: r.steps.map((s) => ({ ...s })) };
          nr.durationSec += 1 + Math.floor(Math.random() * 2);
          if (Math.random() < 0.5) nr.costCents += 1;
          // advance step
          if (Math.random() < 0.62) {
            const ci = nr.currentStep;
            if (nr.steps[ci]) nr.steps[ci].status = "done";
            const ni = ci + 1;
            if (ni >= nr.totalSteps) {
              // complete
              const failed = Math.random() < 0.06;
              nr.status = failed ? "failed" : "completed";
              nr.outcome = failed ? "failed" : "ok";
              if (failed && nr.steps[ci]) nr.steps[ci].status = "failed";
              addCost += nr.costCents;
              newActivity.push({
                id: "ac-" + (CR_UID++), t: "just now", ts: 0, verb: failed ? "failed" : "ran",
                jobId: nr.jobId, agent: (window.CR.byId(nr.jobId).steps || [{}])[0].agent || "System", icon: nr.icon,
                outcome: failed ? "failed" : "ok", costCents: nr.costCents,
                detail: failed ? "A step errored mid-run — flagged for review." : "Completed in " + A.crDur(nr.durationSec) + " · " + nr.totalSteps + " steps.",
                undoable: false, ack: false,
              });
            } else if (nr.steps[ni] && nr.steps[ni].gate) {
              nr.steps[ni].status = "gate"; nr.currentStep = ni; nr.status = "awaiting_approval";
            } else {
              if (nr.steps[ni]) nr.steps[ni].status = "running";
              nr.currentStep = ni;
            }
          }
          return nr;
        });
        // promote one queued → running
        const qi = next.findIndex((r) => r.status === "queued");
        if (qi !== -1 && Math.random() < 0.5) {
          const nr = { ...next[qi], status: "running", durationSec: 0, costCents: 0 };
          nr.steps = nr.steps.map((s, i) => ({ ...s, status: i === 0 ? "running" : "pending" }));
          nr.currentStep = 0; next[qi] = nr;
        }
        // count active
        const activeCount = next.filter((r) => r.status === "running" || r.status === "queued" || r.status === "awaiting_approval").length;
        // spawn occasionally
        if (activeCount < 4 && Math.random() < 0.4) {
          const jid = window.CR.SPAWNABLE[Math.floor(Math.random() * window.CR.SPAWNABLE.length)];
          const nr = window.CR.freshRun(jid, "running", 0);
          nr.steps[0].status = "running";
          next.unshift(nr); markFresh(nr.id);
        }
        // keep array bounded: at most 6 finished kept
        const liveOnes = next.filter((r) => r.status === "running" || r.status === "queued" || r.status === "awaiting_approval");
        const doneOnes = next.filter((r) => r.status === "completed" || r.status === "failed" || r.status === "cancelled").slice(0, 6);
        next = [...liveOnes, ...doneOnes];

        setRuns(next);
        if (newActivity.length) setActivity((a) => [...newActivity, ...a]);
        if (addCost) setBudget((b) => ({ ...b, todayCents: b.todayCents + addCost, monthUsedCents: b.monthUsedCents + addCost }));
      }
      timer = setTimeout(tick, Math.max(500, 1500 / (speedRef.current || 1)));
    };
    timer = setTimeout(tick, 1500);
    return () => clearTimeout(timer);
  }, []);

  // ── handlers ──
  const openRun = aCb((r) => { setSelRun(r); }, []);
  const openAutomation = aCb((id) => { setSelAuto(id); }, []);
  const pinRun = aCb((run) => setRuns((p) => p.map((r) => r.id === run.id ? { ...r, pinned: !r.pinned } : r)), []);
  const cancelRun = aCb((run) => confirm({
    title: "Cancel this run?", danger: true,
    body: "“" + run.jobName + "” will stop at the next safe step boundary. Anything already written stays; nothing further executes.",
    confirmLabel: "Cancel run",
    onConfirm: () => { setRuns((p) => p.map((r) => r.id === run.id ? { ...r, status: "cancelled", outcome: "cancelled" } : r)); setSelRun((s) => s && s.id === run.id ? null : s); toast({ icon: "Square", text: run.jobName + " cancelled" }); },
  }), [confirm, toast]);
  const bulkCancel = aCb((ids) => { setRuns((p) => p.map((r) => ids.includes(r.id) && (r.status === "running" || r.status === "queued") ? { ...r, status: "cancelled" } : r)); toast({ icon: "Square", text: "Cancelled selected runs" }); }, [toast]);

  const decide = aCb((id, state) => {
    setApprovals((p) => p.map((a) => a.id === id ? { ...a, state } : a));
    const a = approvals.find((x) => x.id === id);
    if (state === "approved") {
      setActivity((act) => [{ id: "ac-" + (CR_UID++), t: "just now", ts: 0, verb: "approved & ran", jobId: a ? a.jobId : null, agent: a ? a.agent : "System", icon: a ? a.icon : "Check", outcome: "approved", costCents: a ? a.costCents : 0, detail: a ? a.title : "", undoable: false, ack: false }, ...act]);
      // clear matching awaiting run
      setRuns((p) => p.map((r) => a && r.jobId === a.jobId && r.status === "awaiting_approval" ? { ...r, status: "running" } : r));
    }
    toast({ icon: state === "approved" ? "Check" : "X", text: state === "approved" ? "Approved" : "Denied" });
  }, [approvals, toast]);
  const decideAll = aCb((state) => { setApprovals((p) => p.map((a) => a.state ? a : { ...a, state })); toast({ icon: state === "approved" ? "CheckCheck" : "X", text: (state === "approved" ? "Approved" : "Denied") + " all pending" }); }, [toast]);

  const ack = aCb((id) => setActivity((p) => p.map((a) => a.id === id ? { ...a, ack: true } : a)), []);
  const ackAll = aCb(() => { setActivity((p) => p.map((a) => ({ ...a, ack: true }))); toast({ icon: "CheckCheck", text: "All activity acknowledged" }); }, [toast]);
  const undo = aCb((id) => { setActivity((p) => p.map((a) => a.id === id ? { ...a, undone: true, ack: true } : a)); toast({ icon: "Undo2", text: "Action undone", undo: false }); }, [toast]);

  const togglePause = aCb((id) => {
    setHealth((p) => p.map((h) => h.id === id ? { ...h, status: h.status === "paused" ? "active" : "paused" } : h));
    const h = health.find((x) => x.id === id);
    toast({ icon: h && h.status === "paused" ? "Play" : "Pause", text: (h ? h.name : "Automation") + (h && h.status === "paused" ? " resumed" : " paused") });
  }, [health, toast]);
  const archive = aCb((id) => setHealth((p) => p.map((h) => h.id === id ? { ...h, status: "paused" } : h)), []);
  const pauseAll = aCb(() => { setHealth((p) => p.map((h) => ({ ...h, status: h.status === "observe" ? "observe" : "paused" }))); toast({ icon: "CirclePause", text: "All automations paused" }); }, [toast]);
  const runNow = aCb((name) => {
    toast({ icon: "Play", text: "Triggered " + name + " — running now" });
    const jid = (window.CR.HEALTH.find((h) => name.indexOf(h.name) === 0) || {}).id || "morning-briefing";
    const nr = window.CR.freshRun(jid, "running", 0); nr.steps[0].status = "running";
    setRuns((p) => [nr, ...p]); markFresh(nr.id);
  }, [toast]);
  const reconnect = aCb((id) => { setIntegrations((p) => p.map((i) => i.id === id ? { ...i, state: "connected", detail: "OAuth refreshed · just now" } : i)); toast({ icon: "Plug", text: "Reconnected" }); }, [toast]);

  const onNav = aCb((id) => { setSelRun(null); setSelAuto(null); setView(id); setViewId(null); setNavOpen(false); }, []);
  const onViewPick = aCb((vid) => {
    if (vid === "__save__") { toast({ icon: "Bookmark", text: "View saved to your sidebar" }); return; }
    setSelRun(null); setSelAuto(null); setView("automations"); setViewId(vid); setNavOpen(false);
  }, [toast]);
  const toggleCollapse = aCb(() => setCollapsed((c) => { const n = !c; try { localStorage.setItem("cr-collapsed", n ? "1" : "0"); } catch (e) {} return n; }), []);

  const ctx = {
    runs, approvals, activity, integrations, health, budget, freshIds, pending,
    openRun, openAutomation, pinRun, cancelRun, bulkCancel, decide, decideAll,
    ack, ackAll, undo, togglePause, archive, pauseAll, runNow, reconnect,
    confirm, toast, setView: onNav,
  };

  let body;
  if (selRun) body = <A.CRDetail.RunDetail run={runsRef.current.find((r) => r.id === selRun.id) || selRun} ctx={ctx} onBack={() => setSelRun(null)} />;
  else if (selAuto) body = <A.CRDetail.AutomationDetail h={health.find((x) => x.id === selAuto)} ctx={ctx} onBack={() => setSelAuto(null)} onOpenRun={(r) => setSelRun(r)} />;
  else if (view === "overview") body = <A.CRSurfaces.OverviewView ctx={ctx} />;
  else if (view === "runs") body = <A.CRSurfaces.RunsView ctx={ctx} />;
  else if (view === "activity") body = <A.CRSurfaces.ActivityView ctx={ctx} />;
  else if (view === "approvals") body = <A.CRSurfaces.ApprovalsView ctx={ctx} />;
  else if (view === "costs") body = <A.CRSurfaces.CostsView ctx={ctx} />;
  else if (view === "integrations") body = <A.CRSurfaces.IntegrationsView ctx={ctx} />;
  else if (view === "audit") body = <A.CRDetail.AuditView ctx={ctx} />;
  else body = <A.CRSurfaces.AutomationsView ctx={ctx} viewId={viewId} />;

  return (
    <div className="ae-shell">
      <CRSidebar view={view} onNav={onNav} viewId={viewId} onView={onViewPick} pending={pending}
        open={navOpen} onClose={() => setNavOpen(false)} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      <div className="ae-main">
        <header className="ae-topbar">
          <button className="ae-hamburger" aria-label="Menu" onClick={() => setNavOpen(true)}><A.CRIcon name="Menu" size={18} /></button>
          <div className="ae-topbar-spacer" />
          <div className="cr-topcluster">
            <span className="cr-density" role="group" aria-label="Density">
              {[["compact", "Rows3"], ["comfortable", "Rows2"], ["spacious", "StretchVertical"]].map(([d, ic]) => (
                <button key={d} className={"cr-density__b" + (t.density === d ? " cr-density__b--on" : "")} onClick={() => setTweak("density", d)} title={d}><A.CRIcon name={ic} size={15} /></button>
              ))}
            </span>
            <button className={"cr-live" + (live ? "" : " cr-live--paused")} onClick={() => setLive((v) => !v)} title={live ? "Pause live stream" : "Resume live stream"}>
              <span className="cr-live__dot" />{live ? "Live" : "Paused"}
            </button>
          </div>
        </header>
        <div className="chat-scroller" role="region" aria-label="ControlRoom">
          {body}
        </div>
      </div>

      <A.ConfirmModal open={confirmState.open} title={confirmState.title} body={confirmState.body}
        confirmLabel={confirmState.confirmLabel} danger={confirmState.danger} typeToConfirm={confirmState.typeToConfirm}
        onConfirm={doConfirm} onCancel={closeConfirm} />
      <A.Toasts toasts={toasts} onUndo={dismissToast} />

      <A.TweaksPanel title="Tweaks">
        <A.TweakSection label="Display" />
        <A.TweakRadio label="Density" value={t.density} options={["compact", "comfortable", "spacious"]} onChange={(v) => setTweak("density", v)} />
        <A.TweakSection label="Live feed" />
        <A.TweakSlider label="Stream speed" value={t.liveSpeed} min={0.5} max={2} step={0.1} unit="×" onChange={(v) => setTweak("liveSpeed", v)} />
        <A.TweakSelect label="Default landing" value={t.landing} options={["overview", "runs", "approvals"]} onChange={(v) => setTweak("landing", v)} />
        <A.TweakSection label="The blaze" />
        <A.TweakSlider label="Intensity" value={t.blaze} min={0.4} max={1.4} step={0.05} onChange={(v) => setTweak("blaze", v)} />
      </A.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<CRApp />);
