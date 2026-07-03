/* ============================================================
   Treasurer — screens B: Budgets · Goals · Bills · Debts
   ============================================================ */
const { useState: bUS } = React;
const TB = window;

/* ── BUDGETS / envelopes ─────────────────────────────────────── */
function BudgetsView() {
  const TR = window.TR;
  const [budgets, setBudgets] = bUS(TR.BUDGETS.map((b) => ({ ...b })));
  const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  return (
    <div className="ae-screen">
      <TB.TrHead kicker="Treasurer · Budgets" title="Envelopes that <em>hold the line</em>."
        lede="Set a limit per category and I'll track it, warn you near the edge, and flag anything over."
        actions={<button className="ae-screen-btn ae-screen-btn--primary"><TB.TRIcon name="Plus" size={15} />New budget</button>} />

      <div className="ae-stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="ae-stat ae-stat--accent"><span className="ae-stat__label"><TB.TRIcon name="Wallet" size={12} />Budgeted</span><span className="ae-stat__val">{TB.money0(totalLimit)}</span><span className="ae-stat__sub">across {budgets.length} categories</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TB.TRIcon name="Receipt" size={12} />Spent</span><span className="ae-stat__val">{TB.money0(totalSpent)}</span><span className="ae-stat__sub">{Math.round(totalSpent / totalLimit * 100)}% of budget</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TB.TRIcon name="PiggyBank" size={12} />Remaining</span><span className="ae-stat__val">{TB.money0(Math.max(0, totalLimit - totalSpent))}</span><span className="ae-stat__sub">{budgets.filter((b) => b.spent > b.limit).length} over limit</span></div>
      </div>

      <TB.Card pad={true}>
        {budgets.map((b) => {
          const pct = Math.round(b.spent / b.limit * 100);
          const over = b.spent > b.limit;
          return (
            <div className="tr-budget" key={b.id}>
              <div className="tr-budget__top">
                <span className="tr-budget__name"><span className="ae-brk__ico" style={{ background: TR.cat(b.cat).color, color: "#fff", width: 26, height: 26 }}><TB.TRIcon name={TR.cat(b.cat).icon} size={13} /></span>{TR.cat(b.cat).label}</span>
                <span className="tr-budget__nums">{over ? <b>{TB.money0(b.spent)}</b> : TB.money0(b.spent)} <span style={{ color: "var(--muted)" }}>/ {TB.money0(b.limit)} · {b.period}</span></span>
              </div>
              <TB.Progress pct={pct} over={over} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "var(--muted)", fontFamily: "DM Mono, monospace" }}>
                <span>{pct}% used · alert at {b.alert}%</span>
                <span className={over ? "tr-budget__over" : ""}>{over ? TB.money0(b.spent - b.limit) + " over" : TB.money0(b.limit - b.spent) + " left"}</span>
              </div>
            </div>
          );
        })}
      </TB.Card>
    </div>
  );
}

/* ── GOALS ───────────────────────────────────────────────────── */
function GoalsView() {
  const TR = window.TR;
  return (
    <div className="ae-screen">
      <TB.TrHead kicker="Treasurer · Goals" title="What you're <em>saving toward</em>."
        lede="Targets with a date and a monthly number. I'll tell you honestly whether you're on track."
        actions={<button className="ae-screen-btn ae-screen-btn--primary"><TB.TRIcon name="Plus" size={15} />New goal</button>} />
      <div className="tr-goals">
        {TR.GOALS.map((g) => {
          const pct = Math.round(g.saved / g.target * 100);
          return (
            <div className="tr-goal" key={g.id}>
              <div className="tr-goal__top">
                <span className="tr-goal__ico"><TB.TRIcon name={g.icon} size={19} /></span>
                <span className="tr-goal__name">{g.name}</span>
                <span className={"tr-chip-track " + (g.onTrack ? "tr-chip-track--ok" : "tr-chip-track--behind")}>{g.onTrack ? "On track" : "Behind"}</span>
              </div>
              <div className="tr-goal__nums">
                <span className="tr-goal__saved">{TB.money0(g.saved)}</span>
                <span className="tr-goal__target">of {TB.money0(g.target)} · {pct}%</span>
              </div>
              <TB.Progress pct={pct} />
              <div className="tr-goal__foot">
                <span>{TB.money0(g.monthly)}/mo needed</span>
                <span>target <b>{g.targetDate}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── BILLS ───────────────────────────────────────────────────── */
function BillsView() {
  const TR = window.TR;
  const [bills, setBills] = bUS(TR.BILLS.map((b) => ({ ...b })));
  const markPaid = (id) => setBills((p) => p.map((b) => b.id === id ? { ...b, status: "paid" } : b));
  const parseM = (due) => due.split(" ")[0];
  const parseD = (due) => due.split(" ")[1];
  const order = { overdue: 0, due: 1, upcoming: 2, paid: 3 };
  const rows = bills.slice().sort((a, b) => (order[a.status] - order[b.status]) || (a.days - b.days));
  const upcomingTotal = bills.filter((b) => b.status !== "paid").reduce((s, b) => s + b.amount, 0);
  const stat = { upcoming: "Upcoming", due: "Due soon", overdue: "Overdue", paid: "Paid" };
  return (
    <div className="ae-screen">
      <TB.TrHead kicker="Treasurer · Bills" title="Nothing <em>slips past</em>."
        lede="Every recurring bill with its due date and reminder cadence. I'll nudge you before each one — never pay without you."
        actions={<button className="ae-screen-btn ae-screen-btn--primary"><TB.TRIcon name="Plus" size={15} />Add bill</button>} />
      <div className="ae-stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="ae-stat ae-stat--accent"><span className="ae-stat__label"><TB.TRIcon name="CalendarClock" size={12} />Due this cycle</span><span className="ae-stat__val">{TB.money0(upcomingTotal)}</span><span className="ae-stat__sub">{bills.filter((b) => b.status !== "paid").length} bills</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TB.TRIcon name="TriangleAlert" size={12} />Overdue</span><span className="ae-stat__val">{bills.filter((b) => b.status === "overdue").length}</span><span className="ae-stat__sub">needs attention</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TB.TRIcon name="Check" size={12} />Paid this month</span><span className="ae-stat__val">{bills.filter((b) => b.status === "paid").length}</span><span className="ae-stat__sub">on time</span></div>
      </div>
      <TB.Card pad={true}>
        {rows.map((b) => (
          <div className="tr-bill" key={b.id}>
            <div className="tr-bill__cal"><div className="tr-bill__cal-m">{parseM(b.due)}</div><div className="tr-bill__cal-d">{parseD(b.due)}</div></div>
            <div className="tr-bill__main">
              <div className="tr-bill__name">{b.name}</div>
              <div className="tr-bill__meta">{b.freq} · {TR.acct(b.acct).name} · reminders {b.reminders.join(" / ")}</div>
            </div>
            <span className={"tr-billstat tr-billstat--" + b.status}>{stat[b.status]}</span>
            <span className="tr-bill__amt">{TB.money0(b.amount)}</span>
            {b.status !== "paid" ? <button className="ae-lbtn" onClick={() => markPaid(b.id)}>Mark paid</button> : <span style={{ width: 84 }} />}
          </div>
        ))}
      </TB.Card>
    </div>
  );
}

/* ── DEBTS ───────────────────────────────────────────────────── */
function DebtsView() {
  const TR = window.TR;
  const [strategy, setStrategy] = bUS("avalanche");
  const debts = TR.DEBTS.slice().sort((a, b) => strategy === "avalanche" ? b.apr - a.apr : a.balance - b.balance);
  const total = debts.reduce((s, d) => s + d.balance, 0);
  const totalMin = debts.reduce((s, d) => s + d.min, 0);
  const wAvgApr = debts.reduce((s, d) => s + d.apr * d.balance, 0) / total;
  const payoff = strategy === "avalanche" ? { date: "Mar 2028", saved: 1840 } : { date: "May 2028", saved: 1120 };
  return (
    <div className="ae-screen">
      <TB.TrHead kicker="Treasurer · Debts" title="A path to <em>zero</em>."
        lede="Every balance, its rate, and a payoff plan. Compare avalanche (save the most) against snowball (fastest wins)." />
      <div className="ae-stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="ae-stat ae-stat--accent"><span className="ae-stat__label"><TB.TRIcon name="Landmark" size={12} />Total debt</span><span className="ae-stat__val">{TB.money0(total)}</span><span className="ae-stat__sub">across {debts.length} balances</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TB.TRIcon name="Percent" size={12} />Avg APR</span><span className="ae-stat__val">{wAvgApr.toFixed(1)}<span>%</span></span><span className="ae-stat__sub">weighted by balance</span></div>
        <div className="ae-stat"><span className="ae-stat__label"><TB.TRIcon name="CalendarCheck" size={12} />Min / mo</span><span className="ae-stat__val">{TB.money0(totalMin)}</span><span className="ae-stat__sub">minimum payments</span></div>
      </div>

      <div className="tr-block-label" style={{ justifyContent: "space-between", display: "flex" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><TB.TRIcon name="Route" size={14} />Payoff strategy</span>
        <span className="tr-strategy-toggle">
          <button className={strategy === "avalanche" ? "on" : ""} onClick={() => setStrategy("avalanche")}>Avalanche</button>
          <button className={strategy === "snowball" ? "on" : ""} onClick={() => setStrategy("snowball")}>Snowball</button>
        </span>
      </div>

      <TB.Card pad={true}>
        <div className="tr-debt" style={{ borderTop: "none" }}>
          <span className="tr-debt__k">Debt</span><span className="tr-debt__k">APR</span><span className="tr-debt__k">Min/mo</span><span className="tr-debt__k">Balance</span>
        </div>
        {debts.map((d, i) => (
          <div className="tr-debt" key={d.id}>
            <span className="tr-debt__name">{i === 0 ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="tr-flag tr-flag--sub">focus</span>{d.name}</span> : d.name}</span>
            <span className="tr-debt__v tr-debt__apr">{d.apr}%</span>
            <span className="tr-debt__v">{TB.money0(d.min)}</span>
            <span className="tr-debt__v">{TB.money0(d.balance)}</span>
          </div>
        ))}
      </TB.Card>

      <div className="tr-hint" style={{ marginTop: 16 }}>
        With the <b>{strategy}</b> method, you're debt-free by <b>{payoff.date}</b> and save <b>{TB.money0(payoff.saved)}</b> in interest versus paying minimums. {strategy === "avalanche" ? "Avalanche targets your highest APR first — the Amex at 24.99%." : "Snowball clears your smallest balance first for quicker momentum."}
      </div>
    </div>
  );
}

Object.assign(window, { BudgetsView, GoalsView, BillsView, DebtsView });
