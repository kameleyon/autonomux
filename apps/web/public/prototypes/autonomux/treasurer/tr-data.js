/* ============================================================
   Treasurer — finance data (plain JS → window.TR)
   Synthetic but coherent: one founder's real-ish money picture.
   Warm-only palette on all category colors (no green/yellow/blue).
   ============================================================ */
(function () {
  // ── Category taxonomy (warm ramp) ───────────────────────────
  const CATS = {
    income:        { label: "Income", color: "#c2701a", icon: "TrendingUp" },
    housing:       { label: "Housing", color: "#b81f00", icon: "House" },
    dining:        { label: "Food & Dining", color: "#f26b1a", icon: "Utensils" },
    groceries:     { label: "Groceries", color: "#e0862a", icon: "ShoppingCart" },
    transport:     { label: "Transport", color: "#c2701a", icon: "Car" },
    shopping:      { label: "Shopping", color: "#ff9050", icon: "ShoppingBag" },
    subscriptions: { label: "Subscriptions", color: "#7a2010", icon: "Repeat" },
    health:        { label: "Health", color: "#e63312", icon: "HeartPulse" },
    utilities:     { label: "Utilities", color: "#a8530e", icon: "Zap" },
    entertainment: { label: "Entertainment", color: "#d9542a", icon: "Clapperboard" },
    travel:        { label: "Travel", color: "#b8611a", icon: "Plane" },
    transfer:      { label: "Transfer", color: "#9a8f82", icon: "ArrowLeftRight" },
    other:         { label: "Other", color: "#8a7a6a", icon: "Circle" },
  };

  // ── Accounts ────────────────────────────────────────────────
  const ACCOUNTS = [
    { id: "chk", inst: "Chase", name: "Total Checking", type: "checking", balance: 8420.55, available: 8210.55, synced: "2 min ago", status: "connected", mask: "4471" },
    { id: "sav", inst: "Chase", name: "Premier Savings", type: "savings", balance: 22300.00, available: 22300.00, synced: "2 min ago", status: "connected", mask: "8830" },
    { id: "cc", inst: "Amex", name: "Gold Card", type: "credit", balance: -1240.18, available: 13759.82, synced: "18 min ago", status: "connected", mask: "1009", limit: 15000 },
    { id: "inv", inst: "Fidelity", name: "Brokerage", type: "investment", balance: 41680.24, available: 41680.24, synced: "1 hr ago", status: "expiring", mask: "2245" },
    { id: "loan", inst: "Toyota Financial", name: "Auto Loan", type: "loan", balance: -9820.00, available: 0, synced: "yesterday", status: "connected", mask: "7712" },
  ];

  // ── This-month spend by category (dollars) ──────────────────
  const SPEND_BY_CAT = [
    { cat: "housing", amount: 2100 }, { cat: "dining", amount: 642 }, { cat: "groceries", amount: 486 },
    { cat: "transport", amount: 218 }, { cat: "shopping", amount: 394 }, { cat: "subscriptions", amount: 168 },
    { cat: "utilities", amount: 244 }, { cat: "health", amount: 132 }, { cat: "entertainment", amount: 96 }, { cat: "other", amount: 140 },
  ];
  // month-over-month deltas (%), warm tone only
  const CAT_TRENDS = { dining: 30, shopping: 18, groceries: -8, transport: -12, subscriptions: 4, utilities: 2 };

  // ── Transactions (recent) ───────────────────────────────────
  const TXNS = [
    { id: "t1", date: "Jun 4", merchant: "Whole Foods Market", cat: "groceries", acct: "cc", amount: -84.22, pending: true },
    { id: "t2", date: "Jun 4", merchant: "Blue Bottle Coffee", cat: "dining", acct: "cc", amount: -6.75, pending: true },
    { id: "t3", date: "Jun 3", merchant: "Adobe Creative Cloud", cat: "subscriptions", acct: "cc", amount: -54.99, flag: "hike" },
    { id: "t4", date: "Jun 3", merchant: "Uber", cat: "transport", acct: "cc", amount: -23.40 },
    { id: "t5", date: "Jun 3", merchant: "Stripe payout", cat: "income", acct: "chk", amount: 4200.00 },
    { id: "t6", date: "Jun 2", merchant: "Netflix", cat: "subscriptions", acct: "cc", amount: -22.99, flag: "sub" },
    { id: "t7", date: "Jun 2", merchant: "Shell", cat: "transport", acct: "cc", amount: -52.10 },
    { id: "t8", date: "Jun 2", merchant: "Amazon", cat: "shopping", acct: "cc", amount: -128.44 },
    { id: "t9", date: "Jun 1", merchant: "Rent — Oakwood Mgmt", cat: "housing", acct: "chk", amount: -2100.00 },
    { id: "t10", date: "Jun 1", merchant: "PG&E", cat: "utilities", acct: "chk", amount: -142.00 },
    { id: "t11", date: "Jun 1", merchant: "Spotify", cat: "subscriptions", acct: "cc", amount: -11.99, flag: "sub" },
    { id: "t12", date: "May 31", merchant: "Trader Joe's", cat: "groceries", acct: "cc", amount: -61.30 },
    { id: "t13", date: "May 31", merchant: "Amazon", cat: "shopping", acct: "cc", amount: -128.44, flag: "dup" },
    { id: "t14", date: "May 30", merchant: "SoulCycle", cat: "health", acct: "cc", amount: -38.00 },
    { id: "t15", date: "May 30", merchant: "The Long Game (Substack)", cat: "income", acct: "chk", amount: 312.00 },
    { id: "t16", date: "May 29", merchant: "Chipotle", cat: "dining", acct: "cc", amount: -14.85 },
    { id: "t17", date: "May 29", merchant: "Delta Air Lines", cat: "travel", acct: "cc", amount: -418.20 },
    { id: "t18", date: "May 28", merchant: "Apple iCloud", cat: "subscriptions", acct: "cc", amount: -9.99, flag: "sub" },
    { id: "t19", date: "May 28", merchant: "Whole Foods Market", cat: "groceries", acct: "cc", amount: -52.88 },
    { id: "t20", date: "May 27", merchant: "AMC Theatres", cat: "entertainment", acct: "cc", amount: -33.50 },
  ];

  // ── Bills ───────────────────────────────────────────────────
  const BILLS = [
    { id: "b1", name: "Rent — Oakwood", amount: 2100, due: "Jul 1", days: 4, freq: "Monthly", acct: "chk", status: "upcoming", reminders: ["3d", "day"] },
    { id: "b2", name: "Amex Gold", amount: 1240, due: "Jun 28", days: 1, freq: "Monthly", acct: "chk", status: "due", reminders: ["3d", "1d", "day"] },
    { id: "b3", name: "Auto Loan", amount: 342, due: "Jul 5", days: 8, freq: "Monthly", acct: "chk", status: "upcoming", reminders: ["3d"] },
    { id: "b4", name: "PG&E", amount: 142, due: "Jun 26", days: -1, freq: "Monthly", acct: "chk", status: "overdue", reminders: ["1d", "day"] },
    { id: "b5", name: "Adobe CC", amount: 55, due: "Jul 3", days: 6, freq: "Monthly", acct: "cc", status: "upcoming", reminders: ["day"] },
    { id: "b6", name: "Health insurance", amount: 480, due: "Jul 1", days: 4, freq: "Monthly", acct: "chk", status: "upcoming", reminders: ["3d", "1d"] },
    { id: "b7", name: "Domain + hosting", amount: 216, due: "Aug 14", days: 48, freq: "Annual", acct: "cc", status: "paid", reminders: ["3d"] },
  ];

  // ── Goals ───────────────────────────────────────────────────
  const GOALS = [
    { id: "g1", name: "Emergency fund", target: 30000, saved: 22300, targetDate: "Dec 2026", monthly: 1285, onTrack: true, icon: "ShieldCheck" },
    { id: "g2", name: "Japan trip", target: 6000, saved: 2450, targetDate: "Oct 2026", monthly: 887, onTrack: false, icon: "Plane" },
    { id: "g3", name: "New MacBook", target: 3200, saved: 2600, targetDate: "Jul 2026", monthly: 600, onTrack: true, icon: "Laptop" },
    { id: "g4", name: "Q3 tax reserve", target: 12000, saved: 7400, targetDate: "Sep 2026", monthly: 1533, onTrack: true, icon: "Landmark" },
  ];

  // ── Debts ───────────────────────────────────────────────────
  const DEBTS = [
    { id: "d1", name: "Amex Gold", balance: 1240.18, apr: 24.99, min: 40, acct: "cc" },
    { id: "d2", name: "Auto Loan", balance: 9820.00, apr: 5.9, min: 342, acct: "loan" },
    { id: "d3", name: "Student loan", balance: 14200.00, apr: 4.5, min: 168, acct: "ext" },
  ];

  // ── Budgets / envelopes ─────────────────────────────────────
  const BUDGETS = [
    { id: "bu1", cat: "dining", limit: 500, spent: 642, period: "Monthly", alert: 90 },
    { id: "bu2", cat: "groceries", limit: 600, spent: 486, period: "Monthly", alert: 85 },
    { id: "bu3", cat: "shopping", limit: 400, spent: 394, period: "Monthly", alert: 80 },
    { id: "bu4", cat: "entertainment", limit: 150, spent: 96, period: "Monthly", alert: 90 },
    { id: "bu5", cat: "transport", limit: 300, spent: 218, period: "Monthly", alert: 85 },
  ];

  // ── Subscriptions ───────────────────────────────────────────
  const SUBS = [
    { name: "Adobe Creative Cloud", amount: 54.99, freq: "Monthly", last: "Jun 3", flag: "hike" },
    { name: "Netflix", amount: 22.99, freq: "Monthly", last: "Jun 2", flag: null },
    { name: "Spotify", amount: 11.99, freq: "Monthly", last: "Jun 1", flag: null },
    { name: "Apple iCloud+", amount: 9.99, freq: "Monthly", last: "May 28", flag: null },
    { name: "Notion", amount: 10.00, freq: "Monthly", last: "May 24", flag: "unused" },
    { name: "Substack Pro", amount: 12.00, freq: "Monthly", last: "May 22", flag: null },
    { name: "Figma", amount: 15.00, freq: "Monthly", last: "May 20", flag: "unused" },
    { name: "NYT", amount: 17.00, freq: "Monthly", last: "May 18", flag: null },
  ];

  // ── Top merchants (30d) ─────────────────────────────────────
  const TOP_MERCHANTS = [
    { name: "Oakwood Mgmt", amount: 2100, count: 1 },
    { name: "Amazon", amount: 512, count: 6 },
    { name: "Delta Air Lines", amount: 418, count: 1 },
    { name: "Whole Foods", amount: 284, count: 5 },
    { name: "Uber", amount: 164, count: 9 },
    { name: "Blue Bottle", amount: 88, count: 12 },
  ];

  // ── Period money in/out/net ─────────────────────────────────
  const PERIOD = {
    week:  { in: 4512, out: 2894, net: 1618 },
    month: { in: 12840, out: 8760, net: 4080 },
  };

  // ── Monthly in/out history (6mo) for reports/trend ──────────
  const MONTHLY = [
    { m: "Jan", in: 11200, out: 8900 }, { m: "Feb", in: 12100, out: 9400 },
    { m: "Mar", in: 10800, out: 8100 }, { m: "Apr", in: 13400, out: 9200 },
    { m: "May", in: 12600, out: 8760 }, { m: "Jun", in: 12840, out: 8760 },
  ];

  // ── Net worth trend (6mo) ───────────────────────────────────
  const NETWORTH_SERIES = [52100, 54300, 55800, 58200, 59900, 61540];

  // ── Cash-flow forecast: 90 days of projected balance ────────
  // built from a starting balance with scheduled events.
  const FORECAST_EVENTS = [
    { day: 1, label: "Health insurance", amount: -480 },
    { day: 1, label: "Rent", amount: -2100 },
    { day: 3, label: "Adobe CC", amount: -55 },
    { day: 4, label: "Amex payment", amount: -1240 },
    { day: 5, label: "Auto loan", amount: -342 },
    { day: 12, label: "Stripe payout", amount: 4200 },
    { day: 15, label: "Substack payout", amount: 640 },
    { day: 26, label: "Groceries + gas (est.)", amount: -520 },
    { day: 31, label: "Rent", amount: -2100 },
    { day: 33, label: "Amex payment", amount: -980 },
    { day: 42, label: "Stripe payout", amount: 4200 },
    { day: 61, label: "Rent", amount: -2100 },
    { day: 72, label: "Stripe payout", amount: 4200 },
  ];
  function buildForecast(days) {
    let bal = 8420.55; const pts = [{ day: 0, bal }];
    const daily = -78; // avg discretionary drift/day
    for (let d = 1; d <= days; d++) {
      bal += daily;
      FORECAST_EVENTS.filter((e) => e.day === d).forEach((e) => { bal += e.amount; });
      pts.push({ day: d, bal: Math.round(bal) });
    }
    let low = pts[0];
    pts.forEach((p) => { if (p.bal < low.bal) low = p; });
    return { pts, low };
  }

  // ── Insights (proactive) ────────────────────────────────────
  const INSIGHTS = [
    { icon: "TrendingUp", tone: "watch", text: "Dining is up <b>30%</b> this month — $642 vs your $494 average.", cat: "dining" },
    { icon: "TriangleAlert", tone: "alert", text: "You'll dip below <b>$1,200</b> around <b>Jul 5</b> before your next payout.", cat: null },
    { icon: "Repeat", tone: "watch", text: "<b>Figma</b> and <b>Notion</b> ($25/mo) look unused for 40+ days.", cat: "subscriptions" },
    { icon: "Copy", tone: "alert", text: "Possible duplicate: <b>Amazon $128.44</b> charged twice on May 31.", cat: "shopping" },
    { icon: "ArrowUpRight", tone: "watch", text: "<b>Adobe</b> rose from $52.99 to $54.99 this cycle.", cat: "subscriptions" },
  ];

  // ── Tax set-aside ───────────────────────────────────────────
  const TAX = {
    reservePct: 28, incomeYTD: 68400, setAside: 7400, estLiability: 19152, perDeposit: 28,
  };

  const BUDGET_SUMMARY = { monthCeiling: null };

  window.TR = {
    CATS, ACCOUNTS, SPEND_BY_CAT, CAT_TRENDS, TXNS, BILLS, GOALS, DEBTS, BUDGETS,
    SUBS, TOP_MERCHANTS, PERIOD, MONTHLY, NETWORTH_SERIES, FORECAST_EVENTS, INSIGHTS, TAX,
    buildForecast,
    // derived
    totalBalance: ACCOUNTS.reduce((s, a) => s + a.balance, 0),
    assets: ACCOUNTS.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0),
    liabilities: -ACCOUNTS.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0),
    spendable: ACCOUNTS.filter((a) => a.type === "checking" || a.type === "savings").reduce((s, a) => s + a.balance, 0),
    monthlyExpenses: 8760,
    cat: (id) => CATS[id] || CATS.other,
    acct: (id) => ACCOUNTS.find((a) => a.id === id) || { name: id, inst: "" },
  };
})();
