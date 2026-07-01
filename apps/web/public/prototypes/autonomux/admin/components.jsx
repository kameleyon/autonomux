/* ============================================================
   autonomux Admin — shared UI primitives (React/Babel → window)
   ============================================================ */
const { useState: aUseState, useEffect: aUseEffect, useRef: aUseRef } = React;

/* Lucide icon helper */
const ADM_LU = (window.lucide && window.lucide.icons) || {};
function admCamel(k) { return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function AdmIcon({ name, size = 18, stroke = 1.75, className, style }) {
  const node = ADM_LU[name] || ADM_LU[admCamel(name)];
  if (!node) return null;
  const kids = node[2] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {kids.map((c, i) => {
        const p = { key: i }; const a = c[1] || {};
        for (const k in a) p[admCamel(k)] = a[k];
        return React.createElement(c[0], p);
      })}
    </svg>
  );
}

/* Page header: kicker + h1 + lede, optional right-side actions */
function PageHead({ kicker, title, lede, actions }) {
  return (
    <div className="adm-pagehead">
      <div className="adm-pagehead__row">
        <div>
          {kicker ? <div className="adm-kicker">{kicker}</div> : null}
          <h1 className="adm-h1" style={{ whiteSpace: "normal" }} dangerouslySetInnerHTML={{ __html: title }} />
        </div>
        {actions ? <div className="adm-pagehead__actions">{actions}</div> : null}
      </div>
      {lede ? <p className="adm-lede" style={{ marginTop: "var(--sp-12)" }}>{lede}</p> : null}
    </div>
  );
}

/* KPI counter row */
function Kpi({ label, value, delta, dir, foot }) {
  const dcls = dir === "up" ? "adm-delta--up" : dir === "down" ? "adm-delta--down" : "adm-delta--flat";
  const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "";
  return (
    <div className="adm-kpi">
      <div className="adm-kpi__label">{label}</div>
      <div className="adm-kpi__value">{value}</div>
      <div className="adm-kpi__foot">
        {delta ? <span className={"adm-delta " + dcls}>{arrow} {delta}</span> : null}
        <span>{foot}</span>
      </div>
    </div>
  );
}
function KpiRow({ items, cols }) {
  return <div className={"adm-kpis" + (cols === 3 ? " adm-kpis--3" : "")}>{items.map((k, i) => <Kpi key={i} {...k} />)}</div>;
}

/* Status pill + dot */
const ADM_STATUS_LABEL = { active: "active", past_due: "past due", suspended: "suspended", cancelled: "cancelled", pending_deletion: "pending del", ok: "operational", warn: "degraded", alert: "down", running: "running", pending: "pending", failed: "failed", retrying: "retrying", done: "done" };
function statusKind(s) {
  if (["active", "ok", "done"].includes(s)) return "ok";
  if (["past_due", "suspended", "warn", "pending", "retrying", "running"].includes(s)) return s === "running" ? "live" : "warn";
  return "alert";
}
function Pill({ status, label }) {
  const k = statusKind(status);
  const cls = k === "ok" ? "adm-pill--ok" : k === "alert" ? "adm-pill--alert" : "adm-pill--warn";
  const dot = k === "ok" ? "adm-dot--ok" : k === "alert" ? "adm-dot--alert" : k === "live" ? "adm-dot--live" : "adm-dot--warn";
  return <span className={"adm-pill " + (k === "live" ? "adm-pill--warn" : cls)}><span className={"adm-dot " + dot} />{label || ADM_STATUS_LABEL[status] || status}</span>;
}

/* Simple block wrapper */
function Block({ title, meta, children, panel = true }) {
  return (
    <section className="adm-block">
      {(title || meta) ? (
        <div className="adm-block__head">
          {title ? <h2 className="adm-block__title">{title}</h2> : <span />}
          {meta ? <span className="adm-block__meta">{meta}</span> : null}
        </div>
      ) : null}
      {panel ? <div className="adm-panel">{children}</div> : children}
    </section>
  );
}

/* Generic table */
function Table({ columns, rows, onRowClick, rowKey }) {
  return (
    <div className="adm-tablewrap">
      <table className="adm-table">
        <thead><tr>{columns.map((c) => <th key={c.id} className={c.align === "right" ? "r" : ""}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey ? rowKey(r) : ri} className={onRowClick ? "adm-row--click" : ""} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => <td key={c.id} className={c.align === "right" ? "r" : ""}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Horizontal bar */
function Bar({ pct, hot }) {
  return <div className="adm-bar"><div className={"adm-bar__fill" + (hot ? " adm-bar__fill--hot" : "")} style={{ width: Math.max(2, pct) + "%" }} /></div>;
}

/* Sparkline columns */
function Spark({ data }) {
  const max = Math.max.apply(null, data);
  return (
    <div className="adm-spark">
      {data.map((v, i) => <div key={i} className={"adm-spark__col" + (v === max ? " adm-spark__col--peak" : "")} style={{ height: Math.max(8, (v / max) * 100) + "%" }} title={String(v)} />)}
    </div>
  );
}

/* Toolbar search + chips */
function Toolbar({ query, onQuery, placeholder, chips, active, onChip, actions }) {
  return (
    <div className="adm-toolbar">
      <div className="adm-search">
        <AdmIcon name="Search" size={16} />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} />
      </div>
      {chips ? (
        <div className="adm-chips">
          {chips.map((c) => <button key={c.id} className={"adm-chip" + (active === c.id ? " adm-chip--active" : "")} onClick={() => onChip(c.id)}>{c.label}</button>)}
        </div>
      ) : null}
      {actions || null}
    </div>
  );
}

function Note({ children }) {
  return <div className="adm-note"><AdmIcon name="Info" size={18} />{<div>{children}</div>}</div>;
}

Object.assign(window, { AdmIcon, PageHead, Kpi, KpiRow, Pill, Block, Table, Bar, Spark, Toolbar, Note, statusKind });
