/* ============================================================
   Treasurer — screens A: Overview · Accounts · Transactions · Insights
   ============================================================ */
const { useState: aUS } = React;
const T = window;

function TrHead({ kicker, title, lede, actions }) {
  return (
    <div className="ae-screen-head">
      <div className="ae-screen-head__row">
        <div>
          <div className="ae-screen-kicker">{kicker}</div>
          <h1 className="ae-screen-h1" style={{ whiteSpace: "normal" }} dangerouslySetInnerHTML={{ __html: title }} />
        </div>
        {actions || null}
      </div>
      {lede ? <p className="ae-screen-lede">{lede}</p> : null}
    </div>
  );
}

/* ── OVERVIEW ────────────────────────────────────────────────── */
function OverviewView({ go }) {
  const [period, setPeriod] = aUS("month");
  const TR = window.TR;
  const p = TR.PERIOD[period];
  const runway = (TR.spendable / TR.monthlyExpenses);
  const fc = TR.buildForecast(90);
  const bills = TR.BILLS.filter((b) => b.status !== "paid").sort((a, b) => a.days - b.days).slice(0, 3);
  const nw = TR.NETWORTH_SERIES;
  const nwDelta = Math.round((nw[nw.length - 1] - nw[0]) / nw[0] * 100);
  const donut = TR.SPEND_BY_CAT.map((s) => ({ label: TR.cat(s.cat).label, value: s.amount, color: TR.cat(s.cat).color }));
  const spendTotal = donut.reduce((s, d) => s + d.value, 0);

  return (
    <div className="ae-screen">
      <TrHead kicker="Treasurer" title="Your money, <em>mapped</em>."
        lede="Everything Treasurer watches — balances, runway, what's coming, and what's quietly off — in one read."
        actions={<button className="ae-screen-btn" onClick={() => go("transactions")}><T.TRIcon name="List" size={15} />All transactions</button>} />

      <div className="tr-hero-grid">
        <div className="ae-stat ae-stat--accent">
          <span className="ae-stat__label"><T.TRIcon name="Wallet" size={12} />Total balance</span>
          <span className="tr-big">{T.money0(TR.totalBalance)}</span>
          <span className="ae-stat__sub">Spendable {T.money0(TR.spendable)} · across {TR.ACCOUNTS.length} accounts</span>
        </div>
        <div className="ae-stat">
          <span className="ae-stat__label"><T.TRIcon name="LifeBuoy" size={12} />Runway</span>
          <span className="tr-big">{runway.toFixed(1)}<span> mo</span></span>
          <span className="ae-stat__sub">of expenses covered</span>
        </div>
        <div className="ae-stat">
          <span className="ae-stat__label"><T.TRIcon name="TrendingUp" size={12} />Net worth</span>
          <span className="tr-big">{T.money0(TR.assets - TR.liabilities)}</span>
          <span className="ae-stat__sub"><span className="tr-delta tr-delta--up"><T.TRIcon name="ArrowUpRight" size={12} />{nwDelta}% · 6 mo</span></span>
        </div>
      </div>

      <div className="tr-grid-2-1">
        <T.Card title="This period" icon="ArrowLeftRight" action={<T.Seg value={period} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} onChange={setPeriod} />}>
          <div className="tr-ion">
            <div className="tr-ion__item"><span className="tr-ion__k"><T.TRIcon name="ArrowDownLeft" size={11} />In</span><span className="tr-ion__v tr-ion__v--in">{T.money0(p.in)}</span></div>
            <div className="tr-ion__item"><span className="tr-ion__k"><T.TRIcon name="ArrowUpRight" size={11} />Out</span><span className="tr-ion__v tr-ion__v--out">{T.money0(p.out)}</span></div>
            <div className="tr-ion__item"><span className="tr-ion__k"><T.TRIcon name="Equal" size={11} />Net</span><span className="tr-ion__v">{T.money(p.net, { plus: true })}</span></div>
          </div>
          <div style={{ marginTop: 18 }}><T.InOutBars data={TR.MONTHLY} /></div>
        </T.Card>

        <div>
          <T.Card title="Upcoming bills" icon="CalendarClock" action={<button className="ae-lbtn" onClick={() => go("bills")}>All</button>} pad={false}>
            {bills.map((b) => (
              <div className="tr-bill" key={b.id}>
                <div className="tr-bill__main"><div className="tr-bill__name">{b.name}</div><div className="tr-bill__meta">{b.days < 0 ? "overdue" : b.days === 0 ? "due today" : "in " + b.days + " days"} · {b.due}</div></div>
                <span className="tr-bill__amt">{T.money0(b.amount)}</span>
              </div>
            ))}
          </T.Card>
        </div>
      </div>

      <div className="tr-grid2" style={{ marginTop: "var(--sp-16)" }}>
        <T.Card title="Cash-flow forecast" icon="Activity" sub="Projected balance · next 90 days" action={<button className="ae-lbtn" onClick={() => go("forecast")}>Details</button>}>
          <T.LineChart pts={fc.pts} low={fc.low} h={150} labelForDay={(l) => "Low " + T.money0(l.bal) + " · day " + l.day} />
          <div className="tr-hint"><b>Heads up:</b> your low point is {T.money0(fc.low.bal)} around day {fc.low.day}, before your next payout lands.</div>
        </T.Card>

        <T.Card title="Where it went" icon="ChartPie" sub="This month by category" action={<button className="ae-lbtn" onClick={() => go("insights")}>Insights</button>}>
          <T.Donut data={donut.slice(0, 6)} total={spendTotal} center={T.money0(spendTotal)} centerSub="spent" />
        </T.Card>
      </div>

      <div className="tr-block-label"><T.TRIcon name="Lightbulb" size={14} />What I noticed</div>
      <div className="tr-insights">
        {TR.INSIGHTS.slice(0, 2).map((it, i) => (
          <div className={"tr-insight" + (it.tone === "alert" ? " tr-insight--alert" : "")} key={i}>
            <span className="tr-insight__ico"><T.TRIcon name={it.icon} size={16} /></span>
            <span className="tr-insight__text" dangerouslySetInnerHTML={{ __html: it.text }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── ACCOUNTS ────────────────────────────────────────────────── */
const ACCT_ICON = { checking: "Wallet", savings: "PiggyBank", credit: "CreditCard", investment: "TrendingUp", loan: "Landmark" };
const TYPE_LABEL = { checking: "Checking", savings: "Savings", credit: "Credit cards", investment: "Investments", loan: "Loans" };
function AccountsView({ go }) {
  const [accts, setAccts] = aUS(window.TR.ACCOUNTS.map((a) => ({ ...a })));
  const types = ["checking", "savings", "credit", "investment", "loan"];
  const reconnect = (id) => setAccts((p) => p.map((a) => a.id === id ? { ...a, status: "connected", synced: "just now" } : a));
  const stateChip = (s) => s === "connected" ? <span className="ae-conn__state ae-conn__state--connected"><span className="ae-dot-s ae-dot-s--ok" />Connected</span>
    : s === "expiring" ? <button className="ae-lbtn" onClick={(e) => { e.stopPropagation(); }}>Reconnect</button>
    : <button className="ae-lbtn ae-lbtn--danger">Fix connection</button>;
  return (
    <div className="ae-screen">
      <TrHead kicker="Treasurer · Accounts" title="Every account, <em>in sync</em>."
        lede="Balances across your banks, cards, and investments — refreshed through a read-only connection."
        actions={<button className="ae-screen-btn ae-screen-btn--primary" onClick={() => go("connect")}><T.TRIcon name="Plus" size={15} />Connect account</button>} />
      {types.map((ty) => {
        const rows = accts.filter((a) => a.type === ty);
        if (!rows.length) return null;
        const total = rows.reduce((s, a) => s + a.balance, 0);
        return (
          <div key={ty}>
            <div className="tr-typehead"><b>{TYPE_LABEL[ty]}</b><span>{T.money0(total)}</span></div>
            <T.Card pad={true}>
              {rows.map((a) => (
                <div className="tr-acct" key={a.id}>
                  <span className="tr-acct__ico"><T.TRIcon name={ACCT_ICON[a.type]} size={19} /></span>
                  <div className="tr-acct__main">
                    <div className="tr-acct__name">{a.inst} · {a.name}</div>
                    <div className="tr-acct__meta">···· {a.mask} · synced {a.synced}</div>
                  </div>
                  <div style={{ marginRight: 14 }}>{a.status === "connected" ? stateChip(a.status) : a.status === "expiring" ? <button className="ae-lbtn" onClick={() => reconnect(a.id)}>Reconnect</button> : <button className="ae-lbtn ae-lbtn--danger" onClick={() => reconnect(a.id)}>Fix</button>}</div>
                  <div className="tr-acct__bal">
                    <div className={"tr-acct__amt" + (a.balance < 0 ? " tr-acct__amt--neg" : "")}>{T.money(a.balance, { cents: true })}</div>
                    {a.type === "credit" ? <div className="tr-acct__avail">{T.money0(a.available)} available</div> : a.type === "loan" ? <div className="tr-acct__avail">balance owed</div> : <div className="tr-acct__avail">{T.money0(a.available)} available</div>}
                  </div>
                </div>
              ))}
            </T.Card>
          </div>
        );
      })}
    </div>
  );
}

/* ── TRANSACTIONS ────────────────────────────────────────────── */
function TransactionsView() {
  const TR = window.TR;
  const [q, setQ] = aUS("");
  const [catF, setCatF] = aUS("all");
  const [acctF, setAcctF] = aUS("all");
  const [sort, setSort] = aUS("date");
  const [range, setRange] = aUS("30d");
  const [open, setOpen] = aUS(null);
  let rows = TR.TXNS.slice();
  if (q) rows = rows.filter((t) => (t.merchant + " " + TR.cat(t.cat).label).toLowerCase().includes(q.toLowerCase()));
  if (catF !== "all") rows = rows.filter((t) => t.cat === catF);
  if (acctF !== "all") rows = rows.filter((t) => t.acct === acctF);
  if (sort === "amount") rows = rows.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const cats = Object.keys(TR.CATS);
  const flagChip = (f) => f === "dup" ? <span className="tr-flag tr-flag--dup"><T.TRIcon name="Copy" size={10} />duplicate</span>
    : f === "hike" ? <span className="tr-flag tr-flag--hike"><T.TRIcon name="ArrowUpRight" size={10} />price hike</span>
    : f === "sub" ? <span className="tr-flag tr-flag--sub"><T.TRIcon name="Repeat" size={10} />subscription</span> : null;
  return (
    <div className="ae-screen">
      <TrHead kicker="Treasurer · Transactions" title="Every dollar, <em>accounted for</em>."
        lede="Auto-categorized and flagged. Search, filter, and open a row to recategorize, split, or ask me to explain it." />
      <div className="tr-controls">
        <span className="tr-search"><T.TRIcon name="Search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant or category…" /></span>
        <select className="tr-select" value={range} onChange={(e) => setRange(e.target.value)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="custom">Custom…</option></select>
        <select className="tr-select" value={catF} onChange={(e) => setCatF(e.target.value)}><option value="all">All categories</option>{cats.map((c) => <option key={c} value={c}>{TR.CATS[c].label}</option>)}</select>
        <select className="tr-select" value={acctF} onChange={(e) => setAcctF(e.target.value)}><option value="all">All accounts</option>{TR.ACCOUNTS.map((a) => <option key={a.id} value={a.id}>{a.inst} {a.name}</option>)}</select>
        <select className="tr-select" value={sort} onChange={(e) => setSort(e.target.value)}><option value="date">Newest first</option><option value="amount">Largest first</option></select>
      </div>
      <T.Card pad={true}>
        <div className="tr-txns">
          {rows.length === 0 ? <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)" }}>No transactions match.</div> : rows.map((t) => (
            <React.Fragment key={t.id}>
              <div className="tr-txn" onClick={() => setOpen(open === t.id ? null : t.id)}>
                <T.CatIco cat={t.cat} />
                <div className="tr-txn__main">
                  <div className="tr-txn__merch">{t.merchant}</div>
                  <div className="tr-txn__sub">
                    <span>{t.date}</span><span>·</span><span>{TR.cat(t.cat).label}</span><span>·</span><span>{TR.acct(t.acct).inst}</span>
                    {t.pending ? <span className="tr-pending">pending</span> : null}
                    {flagChip(t.flag)}
                  </div>
                </div>
                <span className={"tr-txn__amt" + (t.amount > 0 ? " tr-txn__amt--in" : "")}>{T.money(t.amount, { cents: true, plus: t.amount > 0 })}</span>
              </div>
              {open === t.id ? (
                <div className="tr-txn-detail">
                  <button className="ae-lbtn"><T.TRIcon name="Tag" size={13} />Recategorize</button>
                  <button className="ae-lbtn"><T.TRIcon name="Split" size={13} />Split</button>
                  <button className="ae-lbtn"><T.TRIcon name="StickyNote" size={13} />Add note</button>
                  <button className="ae-lbtn ae-lbtn--primary"><T.TRIcon name="Sparkles" size={13} />Explain this</button>
                </div>
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </T.Card>
    </div>
  );
}

/* ── SPENDING INSIGHTS ───────────────────────────────────────── */
function InsightsView() {
  const TR = window.TR;
  const [range, setRange] = aUS("30d");
  const donut = TR.SPEND_BY_CAT.map((s) => ({ label: TR.cat(s.cat).label, value: s.amount, color: TR.cat(s.cat).color }));
  const total = donut.reduce((s, d) => s + d.value, 0);
  const subsTotal = TR.SUBS.reduce((s, x) => s + x.amount, 0);
  const maxMerch = Math.max(...TR.TOP_MERCHANTS.map((m) => m.amount));
  return (
    <div className="ae-screen">
      <TrHead kicker="Treasurer · Insights" title="Patterns worth <em>seeing</em>."
        lede="Where the money goes, what's moving, and the subscriptions quietly adding up."
        actions={<T.Seg value={range} options={[{ value: "30d", label: "30d" }, { value: "90d", label: "90d" }, { value: "mtd", label: "MTD" }]} onChange={setRange} />} />

      <div className="tr-grid2">
        <T.Card title="By category" icon="ChartPie">
          <T.Donut data={donut} total={total} center={T.money0(total)} centerSub={range} />
        </T.Card>
        <T.Card title="Trends" icon="TrendingUp" sub="Month over month">
          {Object.entries(TR.CAT_TRENDS).map(([cat, delta]) => (
            <div className="ae-brk" key={cat}>
              <span className="ae-brk__name"><span className="ae-brk__ico" style={{ background: TR.cat(cat).color, color: "#fff" }}><T.TRIcon name={TR.cat(cat).icon} size={13} /></span>{TR.cat(cat).label}</span>
              <span className="ae-brk__track"><span className="ae-meter"><span className="ae-meter__fill" style={{ width: Math.min(100, Math.abs(delta) * 2.4) + "%", background: delta > 0 ? "linear-gradient(90deg,#f26b1a,#e63312)" : "linear-gradient(90deg,#c2701a,#e0862a)" }} /></span></span>
              <span className="ae-brk__val" style={{ color: delta > 0 ? "var(--brand-red)" : "#b8611a" }}>{delta > 0 ? "↑" : "↓"} {Math.abs(delta)}%</span>
            </div>
          ))}
        </T.Card>
      </div>

      <div className="tr-grid2" style={{ marginTop: "var(--sp-16)" }}>
        <T.Card title="Top merchants" icon="Store" sub={range}>
          {TR.TOP_MERCHANTS.map((m) => (
            <div className="ae-brk" key={m.name}>
              <span className="ae-brk__name" style={{ flexBasis: 120 }}>{m.name}</span>
              <span className="ae-brk__track"><span className="ae-meter"><span className="ae-meter__fill" style={{ width: (m.amount / maxMerch * 100) + "%" }} /></span></span>
              <span className="ae-brk__val">{T.money0(m.amount)} · {m.count}×</span>
            </div>
          ))}
        </T.Card>
        <T.Card title="Subscriptions" icon="Repeat" sub={money0(subsTotal) + " / mo · " + TR.SUBS.length + " active"}>
          <div className="tr-txns">
            {TR.SUBS.map((s) => (
              <div className="tr-txn" key={s.name} style={{ cursor: "default" }}>
                <span className="tr-txn__ico" style={{ background: "var(--surface-warm)", color: "var(--brand-orange)" }}><T.TRIcon name="Repeat" size={15} /></span>
                <div className="tr-txn__main">
                  <div className="tr-txn__merch">{s.name}</div>
                  <div className="tr-txn__sub"><span>{s.freq}</span><span>·</span><span>last {s.last}</span>
                    {s.flag === "unused" ? <span className="tr-flag tr-flag--unused"><T.TRIcon name="MoonStar" size={10} />unused</span> : null}
                    {s.flag === "hike" ? <span className="tr-flag tr-flag--hike"><T.TRIcon name="ArrowUpRight" size={10} />raised</span> : null}
                  </div>
                </div>
                <span className="tr-txn__amt">{T.money(s.amount, { cents: true })}</span>
              </div>
            ))}
          </div>
          <div className="tr-hint"><b>$25/mo</b> looks unused — Figma and Notion haven't been touched in 40+ days.</div>
        </T.Card>
      </div>
    </div>
  );
}

Object.assign(window, { TrHead, OverviewView, AccountsView, TransactionsView, InsightsView });
