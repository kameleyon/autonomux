/* ============================================================
   autonomux Admin — shell + routing (React/Babel)
   ============================================================ */
const { useState: sUseState, useEffect: sUseEffect, useRef: sUseRef, useCallback: sUseCallback } = React;

const ADM_TITLES = {
  dashboard: "Dashboard", tenants: "Tenants", queue: "Queue", integrations: "Integrations",
  health: "Health", costs: "Costs", billing: "Billing", audit: "Audit log",
  activity: "Activity", compliance: "Compliance", flags: "Feature flags", support: "Support",
};
const ADM_GROUP_OF = {};
window.ADM.NAV.forEach((g) => g.items.forEach((it) => { ADM_GROUP_OF[it.id] = g.group; }));

function AdminApp() {
  const [route, setRoute] = sUseState("dashboard");   // section id, or "tenant-detail"
  const [navOpen, setNavOpen] = sUseState(false);
  const [opMenu, setOpMenu] = sUseState(false);
  const opRef = sUseRef(null);
  const scrollRef = sUseRef(null);

  // hash routing
  sUseEffect(() => {
    const apply = () => { const h = (location.hash || "#dashboard").slice(1); if (h) setRoute(h); };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const go = sUseCallback((id) => {
    setRoute(id); setNavOpen(false);
    if (location.hash.slice(1) !== id) location.hash = id;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  sUseEffect(() => {
    if (!opMenu) return;
    const h = (e) => { if (opRef.current && !opRef.current.contains(e.target)) setOpMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [opMenu]);

  const navActive = route === "tenant-detail" ? "tenants" : route;

  const renderView = () => {
    switch (route) {
      case "dashboard": return <DashboardView onNav={go} />;
      case "tenants": return <TenantsView onOpenTenant={() => go("tenant-detail")} />;
      case "tenant-detail": return <TenantDetailView onBack={() => go("tenants")} />;
      case "queue": return <QueueView />;
      case "integrations": return <IntegrationsView />;
      case "health": return <HealthView />;
      case "costs": return <CostsView />;
      case "billing": return <BillingView />;
      case "audit": return <AuditView />;
      case "activity": return <ActivityView />;
      case "compliance": return <ComplianceView />;
      case "flags": return <FlagsView />;
      case "support": return <SupportView />;
      default: return <DashboardView onNav={go} />;
    }
  };

  const crumbGroup = ADM_GROUP_OF[navActive] || "Runtime";
  const crumbTitle = route === "tenant-detail" ? "Tenant detail" : (ADM_TITLES[navActive] || "Dashboard");

  return (
    <div className="adm">
      {navOpen ? <div className="adm-backdrop" onClick={() => setNavOpen(false)} /> : null}
      <aside className={"adm-side" + (navOpen ? " adm-side--open" : "")}>
        <div className="adm-side__head">
          <img className="adm-side__logo" src="alterego/logo.png" alt="" />
          <div className="adm-brand">autonom<em>ux</em><small>Admin</small></div>
        </div>
        <nav className="adm-nav" aria-label="Admin sections">
          {window.ADM.NAV.map((g) => (
            <React.Fragment key={g.group}>
              <div className="adm-nav__group">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.id} className={"adm-nav__link" + (navActive === it.id ? " adm-nav__link--active" : "")} onClick={() => go(it.id)}>
                  <span className="adm-nav__ico"><AdmIcon name={it.icon} size={17} /></span>
                  <span className="adm-nav__label">{it.label}</span>
                  {it.count ? <span className={"adm-nav__count" + (it.alert ? " adm-nav__count--alert" : "")}>{it.count}</span> : null}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>
        <div className="adm-side__foot" ref={opRef} style={{ position: "relative" }}>
          {opMenu ? (
            <div className="adm-op-menu" role="menu">
              <button className="adm-op-item" role="menuitem"><AdmIcon name="Settings" size={16} />Settings</button>
              <button className="adm-op-item" role="menuitem"><AdmIcon name="KeyRound" size={16} />Security &amp; TOTP</button>
              <button className="adm-op-item" role="menuitem"><AdmIcon name="BookText" size={16} />Runbook</button>
              <div className="adm-op-sep" />
              <button className="adm-op-item adm-op-item--danger" role="menuitem" onClick={() => { (window.top || window).location.href = "/sign-out"; }}><AdmIcon name="LogOut" size={16} />Sign out</button>
            </div>
          ) : null}
          <button className="adm-op" onClick={() => setOpMenu((v) => !v)} aria-haspopup="menu" aria-expanded={opMenu}>
            <span className="adm-op__avatar">OP</span>
            <span className="adm-op__txt">
              <span className="adm-op__name">ops@autonomux</span>
              <span className="adm-op__role">Operator · TOTP</span>
            </span>
            <AdmIcon name="ChevronsUpDown" size={15} style={{ color: "var(--muted-soft)", flexShrink: 0 }} />
          </button>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-top">
          <button className="adm-burger" aria-label="Open menu" onClick={() => setNavOpen(true)}><AdmIcon name="Menu" size={18} /></button>
          <div className="adm-crumb">
            <span>{crumbGroup}</span><span className="adm-crumb__sep">/</span><b>{crumbTitle}</b>
          </div>
          <div className="adm-top__search" onClick={() => go("tenants")}>
            <AdmIcon name="Search" size={15} />Search tenants, jobs, audit…<kbd>⌘K</kbd>
          </div>
          <span className="adm-env"><span className="adm-dot adm-dot--ok" />production</span>
        </header>
        <div className="adm-scroll" ref={scrollRef}>
          {renderView()}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
