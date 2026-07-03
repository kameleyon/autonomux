/* ============================================================
   Treasurer — app shell, sidebar nav, routing (React/Babel)
   ============================================================ */
const { useState: apUS, useEffect: apEff, useRef: apRef, useCallback: apCB } = React;
const P = window;

const TR_NAV = [
  { id: "overview", label: "Overview", icon: "LayoutDashboard" },
  { id: "accounts", label: "Accounts", icon: "Wallet" },
  { id: "transactions", label: "Transactions", icon: "ArrowLeftRight" },
  { id: "insights", label: "Insights", icon: "ChartPie" },
  { sep: "Plan & save" },
  { id: "budgets", label: "Budgets", icon: "Wallet" },
  { id: "goals", label: "Goals", icon: "Target" },
  { id: "bills", label: "Bills", icon: "CalendarClock", badge: 1 },
  { id: "debts", label: "Debts", icon: "Landmark" },
  { sep: "Look ahead" },
  { id: "forecast", label: "Cash-flow forecast", icon: "Activity" },
  { id: "whatif", label: "What-if", icon: "FlaskConical" },
  { id: "tax", label: "Tax set-aside", icon: "Percent" },
  { sep: "More" },
  { id: "reports", label: "Reports", icon: "FileText" },
  { id: "alerts", label: "Alerts", icon: "Bell" },
];

function TrApp() {
  const [view, setView] = apUS(() => { try { return localStorage.getItem("tr-view") || "overview"; } catch (e) { return "overview"; } });
  const [navOpen, setNavOpen] = apUS(false);
  const [collapsed, setCollapsed] = apUS(() => { try { return localStorage.getItem("tr-collapsed") === "1"; } catch (e) { return false; } });
  const [profileOpen, setProfileOpen] = apUS(false);
  const pRef = apRef(null);

  apEff(() => { try { localStorage.setItem("tr-view", view); } catch (e) {} }, [view]);
  apEff(() => {
    if (!profileOpen) return;
    const f = (e) => { if (pRef.current && !pRef.current.contains(e.target)) setProfileOpen(false); };
    document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f);
  }, [profileOpen]);

  const go = apCB((id) => { setView(id); setNavOpen(false); }, []);
  const toggleCollapse = apCB(() => setCollapsed((c) => { const n = !c; try { localStorage.setItem("tr-collapsed", n ? "1" : "0"); } catch (e) {} return n; }), []);

  let body;
  switch (view) {
    case "overview": body = <P.OverviewView go={go} />; break;
    case "accounts": body = <P.AccountsView go={go} />; break;
    case "transactions": body = <P.TransactionsView />; break;
    case "insights": body = <P.InsightsView />; break;
    case "budgets": body = <P.BudgetsView />; break;
    case "goals": body = <P.GoalsView />; break;
    case "bills": body = <P.BillsView />; break;
    case "debts": body = <P.DebtsView />; break;
    case "forecast": body = <P.ForecastView />; break;
    case "whatif": body = <P.WhatIfView />; break;
    case "tax": body = <P.TaxView />; break;
    case "reports": body = <P.ReportsView />; break;
    case "alerts": body = <P.AlertsView />; break;
    case "connect": body = <P.ConnectView go={go} />; break;
    default: body = <P.OverviewView go={go} />;
  }

  return (
    <div className="ae-shell">
      {navOpen ? <div className="ae-backdrop" onClick={() => setNavOpen(false)} /> : null}
      <aside className={"ae-sidebar" + (collapsed ? " ae-sidebar--collapsed" : "") + (navOpen ? " ae-sidebar--open" : "")} aria-label="Treasurer navigation">
        <div className="ae-side-head">
          <a className="ae-brand" href="AlterEgo.html" title="Back to AlterEgo" style={{ textDecoration: "none" }}>
            <img className="ae-brand-logo" src="alterego/logo.png" alt="autonomux" />
            <span className="ae-brand-word">autonom<em>ux</em></span>
          </a>
          <button className="ae-icon-ghost" onClick={toggleCollapse} aria-label="Collapse"><P.TRIcon name={collapsed ? "PanelLeftOpen" : "PanelLeftClose"} size={18} /></button>
        </div>

        <div style={{ padding: collapsed ? "0" : "0 6px", marginBottom: 6 }}>
          <div className="ae-rail-label" style={{ display: collapsed ? "none" : "block" }}>Treasurer</div>
        </div>

        <nav className="ae-nav" aria-label="Primary" style={{ overflowY: "auto", flex: 1 }}>
          {TR_NAV.map((n, i) => n.sep ? (
            <div key={"s" + i} className="ae-rail-label" style={{ display: collapsed ? "none" : "block", marginTop: 12 }}>{n.sep}</div>
          ) : (
            <button key={n.id} className={"ae-nav-item" + (view === n.id ? " ae-nav-item--active" : "")} onClick={() => go(n.id)} title={n.label}>
              <span className="ae-nav-icon"><P.TRIcon name={n.icon} size={18} /></span>
              <span className="ae-nav-label">{n.label}</span>
              {n.badge ? <span className="ae-nav-badge">{n.badge}</span> : null}
            </button>
          ))}
        </nav>

        <div className="ae-account" ref={pRef} style={{ marginTop: "auto" }}>
          {profileOpen ? (
            <div className="ae-profile-menu" role="menu">
              <a className="ae-profile-item" href="AlterEgo.html"><P.TRIcon name="MessageSquare" size={16} /><span>AlterEgo chat</span></a>
              <a className="ae-profile-item" href="ControlRoom.html"><P.TRIcon name="Activity" size={16} /><span>ControlRoom</span></a>
              <div className="ae-profile-sep" />
              <button className="ae-profile-item" role="menuitem" onClick={() => { go("connect"); setProfileOpen(false); }}><P.TRIcon name="Plus" size={16} /><span>Connect account</span></button>
              <a className="ae-profile-item ae-profile-item--danger" href="Login.html"><P.TRIcon name="LogOut" size={16} /><span>Log out</span></a>
            </div>
          ) : null}
          <button className={"ae-account-row" + (profileOpen ? " ae-account-row--open" : "")} onClick={() => setProfileOpen((v) => !v)}>
            <span className="ae-avatar">L</span>
            <div className="ae-account-text">
              <div className="ae-account-email">lightspiritux@gmail.com</div>
              <div className="ae-account-sub">Tenant · Active</div>
            </div>
            <span className="ae-account-caret"><P.TRIcon name="ChevronsUpDown" size={15} /></span>
          </button>
        </div>
      </aside>

      <div className="ae-main">
        <header className="ae-topbar">
          <button className="ae-hamburger" aria-label="Menu" onClick={() => setNavOpen(true)}><P.TRIcon name="Menu" size={18} /></button>
          <div className="ae-topbar-spacer" />
          <div className="ae-topbar-actions">
            <a className="ae-tb-btn" href="AlterEgo.html" title="Back to AlterEgo"><P.TRIcon name="MessageSquare" size={16} />Ask AlterEgo</a>
          </div>
        </header>
        <div className="chat-scroller" role="region" aria-label="Treasurer">
          {body}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<TrApp />);
