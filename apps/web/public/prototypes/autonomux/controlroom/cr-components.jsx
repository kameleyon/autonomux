/* ============================================================
   ControlRoom — UI primitives, charts, and cards (React/Babel)
   Self-contained: defines its own lucide Icon helper so it does
   not depend on the chat component stack.
   ============================================================ */
const { useState: crUseState, useEffect: crUseEffect, useRef: crUseRef } = React;

/* ── Lucide icon helper ──────────────────────────────────────── */
const CR_LU = (window.lucide && window.lucide.icons) || {};
function crKebab(k) { return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function CRIcon({ name, size = 18, stroke = 1.75, className, style }) {
  const node = CR_LU[name];
  if (!node) return null;
  const kids = node[2] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {kids.map((c, i) => {
        const p = { key: i }; const a = c[1] || {};
        for (const k in a) p[crKebab(k)] = a[k];
        return React.createElement(c[0], p);
      })}
    </svg>
  );
}

/* ── formatters ──────────────────────────────────────────────── */
function crMoney(cents) {
  const d = (cents || 0) / 100;
  return "$" + d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function crDur(sec) {
  if (sec < 60) return sec + "s";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + "m " + (s < 10 ? "0" : "") + s + "s";
}

/* ── status / class chips ────────────────────────────────────── */
const CR_ST_LABEL = { running: "Running", queued: "Queued", awaiting_approval: "Awaiting", completed: "Done", failed: "Failed", cancelled: "Cancelled" };
const CR_ST_CLS = { running: "running", queued: "queued", awaiting_approval: "awaiting", completed: "completed", failed: "failed", cancelled: "cancelled" };
function StatusChip({ status }) {
  const cls = CR_ST_CLS[status] || "completed";
  return <span className={"cr-st cr-st--" + cls}><span className="cr-st__d" />{CR_ST_LABEL[status] || status}</span>;
}
function ClassChip({ aclass }) {
  const meta = (window.CR.ACLASS[aclass]) || { label: aclass, tone: "muted" };
  return <span className={"cr-class cr-class--" + meta.tone}>{meta.label}</span>;
}

/* ── Sparkline (SVG line) ────────────────────────────────────── */
function Sparkline({ values, w = 120, h = 28, stroke = "#f26b1a", fill = true }) {
  if (!values || !values.length) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - ((v - min) / span) * (h - 6)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg className="cr-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
      {fill ? <path d={area} fill={stroke} opacity="0.12" /> : null}
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={stroke} />
    </svg>
  );
}

/* ── Cost area chart (with axis + hover) ─────────────────────── */
function AreaChart({ data, h = 150 }) {
  const w = 520;
  const max = Math.max(...data.map((d) => d.c)) * 1.15 || 1;
  const step = w / (data.length - 1);
  const pts = data.map((d, i) => [i * step, h - 18 - (d.c / max) * (h - 28)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L ${w} ${h - 18} L 0 ${h - 18} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="cr-area" style={{ height: h }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="crAreaG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f26b1a" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#f26b1a" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" y1={(h - 18) * g + 4} x2={w} y2={(h - 18) * g + 4} stroke="#f0e8dc" strokeWidth="1" />)}
        <path d={area} fill="url(#crAreaG)" />
        <path d={line} fill="none" stroke="#e63312" strokeWidth="2" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2" fill="#e63312" />)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {data.filter((_, i) => i % 2 === 0).map((d, i) => <span key={i} style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#9a8f82" }}>{d.d}</span>)}
      </div>
    </div>
  );
}

/* ── Daily bars ──────────────────────────────────────────────── */
function Bars({ data }) {
  const max = Math.max(...data.map((d) => d.c)) || 1;
  return (
    <div>
      <div className="cr-bars">
        {data.map((d, i) => (
          <div key={i} className="cr-bar" style={{ height: ((d.c / max) * 100) + "%" }} title={d.d + " · " + crMoney(d.c)} />
        ))}
      </div>
      <div className="cr-bars__x">
        {data.map((d, i) => <span key={i}>{i % 2 === 0 ? d.d.replace(/^[A-Za-z]+ /, "") : ""}</span>)}
      </div>
    </div>
  );
}

/* ── Donut (conic) ───────────────────────────────────────────── */
function Donut({ segments, total, centerLabel, centerSub }) {
  let acc = 0; const stops = [];
  segments.forEach((s) => {
    const start = (acc / total) * 360; acc += s.cents;
    const end = (acc / total) * 360;
    stops.push(`${s.color} ${start}deg ${end}deg`);
  });
  return (
    <div className="cr-donut">
      <div className="cr-donut__ring" style={{ background: `conic-gradient(${stops.join(",")})` }}>
        <div className="cr-donut__hole">
          <span className="cr-donut__big">{centerLabel}</span>
          <span className="cr-donut__small">{centerSub}</span>
        </div>
      </div>
      <div className="cr-legend" style={{ flex: 1 }}>
        {segments.map((s) => (
          <div className="cr-leg" key={s.id}>
            <span className="cr-leg__sw" style={{ background: s.color }} />
            <span className="cr-leg__name">{s.name}</span>
            <span className="cr-leg__val">{crMoney(s.cents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── KPI tile ────────────────────────────────────────────────── */
function KPITile({ icon, label, value, unit, sub, pct, accent }) {
  return (
    <div className={"cr-kpi" + (accent ? " cr-kpi--accent" : "")}>
      <div className="cr-kpi__label"><CRIcon name={icon} size={13} />{label}</div>
      <div className="cr-kpi__val">{value}{unit ? <span className="cr-kpi__unit">{unit}</span> : null}</div>
      {sub ? <div className="cr-kpi__sub" dangerouslySetInnerHTML={{ __html: sub }} /> : null}
      {pct != null ? <div className="cr-kpi__bar"><span style={{ width: Math.min(100, pct) + "%" }} /></div> : null}
    </div>
  );
}

/* ── Live run row ────────────────────────────────────────────── */
function RunRow({ run, onOpen, onPin, onCancel, fresh }) {
  const isLive = run.status === "running" || run.status === "queued" || run.status === "awaiting_approval";
  const curName = run.steps[run.currentStep] ? run.steps[run.currentStep].name.split(".").pop() : "";
  const mod = run.status === "running" ? " cr-run--running" : run.status === "awaiting_approval" ? " cr-run--awaiting" : run.status === "failed" ? " cr-run--failed" : "";
  return (
    <button className={"cr-run" + mod + (fresh ? " cr-run--enter" : "")} onClick={() => onOpen(run)}>
      <div className="cr-run__top">
        <span className="cr-run__ico"><CRIcon name={run.icon} size={17} /></span>
        <span className="cr-run__name">{run.jobName}{run.pinned ? <CRIcon name="Pin" size={12} style={{ marginLeft: 6, color: "#f26b1a", display: "inline" }} /> : null}</span>
        <StatusChip status={run.status} />
        <span className="cr-run__metrics">
          <span className="cr-metric"><CRIcon name="Clock" size={12} />{crDur(run.durationSec)}</span>
          <span className="cr-metric cr-metric--cost"><CRIcon name="Coins" size={12} />{crMoney(run.costCents)}</span>
        </span>
        <span className="cr-run__actions" onClick={(e) => e.stopPropagation()}>
          <span className="cr-iconbtn" role="button" title="Pin" onClick={() => onPin && onPin(run)}><CRIcon name="Pin" size={15} className={run.pinned ? "cr-iconbtn--on" : ""} /></span>
          {run.status === "running" || run.status === "queued"
            ? <span className="cr-iconbtn cr-iconbtn--danger" role="button" title="Cancel" onClick={() => onCancel && onCancel(run)}><CRIcon name="Square" size={14} /></span>
            : null}
        </span>
      </div>
      <div className="cr-run__prog">
        <span className="cr-steps">
          {run.steps.map((s, i) => {
            let c = "cr-stepdot";
            if (s.status === "done") c += " cr-stepdot--done";
            else if (s.status === "running") c += " cr-stepdot--running";
            else if (s.status === "gate") c += " cr-stepdot--gate";
            else if (s.status === "failed") c += " cr-stepdot--failed";
            return <span key={i} className={c} />;
          })}
        </span>
        <span className="cr-run__stepname">
          {run.status === "queued" ? "waiting in queue"
            : run.status === "awaiting_approval" ? "needs approval"
            : run.status === "completed" ? "completed · " + run.totalSteps + " steps"
            : run.status === "failed" ? "failed at step " + (run.currentStep + 1)
            : "step " + (run.currentStep + 1) + "/" + run.totalSteps + " · " + curName}
        </span>
      </div>
    </button>
  );
}

/* ── Confirm modal ───────────────────────────────────────────── */
function ConfirmModal({ open, title, body, confirmLabel, danger, typeToConfirm, onConfirm, onCancel }) {
  const [typed, setTyped] = crUseState("");
  crUseEffect(() => { if (open) setTyped(""); }, [open]);
  if (!open) return null;
  const ok = !typeToConfirm || typed.trim() === typeToConfirm;
  return (
    <div className="cr-confirm-back" onClick={onCancel}>
      <div className="cr-confirm" onClick={(e) => e.stopPropagation()}>
        <span className={"cr-confirm__ico" + (danger ? "" : " cr-confirm__ico--warn")}><CRIcon name={danger ? "TriangleAlert" : "CircleHelp"} size={22} /></span>
        <div className="cr-confirm__title">{title}</div>
        <div className="cr-confirm__body">{body}</div>
        {typeToConfirm ? (
          <div className="cr-confirm__field">
            <label>Type <b>{typeToConfirm}</b> to confirm</label>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={typeToConfirm} autoFocus />
          </div>
        ) : null}
        <div className="cr-confirm__actions">
          <button className="cr-btn" onClick={onCancel}>Cancel</button>
          <button className={"cr-btn " + (danger ? "cr-btn--danger" : "cr-btn--primary")} disabled={!ok} onClick={onConfirm}>{confirmLabel || "Confirm"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Toasts ──────────────────────────────────────────────────── */
function Toasts({ toasts, onUndo }) {
  return (
    <div className="cr-toasts">
      {toasts.map((t) => (
        <div className="cr-toast" key={t.id}>
          <CRIcon name={t.icon || "Check"} size={15} />
          <span>{t.text}</span>
          {t.undo ? <button className="cr-toast__undo" onClick={() => onUndo(t)}>Undo</button> : null}
        </div>
      ))}
    </div>
  );
}

/* ── Screen header (mirrors the AutoRoom scaffold) ───────────── */
function ScreenHead({ kicker, title, lede, actions }) {
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

Object.assign(window, {
  CRIcon, crMoney, crDur, StatusChip, ClassChip, Sparkline, AreaChart, Bars, Donut,
  KPITile, RunRow, ConfirmModal, Toasts, ScreenHead,
});
