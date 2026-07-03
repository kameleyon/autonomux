/* ============================================================
   AlterEgo — Account screens: Settings · Usage · Billing
   (React/Babel → window). Uses ScreenHead + account.css.
   ============================================================ */
const { useState: acUseState } = React;
const AcIcon = window.Icon;

/* ── shared bits ─────────────────────────────────────────────── */
function Switch({ on, onChange }) {
  return <button className={"ae-switch" + (on ? " ae-switch--on" : "")} role="switch" aria-checked={on} onClick={() => onChange(!on)} />;
}
function Seg({ value, options, onChange }) {
  return (
    <span className="ae-seg">
      {options.map((o) => <button key={o} className={"ae-seg__b" + (value === o ? " ae-seg__b--on" : "")} onClick={() => onChange(o)}>{o}</button>)}
    </span>
  );
}
function Card({ title, icon, action, children, danger, sub }) {
  return (
    <div className={"ae-card" + (danger ? " ae-danger" : "")}>
      <div className="ae-card__head">
        <div>
          <span className="ae-card__title"><AcIcon name={icon} size={16} />{title}</span>
          {sub ? <div className="ae-card__sub">{sub}</div> : null}
        </div>
        {action || null}
      </div>
      <div className="ae-card__body">{children}</div>
    </div>
  );
}
function Stat({ label, icon, value, unit, sub, accent }) {
  return (
    <div className={"ae-stat" + (accent ? " ae-stat--accent" : "")}>
      <span className="ae-stat__label"><AcIcon name={icon} size={12} />{label}</span>
      <span className="ae-stat__val">{value}{unit ? <span>{unit}</span> : null}</span>
      {sub ? <span className="ae-stat__sub" dangerouslySetInnerHTML={{ __html: sub }} /> : null}
    </div>
  );
}

/* ── SETTINGS ────────────────────────────────────────────────── */
const AC_INTEGRATIONS = [
  { id: "gmail", name: "Gmail", icon: "Mail", state: "connected", meta: "lightspiritux@gmail.com · read, draft, send" },
  { id: "gcal", name: "Google Calendar", icon: "CalendarClock", state: "connected", meta: "Primary calendar · read, write events" },
  { id: "plaid", name: "Plaid", icon: "Landmark", state: "expiring", meta: "Chase · balances, transactions · token expires in 6 days" },
  { id: "substack", name: "Substack", icon: "PenLine", state: "connected", meta: "The Long Game · publish via email" },
  { id: "x", name: "X", icon: "MessageSquare", state: "connected", meta: "@lightspiritux · post threads" },
  { id: "linkedin", name: "LinkedIn", icon: "Linkedin", state: "off", meta: "Not connected" },
  { id: "outlook", name: "Outlook", icon: "Mail", state: "off", meta: "Not connected" },
];

function SettingsView() {
  const [voice, setVoice] = acUseState("warm");
  const [briefTime, setBriefTime] = acUseState("6:00 AM");
  const [conns, setConns] = acUseState(AC_INTEGRATIONS.map((c) => ({ ...c })));
  const [toggles, setToggles] = acUseState({
    briefEmail: true, briefApp: true, push: true, weekly: false,
    trustArchive: true, trustDrafts: true, trustSend: false, trustPay: false,
    quietHours: true, twofa: true,
  });
  const t = (k) => setToggles((p) => ({ ...p, [k]: !p[k] }));
  const stLabel = { connected: "Connected", expiring: "Expiring", off: "Connect" };
  const dotCls = (s) => s === "connected" ? "ae-dot-s--ok" : s === "expiring" ? "ae-dot-s--warn" : "ae-dot-s--off";
  const reconnect = (id) => setConns((p) => p.map((c) => c.id === id ? { ...c, state: "connected", meta: c.name === "LinkedIn" || c.name === "Outlook" ? "Connected just now" : c.meta.replace(/· token.*$/, "· refreshed just now") } : c));

  return (
    <div className="ae-screen">
      <ScreenHead kicker="Settings" title="How I <em>run</em>, and what I can touch."
        lede="Tune my voice, decide what I can do on my own, and manage the accounts I act through." />

      <div className="ae-acct-split">
        <div>
          <Card title="Account" icon="User">
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Email</div><div className="ae-set-row__desc">Your sign-in and briefing address.</div></div><div className="ae-set-row__control"><span className="ae-set-value">lightspiritux@gmail.com</span></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Password</div><div className="ae-set-row__desc">Last changed 3 weeks ago.</div></div><div className="ae-set-row__control"><button className="ae-lbtn">Change</button></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Two-factor (TOTP)</div><div className="ae-set-row__desc">Required for banking changes and account deletion.</div></div><div className="ae-set-row__control"><Switch on={toggles.twofa} onChange={() => t("twofa")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Active sessions</div><div className="ae-set-row__desc">3 devices · last active 2 min ago.</div></div><div className="ae-set-row__control"><button className="ae-lbtn">Revoke all</button></div></div>
          </Card>

          <Card title="AlterEgo's voice" icon="Sparkles">
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Tone</div><div className="ae-set-row__desc">How I sound when I speak as you.</div></div><div className="ae-set-row__control"><Seg value={voice} options={["warm", "sharp", "mystical"]} onChange={setVoice} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Morning briefing</div><div className="ae-set-row__desc">When I deliver your daily read.</div></div><div className="ae-set-row__control"><Seg value={briefTime} options={["6:00 AM", "7:00 AM", "8:00 AM"]} onChange={setBriefTime} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Quiet hours</div><div className="ae-set-row__desc">Hold non-urgent nudges 10 PM – 7 AM.</div></div><div className="ae-set-row__control"><Switch on={toggles.quietHours} onChange={() => t("quietHours")} /></div></div>
          </Card>

          <Card title="Notifications" icon="Bell">
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Briefing in-app</div></div><div className="ae-set-row__control"><Switch on={toggles.briefApp} onChange={() => t("briefApp")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Briefing by email</div></div><div className="ae-set-row__control"><Switch on={toggles.briefEmail} onChange={() => t("briefEmail")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Push (approvals & alerts)</div></div><div className="ae-set-row__control"><Switch on={toggles.push} onChange={() => t("push")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Weekly digest</div></div><div className="ae-set-row__control"><Switch on={toggles.weekly} onChange={() => t("weekly")} /></div></div>
          </Card>
        </div>

        <div>
          <Card title="Connected accounts" icon="Plug" sub="The apps I act through on your behalf.">
            {conns.map((c) => (
              <div className="ae-conn" key={c.id}>
                <span className="ae-conn__ico"><AcIcon name={c.icon} size={18} /></span>
                <div className="ae-conn__main">
                  <div className="ae-conn__name">{c.name}</div>
                  <div className="ae-conn__meta">{c.meta}</div>
                </div>
                {c.state === "off"
                  ? <button className="ae-lbtn ae-lbtn--primary" onClick={() => reconnect(c.id)}>Connect</button>
                  : c.state === "expiring"
                    ? <button className="ae-lbtn" onClick={() => reconnect(c.id)}>Reconnect</button>
                    : <span className={"ae-conn__state ae-conn__state--connected"}><span className={"ae-dot-s " + dotCls(c.state)} />Connected</span>}
              </div>
            ))}
          </Card>

          <Card title="Trusted actions" icon="ShieldCheck" sub="What I can do without stopping to ask.">
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Auto-archive newsletters</div><div className="ae-set-row__desc">Reversible — you can undo any archive.</div></div><div className="ae-set-row__control"><Switch on={toggles.trustArchive} onChange={() => t("trustArchive")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Prepare reply drafts</div><div className="ae-set-row__desc">Drafted, never sent without you.</div></div><div className="ae-set-row__control"><Switch on={toggles.trustDrafts} onChange={() => t("trustDrafts")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Send routine replies</div><div className="ae-set-row__desc">Irreversible — sending email on your behalf.</div></div><div className="ae-set-row__control"><Switch on={toggles.trustSend} onChange={() => t("trustSend")} /></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Pay recurring bills</div><div className="ae-set-row__desc">Irreversible — always requires 2FA even when on.</div></div><div className="ae-set-row__control"><Switch on={toggles.trustPay} onChange={() => t("trustPay")} /></div></div>
          </Card>

          <Card title="Memory" icon="Brain" sub="What I remember about you — yours to see and erase.">
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Structured facts</div><div className="ae-set-row__desc">128 facts · people, preferences, obligations.</div></div><div className="ae-set-row__control"><button className="ae-lbtn">Review</button></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Episodic memory</div><div className="ae-set-row__desc">90-day rolling summaries of our work.</div></div><div className="ae-set-row__control"><button className="ae-lbtn">Export</button></div></div>
          </Card>

          <Card title="Danger zone" icon="TriangleAlert" danger>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Export all data</div><div className="ae-set-row__desc">Full GDPR export — facts, activity, audit log.</div></div><div className="ae-set-row__control"><button className="ae-lbtn">Request export</button></div></div>
            <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Delete account</div><div className="ae-set-row__desc">Hard-deletes everything. Requires 2FA. Cannot be undone.</div></div><div className="ae-set-row__control"><button className="ae-lbtn ae-lbtn--danger">Delete</button></div></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── USAGE ───────────────────────────────────────────────────── */
const AC_TOKEN_CEILING = 20; // 20M on Founder
const AC_TOKEN_USED = 14.2;
const AC_BY_AGENT = [
  { name: "Mailroom", icon: "Mail", tokens: 6.1, runs: 742 },
  { name: "Scheduler", icon: "CalendarClock", tokens: 3.2, runs: 486 },
  { name: "Oracle", icon: "Sparkles", tokens: 2.1, runs: 214 },
  { name: "Scribe", icon: "PenLine", tokens: 1.6, runs: 92 },
  { name: "Treasurer", icon: "Landmark", tokens: 0.8, runs: 168 },
  { name: "Companion", icon: "Heart", tokens: 0.4, runs: 118 },
];
const AC_BY_MODEL = [
  { name: "Haiku 4.5", tokens: 9.4, share: 66, copper: true },
  { name: "Sonnet 4.6", tokens: 4.6, share: 32 },
  { name: "Opus", tokens: 0.2, share: 2, copper: true },
];

function UsageView() {
  const pct = Math.round((AC_TOKEN_USED / AC_TOKEN_CEILING) * 100);
  const maxAgent = Math.max(...AC_BY_AGENT.map((a) => a.tokens));
  const totalRuns = AC_BY_AGENT.reduce((s, a) => s + a.runs, 0);
  return (
    <div className="ae-screen">
      <ScreenHead kicker="Usage" title="What it took to <em>be you</em> this month."
        lede="Your token budget, run counts, and where the work went — this billing cycle."
        actions={<button className="ae-screen-btn"><AcIcon name="Download" size={15} />Export CSV</button>} />

      <div className="ae-stat-grid">
        <Stat label="Tokens used" icon="Cpu" value={AC_TOKEN_USED + "M"} sub={"of " + AC_TOKEN_CEILING + "M · <b>" + pct + "%</b>"} accent />
        <Stat label="Sub-agent runs" icon="Activity" value="1,820" sub="this cycle" />
        <Stat label="Spend" icon="Coins" value="$38.40" sub="est. against plan" />
        <Stat label="Errors · 7d" icon="TriangleAlert" value="3" sub="0.2% of runs" />
      </div>

      <Card title="Token budget" icon="Gauge" sub={"Resets in 12 days · Founder plan, " + AC_TOKEN_CEILING + "M / month"}>
        <div style={{ padding: "8px 0 4px" }}>
          <div className="ae-meter" style={{ height: 12 }}><div className="ae-meter__fill" style={{ width: pct + "%" }} /></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: "DM Mono, monospace", fontSize: 12, color: "var(--muted)" }}>
            <span>{AC_TOKEN_USED}M used</span>
            <span>{(AC_TOKEN_CEILING - AC_TOKEN_USED).toFixed(1)}M remaining</span>
          </div>
        </div>
      </Card>

      <div className="ae-acct-split">
        <Card title="By sub-agent" icon="Workflow" sub={totalRuns.toLocaleString() + " runs this cycle"}>
          {AC_BY_AGENT.map((a) => (
            <div className="ae-brk" key={a.name}>
              <span className="ae-brk__name"><span className="ae-brk__ico"><AcIcon name={a.icon} size={14} /></span>{a.name}</span>
              <span className="ae-brk__track"><span className="ae-meter"><span className="ae-meter__fill" style={{ display: "block", width: (a.tokens / maxAgent * 100) + "%" }} /></span></span>
              <span className="ae-brk__val">{a.tokens}M · {a.runs}</span>
            </div>
          ))}
        </Card>

        <Card title="By model" icon="Cpu" sub="Routine triage runs on Haiku to keep cost low">
          {AC_BY_MODEL.map((m) => (
            <div className="ae-brk" key={m.name}>
              <span className="ae-brk__name">{m.name}</span>
              <span className="ae-brk__track"><span className="ae-meter"><span className={"ae-meter__fill" + (m.copper ? " ae-meter__fill--copper" : "")} style={{ display: "block", width: m.share + "%" }} /></span></span>
              <span className="ae-brk__val">{m.tokens}M · {m.share}%</span>
            </div>
          ))}
          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: "var(--surface-warm)", fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>
            <b style={{ color: "var(--brand-red-deep)" }}>Tip:</b> You're well under budget. At this pace you'll use ~19M of 20M — no overage expected.
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── BILLING ─────────────────────────────────────────────────── */
const AC_PLANS = [
  { id: "free", name: "Free", price: 0, budget: "100k tokens", feats: ["Read-only Gmail & Calendar", "Daily Oracle", "Morning briefing"] },
  { id: "personal", name: "Personal", price: 29, budget: "1M tokens", feats: ["Gmail write & drafts", "Scribe drafting", "Companion wellness"] },
  { id: "pro", name: "Pro", price: 79, budget: "5M tokens", feats: ["Scribe publishing", "Treasurer + Plaid", "Outlook · X · LinkedIn"] },
  { id: "founder", name: "Founder", price: 199, budget: "20M tokens", feats: ["Multi-account", "Priority queue", "Monthly 1:1 with the team"] },
];
const AC_INVOICES = [
  { date: "Jun 1, 2026", desc: "Founder · monthly", amt: "$199.00" },
  { date: "May 1, 2026", desc: "Founder · monthly", amt: "$199.00" },
  { date: "Apr 1, 2026", desc: "Founder · monthly", amt: "$199.00" },
  { date: "Mar 1, 2026", desc: "Pro → Founder upgrade", amt: "$199.00" },
];

function BillingView() {
  const [period, setPeriod] = acUseState("monthly");
  const annual = period === "annual";
  const price = (p) => p === 0 ? "$0" : annual ? "$" + Math.round(p * 12 * 0.8) : "$" + p;
  const unit = (p) => p === 0 ? "" : annual ? "/yr" : "/mo";
  return (
    <div className="ae-screen">
      <ScreenHead kicker="Billing" title="Your plan, and what it <em>costs</em>."
        lede="You're on Founder. Manage your plan, payment method, and invoices here."
        actions={<button className="ae-screen-btn"><AcIcon name="ExternalLink" size={15} />Billing portal</button>} />

      <div className="ae-acct-split">
        <Card title="Current plan" icon="Star" sub="Renews Jul 1, 2026">
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "6px 0 10px" }}>
            <span style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 40, lineHeight: 1, color: "var(--ink)" }}>Founder</span>
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 14, color: "var(--brand-red-deep)" }}>$199 / mo</span>
          </div>
          <div className="ae-set-row" style={{ borderTop: "1px solid var(--border)" }}><div className="ae-set-row__main"><div className="ae-set-row__label">Token budget</div></div><div className="ae-set-row__control"><span className="ae-set-value">20M / month</span></div></div>
          <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Next invoice</div></div><div className="ae-set-row__control"><span className="ae-set-value">$199.00 · Jul 1</span></div></div>
          <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Billing period</div></div><div className="ae-set-row__control"><div className="ae-period"><Seg value={period} options={["monthly", "annual"]} onChange={setPeriod} />{annual ? <span className="ae-save-chip">Save 20%</span> : null}</div></div></div>
        </Card>

        <Card title="Payment method" icon="CreditCard">
          <div className="ae-pay" style={{ padding: "10px 0 14px" }}>
            <span className="ae-pay__card"><AcIcon name="CreditCard" size={16} /></span>
            <div style={{ flex: 1 }}>
              <div className="ae-pay__num">Visa ···· 4242</div>
              <div className="ae-pay__exp">Expires 09 / 28</div>
            </div>
            <button className="ae-lbtn">Update</button>
          </div>
          <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Billing email</div></div><div className="ae-set-row__control"><span className="ae-set-value">lightspiritux@gmail.com</span></div></div>
          <div className="ae-set-row"><div className="ae-set-row__main"><div className="ae-set-row__label">Tax / VAT ID</div><div className="ae-set-row__desc">Add for invoices.</div></div><div className="ae-set-row__control"><button className="ae-lbtn">Add</button></div></div>
        </Card>
      </div>

      <div className="ae-card__head" style={{ background: "none", border: "none", padding: "var(--sp-16) 2px var(--sp-12)" }}>
        <span className="ae-block-label" style={{ margin: 0 }}><AcIcon name="LayoutGrid" size={14} />Change plan</span>
      </div>
      <div className="ae-plan-grid">
        {AC_PLANS.map((p) => {
          const current = p.id === "founder";
          return (
            <div className={"ae-plan" + (current ? " ae-plan--current" : "")} key={p.id}>
              {current ? <span className="ae-plan__badge">Current</span> : null}
              <div className="ae-plan__name">{p.name}</div>
              <div className="ae-plan__price">{price(p.price)}<span>{unit(p.price)}</span></div>
              <div className="ae-plan__budget">{p.budget}</div>
              <ul className="ae-plan__feats">{p.feats.map((f, i) => <li key={i}><AcIcon name="Check" size={14} />{f}</li>)}</ul>
              {current
                ? <button className="ae-lbtn" disabled style={{ opacity: 0.6, cursor: "default" }}>Your plan</button>
                : <button className={"ae-lbtn" + (p.price > 199 ? " ae-lbtn--primary" : "")}>{p.price > 199 ? "Upgrade" : p.price === 0 ? "Downgrade" : "Switch"}</button>}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "var(--sp-24)" }}>
        <Card title="Invoice history" icon="ReceiptText">
          {AC_INVOICES.map((iv, i) => (
            <div className="ae-inv" key={i}>
              <span className="ae-inv__date">{iv.date}</span>
              <span className="ae-inv__desc">{iv.desc} <span className="ae-inv-paid"><AcIcon name="Check" size={11} />Paid</span></span>
              <span className="ae-inv__amt">{iv.amt}</span>
              <button className="ae-lbtn ae-inv__link"><AcIcon name="Download" size={13} />PDF</button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsView, UsageView, BillingView });
