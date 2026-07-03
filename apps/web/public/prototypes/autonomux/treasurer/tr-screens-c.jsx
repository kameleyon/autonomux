/* ============================================================
   Treasurer — screens C: Forecast · What-if · Tax · Reports
                · Alerts · Connect bank
   ============================================================ */
const { useState: cUS } = React;
const TC = window;

/* ── CASH-FLOW FORECAST ──────────────────────────────────────── */
function ForecastView() {
  const TR = window.TR;
  const [horizon, setHorizon] = cUS(90);
  const fc = TR.buildForecast(horizon);
  const events = TR.FORECAST_EVENTS.filter((e) => e.day <= horizon).sort((a, b) => a.day - b.day);
  return (
    <div className="ae-screen">
      <TC.TrHead kicker="Treasurer · Forecast" title="Where your balance is <em>headed</em>."
        lede="Projected from your real balance, scheduled bills, and expected deposits."
        actions={<TC.Seg value={horizon} options={[{ value: 30, label: "30d" }, { value: 60, label: "60d" }, { value: 90, label: "90d" }]} onChange={setHorizon} />} />

      <div className="ae-stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="ae-stat ae-stat--accent"><span className="ae-stat__label"><TC.TRIcon name="Wallet" size={12} />Today</span><span className="ae-stat__val">{TC.money0(fc.pts[0].bal)}</span><span className="ae-stat__sub">checking balance</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TC.TRIcon name="TrendingDown" size={12} />Low point</span><span className="ae-stat__val" style={{ color: "var(--brand-red)" }}>{TC.money0(fc.low.bal)}</span><span className="ae-stat__sub">around day {fc.low.day}</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TC.TRIcon name="Flag" size={12} />Day {horizon}</span><span className="ae-stat__val">{TC.money0(fc.pts[fc.pts.length - 1].bal)}</span><span className="ae-stat__sub">projected</span></div>
      </div>

      <TC.Card title="Projected balance" icon="Activity" sub={"Next " + horizon + " days"}>
        <TC.LineChart pts={fc.pts} low={fc.low} h={200} labelForDay={(l) => "Low " + TC.money0(l.bal)} />
        <div className="tr-hint"><b>You'll dip below {TC.money0(fc.low.bal)}</b> around day {fc.low.day} — before your next Stripe payout. Consider moving a bill or holding a large purchase until after it lands.</div>
      </TC.Card>

      <div className="tr-block-label"><TC.TRIcon name="CalendarClock" size={14} />Upcoming money events</div>
      <TC.Card pad={true}>
        {events.map((e, i) => (
          <div className="tr-txn" key={i} style={{ cursor: "default" }}>
            <span className="tr-txn__ico" style={{ background: e.amount > 0 ? "#c2701a" : "var(--surface-warm)", color: e.amount > 0 ? "#fff" : "var(--brand-orange)" }}><TC.TRIcon name={e.amount > 0 ? "ArrowDownLeft" : "ArrowUpRight"} size={15} /></span>
            <div className="tr-txn__main"><div className="tr-txn__merch">{e.label}</div><div className="tr-txn__sub">in {e.day} {e.day === 1 ? "day" : "days"}</div></div>
            <span className={"tr-txn__amt" + (e.amount > 0 ? " tr-txn__amt--in" : "")}>{TC.money(e.amount, { plus: e.amount > 0 })}</span>
          </div>
        ))}
      </TC.Card>
    </div>
  );
}

/* ── WHAT-IF SCENARIOS ───────────────────────────────────────── */
const SCENARIOS = [
  { id: "laptop", label: "Buy $2,000 laptop", amount: -2000, kind: "once" },
  { id: "rent", label: "Rent +$200/mo", amount: -200, kind: "recurring" },
  { id: "raise", label: "Raise +$800/mo", amount: 800, kind: "recurring" },
  { id: "trip", label: "$3,500 trip", amount: -3500, kind: "once" },
];
function WhatIfView() {
  const TR = window.TR;
  const [active, setActive] = cUS("laptop");
  const base = TR.buildForecast(90);
  const sc = SCENARIOS.find((s) => s.id === active);
  // recompute a shifted forecast
  const shifted = (() => {
    let bal = 8420.55 + (sc.kind === "once" ? sc.amount : 0);
    const pts = [{ day: 0, bal }]; const daily = -78 + (sc.kind === "recurring" ? sc.amount / 30 : 0);
    for (let d = 1; d <= 90; d++) { bal += daily; TR.FORECAST_EVENTS.filter((e) => e.day === d).forEach((e) => bal += e.amount); pts.push({ day: d, bal: Math.round(bal) }); }
    let low = pts[0]; pts.forEach((p) => { if (p.bal < low.bal) low = p; }); return { pts, low };
  })();
  const runwayBase = TR.spendable / TR.monthlyExpenses;
  const runwayAfter = (TR.spendable + (sc.kind === "once" ? sc.amount : sc.amount * 3)) / (TR.monthlyExpenses - (sc.kind === "recurring" ? sc.amount : 0));
  return (
    <div className="ae-screen">
      <TC.TrHead kicker="Treasurer · What-if" title="Play it out <em>before</em> you commit."
        lede="Test a purchase or an income change and see the hit to your runway, low point, and goals — before → after." />
      <TC.Card title="Try a scenario" icon="FlaskConical">
        <div className="tr-scenario-chips">
          {SCENARIOS.map((s) => <button key={s.id} className={"tr-schip" + (active === s.id ? " tr-schip--on" : "")} onClick={() => setActive(s.id)}>{s.label}</button>)}
        </div>
        <div className="tr-compare">
          <div className="tr-compare__col"><div className="tr-compare__k">Runway now</div><div className="tr-compare__v">{runwayBase.toFixed(1)} mo</div></div>
          <div className="tr-compare__arrow"><TC.TRIcon name="ArrowRight" size={22} /></div>
          <div className="tr-compare__col"><div className="tr-compare__k">After</div><div className="tr-compare__v tr-compare__v--after">{runwayAfter.toFixed(1)} mo</div></div>
        </div>
      </TC.Card>
      <TC.Card title="Impact on cash flow" icon="Activity">
        <TC.LineChart pts={shifted.pts} low={shifted.low} h={170} labelForDay={(l) => "Low " + TC.money0(l.bal)} />
        <div className="tr-whatif-line"><span>Cash-flow low point</span><span><b>{TC.money0(base.low.bal)}</b> → <b style={{ color: "var(--brand-red-deep)" }}>{TC.money0(shifted.low.bal)}</b></span></div>
        <div className="tr-whatif-line"><span>Japan trip goal timeline</span><span><b>Oct 2026</b> → <b style={{ color: "var(--brand-red-deep)" }}>{sc.amount < 0 ? "Dec 2026" : "Aug 2026"}</b></span></div>
        <div className="tr-whatif-line"><span>Emergency fund monthly need</span><span><b>{TC.money0(1285)}</b> → <b style={{ color: "var(--brand-red-deep)" }}>{TC.money0(sc.amount < 0 ? 1420 : 1150)}</b></span></div>
      </TC.Card>
    </div>
  );
}

/* ── TAX SET-ASIDE ───────────────────────────────────────────── */
function TaxView() {
  const TR = window.TR; const tx = TR.TAX;
  const [pct, setPct] = cUS(tx.reservePct);
  const target = Math.round(tx.incomeYTD * pct / 100);
  const gap = target - tx.setAside;
  const savedPct = Math.round(tx.setAside / target * 100);
  return (
    <div className="ae-screen">
      <TC.TrHead kicker="Treasurer · Tax" title="Set it aside <em>as you earn</em>."
        lede="For founders and freelancers — a running reserve so quarterly taxes never surprise you." />
      <div className="ae-stat-grid">
        <div className="ae-stat ae-stat--accent"><span className="ae-stat__label"><TC.TRIcon name="Landmark" size={12} />Set aside</span><span className="ae-stat__val">{TC.money0(tx.setAside)}</span><span className="ae-stat__sub">of {TC.money0(target)} target</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TC.TRIcon name="Receipt" size={12} />Est. liability</span><span className="ae-stat__val">{TC.money0(tx.estLiability)}</span><span className="ae-stat__sub">2026 estimate</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TC.TRIcon name="TrendingUp" size={12} />Income YTD</span><span className="ae-stat__val">{TC.money0(tx.incomeYTD)}</span><span className="ae-stat__sub">1099 + payouts</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TC.TRIcon name="Gap" size={12} />Still to reserve</span><span className="ae-stat__val" style={{ color: "var(--brand-red)" }}>{TC.money0(Math.max(0, gap))}</span><span className="ae-stat__sub">to hit target</span></div>
      </div>
      <TC.Card title="Reserve rate" icon="Percent" sub="Share of each deposit I suggest setting aside">
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 0" }}>
          <input type="range" min="15" max="40" value={pct} onChange={(e) => setPct(+e.target.value)} style={{ flex: 1, accentColor: "#f26b1a" }} />
          <span style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 34, color: "var(--ink)", minWidth: 70, textAlign: "right" }}>{pct}%</span>
        </div>
        <div style={{ marginTop: 4 }}><TC.Progress pct={savedPct} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontFamily: "DM Mono, monospace", fontSize: 12, color: "var(--muted)" }}>
          <span>{savedPct}% of target reserved</span><span>{TC.money0(target)} target at {pct}%</span>
        </div>
        <div className="tr-hint">On your next <b>$4,200</b> Stripe payout, I'll suggest moving <b>{TC.money0(Math.round(4200 * pct / 100))}</b> to your tax reserve.</div>
      </TC.Card>
    </div>
  );
}

/* ── REPORTS ─────────────────────────────────────────────────── */
function ReportsView() {
  const TR = window.TR;
  const [period, setPeriod] = cUS("month");
  const p = TR.PERIOD[period];
  const savingsRate = Math.round(p.net / p.in * 100);
  const topCats = TR.SPEND_BY_CAT.slice().sort((a, b) => b.amount - a.amount).slice(0, 3);
  return (
    <div className="ae-screen">
      <TC.TrHead kicker="Treasurer · Reports" title="The month, <em>summarized</em>."
        lede="A clean summary you can export or have me email you."
        actions={<div style={{ display: "flex", gap: 8 }}><button className="ae-screen-btn"><TC.TRIcon name="Download" size={15} />CSV</button><button className="ae-screen-btn"><TC.TRIcon name="FileText" size={15} />PDF</button><button className="ae-screen-btn ae-screen-btn--primary"><TC.TRIcon name="Mail" size={15} />Email me this</button></div>} />
      <div className="tr-controls"><TC.Seg value={period} options={[{ value: "week", label: "This week" }, { value: "month", label: "This month" }]} onChange={setPeriod} /></div>
      <div className="tr-report-stats">
        <div className="ae-stat ae-stat--accent"><span className="ae-stat__label"><TC.TRIcon name="ArrowDownLeft" size={12} />Income</span><span className="ae-stat__val">{TC.money0(p.in)}</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TC.TRIcon name="ArrowUpRight" size={12} />Spend</span><span className="ae-stat__val">{TC.money0(p.out)}</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TC.TRIcon name="Equal" size={12} />Net</span><span className="ae-stat__val">{TC.money(p.net, { plus: true })}</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TC.TRIcon name="PiggyBank" size={12} />Savings rate</span><span className="ae-stat__val">{savingsRate}<span>%</span></span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TC.TRIcon name="Receipt" size={12} />Transactions</span><span className="ae-stat__val">{TR.TXNS.length}</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TC.TRIcon name="Store" size={12} />Top category</span><span className="ae-stat__val" style={{ fontSize: 24 }}>{TR.cat(topCats[0].cat).label}</span></div>
      </div>
      <TC.Card title="Top categories" icon="ChartBar" sub={period === "month" ? "This month" : "This week"}>
        {topCats.map((c) => (
          <div className="ae-brk" key={c.cat}>
            <span className="ae-brk__name"><span className="ae-brk__ico" style={{ background: TR.cat(c.cat).color, color: "#fff", width: 26, height: 26 }}><TC.TRIcon name={TR.cat(c.cat).icon} size={13} /></span>{TR.cat(c.cat).label}</span>
            <span className="ae-brk__track"><span className="ae-meter"><span className="ae-meter__fill" style={{ width: (c.amount / topCats[0].amount * 100) + "%" }} /></span></span>
            <span className="ae-brk__val">{TC.money0(c.amount)}</span>
          </div>
        ))}
      </TC.Card>
    </div>
  );
}

/* ── ALERTS / NOTIFICATION SETTINGS ──────────────────────────── */
function AlertsView() {
  const [t, setT] = cUS({ bill3d: true, bill1d: true, billDay: true, lowBal: true, largeTxn: true, subRenew: false, weekly: true, forecastDip: true });
  const [lowThresh, setLowThresh] = cUS(1000);
  const [largeThresh, setLargeThresh] = cUS(250);
  const [chan, setChan] = cUS({ app: true, push: true, email: true });
  const tog = (k) => setT((p) => ({ ...p, [k]: !p[k] }));
  const cg = (k) => setChan((p) => ({ ...p, [k]: !p[k] }));
  return (
    <div className="ae-screen">
      <TC.TrHead kicker="Treasurer · Alerts" title="Tell me <em>when to speak up</em>."
        lede="Which money moments are worth a nudge — and where you want to hear about them." />
      <div className="ae-acct-split">
        <div>
          <TC.Card title="Bill reminders" icon="CalendarClock">
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">3 days before</div></div><div className="ae-set-row__control"><TC.Switch on={t.bill3d} onChange={() => tog("bill3d")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">1 day before</div></div><div className="ae-set-row__control"><TC.Switch on={t.bill1d} onChange={() => tog("bill1d")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Day of</div></div><div className="ae-set-row__control"><TC.Switch on={t.billDay} onChange={() => tog("billDay")} /></div></div>
          </TC.Card>
          <TC.Card title="Balance & spending" icon="TriangleAlert">
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Low balance</div><div className="ae-set-row__desc">Warn when checking dips below a threshold.</div></div><div className="ae-set-row__control"><span className="ae-set-value">{TC.money0(lowThresh)}</span><TC.Switch on={t.lowBal} onChange={() => tog("lowBal")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Large transaction</div><div className="ae-set-row__desc">Flag any charge over this amount.</div></div><div className="ae-set-row__control"><span className="ae-set-value">{TC.money0(largeThresh)}</span><TC.Switch on={t.largeTxn} onChange={() => tog("largeTxn")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Subscription renewal</div><div className="ae-set-row__desc">Heads-up before a recurring charge.</div></div><div className="ae-set-row__control"><TC.Switch on={t.subRenew} onChange={() => tog("subRenew")} /></div></div>
          </TC.Card>
        </div>
        <div>
          <TC.Card title="Digests & forecasts" icon="Mail">
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Weekly money briefing</div><div className="ae-set-row__desc">Every Monday morning.</div></div><div className="ae-set-row__control"><TC.Switch on={t.weekly} onChange={() => tog("weekly")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Forecast dip warning</div><div className="ae-set-row__desc">When a projected low point gets tight.</div></div><div className="ae-set-row__control"><TC.Switch on={t.forecastDip} onChange={() => tog("forecastDip")} /></div></div>
          </TC.Card>
          <TC.Card title="Channels" icon="Send" sub="Where alerts reach you">
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">In-app</div></div><div className="ae-set-row__control"><TC.Switch on={chan.app} onChange={() => cg("app")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Push</div></div><div className="ae-set-row__control"><TC.Switch on={chan.push} onChange={() => cg("push")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Email</div></div><div className="ae-set-row__control"><TC.Switch on={chan.email} onChange={() => cg("email")} /></div></div>
          </TC.Card>
        </div>
      </div>
    </div>
  );
}

/* ── CONNECT BANK (onboarding) ───────────────────────────────── */
const PICK_ACCTS = [
  { id: "p1", name: "Total Checking ···· 4471", type: "Checking" },
  { id: "p2", name: "Premier Savings ···· 8830", type: "Savings" },
  { id: "p3", name: "Amex Gold ···· 1009", type: "Credit" },
  { id: "p4", name: "Brokerage ···· 2245", type: "Investment" },
];
function ConnectView({ go }) {
  const [picked, setPicked] = cUS(["p1", "p2", "p3"]);
  const [stage, setStage] = cUS("intro"); // intro → pick
  const toggle = (id) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  return (
    <div className="ae-screen">
      <div className="tr-connect">
        <div className="tr-connect__hero">
          <div className="tr-connect__lock"><TC.TRIcon name="ShieldCheck" size={28} /></div>
          <h1 className="ae-screen-h1" style={{ whiteSpace: "normal" }}>Connect a bank, <em>safely</em>.</h1>
          <p className="ae-screen-lede" style={{ margin: "12px auto 0" }}>Treasurer reads your balances and transactions through Plaid — an encrypted, read-only connection. It can never move your money.</p>
        </div>

        {stage === "intro" ? (
          <React.Fragment>
            <div className="tr-trust">
              <div className="tr-trust__item tr-trust__item--do">
                <h4><TC.TRIcon name="Eye" size={16} />What I read</h4>
                <ul>
                  <li><TC.TRIcon name="Check" size={14} />Account balances</li>
                  <li><TC.TRIcon name="Check" size={14} />Transaction history & categories</li>
                  <li><TC.TRIcon name="Check" size={14} />Recurring bills & subscriptions</li>
                </ul>
              </div>
              <div className="tr-trust__item tr-trust__item--never">
                <h4><TC.TRIcon name="Ban" size={16} />What I never do</h4>
                <ul>
                  <li><TC.TRIcon name="X" size={14} />Move or transfer money</li>
                  <li><TC.TRIcon name="X" size={14} />Store your bank password</li>
                  <li><TC.TRIcon name="X" size={14} />Share data across accounts</li>
                </ul>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8 }}>
              <button className="ae-screen-btn ae-screen-btn--primary" onClick={() => setStage("pick")}><TC.TRIcon name="Plus" size={15} />Connect an account</button>
              <button className="ae-screen-btn" onClick={() => go("overview")}>Maybe later</button>
            </div>
            <p className="tr-muted" style={{ textAlign: "center", marginTop: 16, color: "rgba(255,240,225,0.6)" }}>By connecting, you agree to our read-only data use. Revoke anytime in Settings.</p>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <TC.Card title="Chase · choose accounts" icon="Landmark" sub="Connected via Plaid — pick what Treasurer can see">
              {PICK_ACCTS.map((a) => (
                <div className="tr-acct-pick" key={a.id} onClick={() => toggle(a.id)}>
                  <span className={"tr-check" + (picked.includes(a.id) ? " tr-check--on" : "")}><TC.TRIcon name="Check" size={14} /></span>
                  <div style={{ flex: 1 }}><div className="tr-acct__name">{a.name}</div><div className="tr-acct__meta">{a.type}</div></div>
                </div>
              ))}
            </TC.Card>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="ae-screen-btn ae-screen-btn--primary" onClick={() => go("accounts")}><TC.TRIcon name="Check" size={15} />Link {picked.length} account{picked.length === 1 ? "" : "s"}</button>
              <button className="ae-screen-btn" onClick={() => setStage("intro")}>Back</button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ForecastView, WhatIfView, TaxView, ReportsView, AlertsView, ConnectView });
