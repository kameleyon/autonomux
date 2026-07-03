/* ============================================================
   Treasurer — components, charts, formatters (React/Babel → window)
   Self-contained icon helper (no dependency on the chat stack).
   ============================================================ */
const { useState: trUS, useMemo: trUM } = React;

const TR_LU = (window.lucide && window.lucide.icons) || {};
function trKebab(k) { return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function TRIcon({ name, size = 18, stroke = 1.75, className, style }) {
  const node = TR_LU[name] || TR_LU["Circle"];
  if (!node) return null;
  const kids = node[2] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {kids.map((c, i) => { const p = { key: i }; const a = c[1] || {}; for (const k in a) p[trKebab(k)] = a[k]; return React.createElement(c[0], p); })}
    </svg>
  );
}

/* money formatting */
function money(n, opts) {
  opts = opts || {};
  const neg = n < 0; const abs = Math.abs(n);
  const s = "$" + abs.toLocaleString(undefined, { minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 });
  return (neg ? "−" : opts.plus ? "+" : "") + s;
}
function money0(n) { return money(n, {}); }

/* ── primitives ──────────────────────────────────────────────── */
function Card({ title, icon, action, children, sub, pad }) {
  return (
    <div className="ae-card">
      {title ? (
        <div className="ae-card__head">
          <div><span className="ae-card__title"><TRIcon name={icon} size={16} />{title}</span>{sub ? <div className="ae-card__sub">{sub}</div> : null}</div>
          {action || null}
        </div>
      ) : null}
      <div className="ae-card__body" style={pad === false ? { padding: "var(--sp-4) var(--sp-20) var(--sp-16)" } : null}>{children}</div>
    </div>
  );
}
function Switch({ on, onChange }) {
  return <button className={"ae-switch" + (on ? " ae-switch--on" : "")} role="switch" aria-checked={on} onClick={() => onChange(!on)} />;
}
function Seg({ value, options, onChange }) {
  return <span className="ae-seg">{options.map((o) => <button key={o.value || o} className={"ae-seg__b" + ((o.value || o) === value ? " ae-seg__b--on" : "")} onClick={() => onChange(o.value || o)}>{o.label || o}</button>)}</span>;
}
function Progress({ pct, over }) {
  return <div className="ae-meter"><span className={"ae-meter__fill" + (over ? "" : "")} style={{ width: Math.min(100, pct) + "%", background: over ? "linear-gradient(90deg,#e63312,#b81f00)" : undefined }} /></div>;
}
function CatIco({ cat, size = 34 }) {
  const c = window.TR.cat(cat);
  return <span className="tr-txn__ico" style={{ background: c.color, width: size, height: size }}><TRIcon name={c.icon} size={Math.round(size * 0.5)} /></span>;
}

/* ── Donut (conic-gradient) ──────────────────────────────────── */
function Donut({ data, total, center, centerSub }) {
  let acc = 0; const stops = [];
  data.forEach((s) => { const a = (acc / total) * 360; acc += s.value; const b = (acc / total) * 360; stops.push(`${s.color} ${a}deg ${b}deg`); });
  return (
    <div className="tr-donut-wrap">
      <div className="tr-donut" style={{ background: `conic-gradient(${stops.join(",")})` }}>
        <div className="tr-donut__hole"><span className="tr-donut__big">{center}</span><span className="tr-donut__small">{centerSub}</span></div>
      </div>
      <div className="tr-legend">
        {data.map((s) => (
          <div className="tr-leg" key={s.label}>
            <span className="tr-leg__sw" style={{ background: s.color }} />
            <span className="tr-leg__name">{s.label}</span>
            <span className="tr-leg__val">{money0(s.value)}</span>
            <span className="tr-leg__pct">{Math.round(s.value / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── In/Out monthly bars ─────────────────────────────────────── */
function InOutBars({ data }) {
  const max = Math.max(...data.map((d) => Math.max(d.in, d.out))) || 1;
  return (
    <div>
      <div className="tr-bars">
        {data.map((d) => (
          <div className="tr-barcol" key={d.m}>
            <div className="tr-barpair">
              <div className="tr-bar tr-bar--in" style={{ height: (d.in / max * 100) + "%" }} title={"In " + money0(d.in)} />
              <div className="tr-bar tr-bar--out" style={{ height: (d.out / max * 100) + "%" }} title={"Out " + money0(d.out)} />
            </div>
            <span className="tr-barcol__x">{d.m}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#c2701a" }} />Money in</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#f26b1a" }} />Money out</span>
      </div>
    </div>
  );
}

/* ── Line chart with optional low-point annotation ───────────── */
function LineChart({ pts, h = 190, low, fmtY, valueKey = "bal", labelForDay }) {
  const w = 620;
  const vals = pts.map((p) => p[valueKey]);
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = (max - min) || 1;
  const stepX = w / (pts.length - 1);
  const yOf = (v) => 14 + (1 - (v - min) / span) * (h - 42);
  const xy = pts.map((p, i) => [i * stepX, yOf(p[valueKey])]);
  const line = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L ${w} ${h - 20} L 0 ${h - 20} Z`;
  const zeroY = min < 0 ? yOf(0) : null;
  let lowXY = null; if (low) { const idx = pts.findIndex((p) => p.day === low.day); if (idx >= 0) lowXY = xy[idx]; }
  return (
    <div className="tr-line-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="tr-line" style={{ height: h }} preserveAspectRatio="none">
        <defs><linearGradient id="trFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f26b1a" stopOpacity="0.28" /><stop offset="100%" stopColor="#f26b1a" stopOpacity="0.02" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" y1={14 + (h - 42) * g} x2={w} y2={14 + (h - 42) * g} stroke="#f0e8dc" strokeWidth="1" />)}
        {zeroY != null ? <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="#e4b8a8" strokeWidth="1" strokeDasharray="4 4" /> : null}
        <path d={area} fill="url(#trFill)" />
        <path d={line} fill="none" stroke="#e63312" strokeWidth="2" />
        {lowXY ? <circle cx={lowXY[0]} cy={lowXY[1]} r="4" fill="#b81f00" stroke="#fff" strokeWidth="1.5" /> : null}
      </svg>
      {lowXY ? <span className="tr-annot" style={{ left: (lowXY[0] / w * 100) + "%", top: lowXY[1] }}>{labelForDay ? labelForDay(low) : (fmtY ? fmtY(low.bal) : low.bal)}</span> : null}
    </div>
  );
}

/* ── Sparkline ───────────────────────────────────────────────── */
function Spark({ values, w = 200, h = 44, stroke = "#f26b1a" }) {
  const max = Math.max(...values), min = Math.min(...values), span = (max - min) || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 4 - ((v - min) / span) * (h - 8)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: h, display: "block" }} preserveAspectRatio="none">
      <path d={line + ` L ${w} ${h} L 0 ${h} Z`} fill={stroke} opacity="0.12" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.8" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={stroke} />
    </svg>
  );
}

Object.assign(window, { TRIcon, money, money0, Card, Switch, Seg, Progress, CatIco, Donut, InOutBars, LineChart, Spark });
