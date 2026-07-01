/* ============================================================
   AlterEgo — screens: Search modal, Autoroom, Notifications, Archive
   (React/Babel → window)
   ============================================================ */
const { useState: scUseState, useEffect: scUseEffect, useRef: scUseRef } = React;
const ScIcon = window.Icon;

/* ── Search modal (⌘K) ───────────────────────────────────────── */
function SearchModal({ open, onClose, skills, folders, onPickSkill, onOpenChat, onNav }) {
  const [q, setQ] = scUseState("");
  const [sel, setSel] = scUseState(0);
  const inputRef = scUseRef(null);

  scUseEffect(() => {
    if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); }
  }, [open]);

  // build a flat result list
  const ql = q.trim().toLowerCase();
  const results = [];
  const navItems = [
    { kind: "nav", id: "home", label: "Home", icon: "House", sub: "Back to chat" },
    { kind: "nav", id: "autoroom", label: "Autoroom", icon: "Workflow", sub: "Automations & skills" },
    { kind: "nav", id: "notifications", label: "Notifications", icon: "Bell", sub: "Activity & approvals" },
    { kind: "nav", id: "archive", label: "Archive", icon: "Archive", sub: "Past conversations" },
  ];
  navItems.forEach((n) => { if (!ql || n.label.toLowerCase().includes(ql)) results.push(n); });
  const skillIcon = { mailroom: "Mail", scheduler: "CalendarClock", scribe: "PenLine", oracle: "Sparkles", treasurer: "Coins", studio: "Image", companion: "Heart" };
  skills.forEach((s) => { if (!ql || (s.name + " " + s.desc).toLowerCase().includes(ql)) results.push({ kind: "skill", id: s.id, label: s.name, icon: skillIcon[s.id] || "Sparkles", sub: s.desc }); });
  folders.forEach((f) => f.chats.forEach((c) => { if (!ql || (c.title + " " + f.name).toLowerCase().includes(ql)) results.push({ kind: "chat", id: c.id, label: c.title, icon: "MessageSquare", sub: f.name + " · " + c.date }); }));

  scUseEffect(() => { setSel(0); }, [q]);
  scUseEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); pick(results[sel]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, sel]);

  const pick = (r) => {
    if (!r) return;
    if (r.kind === "nav") onNav(r.id);
    else if (r.kind === "skill") onPickSkill(r.id);
    else if (r.kind === "chat") onOpenChat(r.id);
    onClose();
  };

  if (!open) return null;
  const groups = [
    { key: "nav", label: "Go to", items: results.filter((r) => r.kind === "nav") },
    { key: "skill", label: "Hand a task", items: results.filter((r) => r.kind === "skill") },
    { key: "chat", label: "Conversations", items: results.filter((r) => r.kind === "chat") },
  ];
  let flatIdx = -1;

  return (
    <div className="ae-modal-backdrop" onClick={onClose}>
      <div className="ae-search-modal" role="dialog" aria-modal="true" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <div className="ae-search-modal__field">
          <ScIcon name="Search" size={18} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations, skills, places…" />
          <kbd className="ae-kbd">esc</kbd>
        </div>
        <div className="ae-search-modal__results">
          {results.length === 0 ? (
            <div className="ae-search-empty">No matches for “{q}”.</div>
          ) : groups.map((g) => g.items.length ? (
            <div className="ae-search-group" key={g.key}>
              <div className="ae-search-group__label">{g.label}</div>
              {g.items.map((r) => {
                flatIdx++;
                const myIdx = results.indexOf(r);
                const active = myIdx === sel;
                return (
                  <button key={r.kind + r.id} className={"ae-search-item" + (active ? " ae-search-item--active" : "")}
                    onMouseEnter={() => setSel(myIdx)} onClick={() => pick(r)}>
                    <span className="ae-search-item__ico"><ScIcon name={r.icon} size={16} /></span>
                    <span className="ae-search-item__txt">
                      <span className="ae-search-item__label">{r.label}</span>
                      <span className="ae-search-item__sub">{r.sub}</span>
                    </span>
                    {active ? <span className="ae-search-item__enter"><ScIcon name="CornerDownLeft" size={14} /></span> : null}
                  </button>
                );
              })}
            </div>
          ) : null)}
        </div>
      </div>
    </div>
  );
}

/* ── Shared screen scaffold ──────────────────────────────────── */
function ScreenHead({ kicker, title, lede, actions }) {
  return (
    <div className="ae-screen-head">
      <div className="ae-screen-head__row">
        <div>
          <div className="ae-screen-kicker">{kicker}</div>
          <h1 className="ae-screen-h1" dangerouslySetInnerHTML={{ __html: title }} />
        </div>
        {actions || null}
      </div>
      {lede ? <p className="ae-screen-lede">{lede}</p> : null}
    </div>
  );
}

/* ── Autoroom lives in alterego/autoroom.jsx ─────────────────── */

/* ── Notifications ───────────────────────────────────────────── */
function NotificationsView() {
  const [approvals, setApprovals] = scUseState(window.AE.APPROVALS.map((a) => ({ ...a, state: null })));
  const [notifs, setNotifs] = scUseState(window.AE.NOTIFS.map((n) => ({ ...n })));
  const act = (id, state) => setApprovals((p) => p.map((a) => a.id === id ? { ...a, state } : a));
  const markRead = () => setNotifs((p) => p.map((n) => ({ ...n, unread: false })));
  const pending = approvals.filter((a) => !a.state).length;
  const unread = notifs.filter((n) => n.unread).length;

  return (
    <div className="ae-screen">
      <ScreenHead kicker="Notifications" title="What I did, and what <em>needs you</em>."
        lede="AlterEgo acts on its own where you let it — and stops at anything irreversible until you say go."
        actions={unread ? <button className="ae-screen-btn" onClick={markRead}><ScIcon name="CheckCheck" size={15} />Mark all read</button> : null} />

      <div className="ae-notif-section">
        <div className="ae-notif-section__label"><ScIcon name="ShieldAlert" size={14} />Needs your approval <span className="ae-count-bub">{pending}</span></div>
        <div className="ae-approvals">
          {approvals.map((a) => (
            <div className={"ae-approval" + (a.state ? " ae-approval--resolved" : "")} key={a.id}>
              <span className="ae-approval__ico"><ScIcon name={a.icon} size={18} /></span>
              <div className="ae-approval__body">
                <div className="ae-approval__title">{a.title}</div>
                <div className="ae-approval__detail">{a.detail}</div>
                <div className="ae-approval__gate"><ScIcon name="Lock" size={11} />{a.gate}</div>
              </div>
              {a.state ? (
                <span className={"ae-approval__done " + (a.state === "approved" ? "ae-approval__done--ok" : "ae-approval__done--no")}>
                  <ScIcon name={a.state === "approved" ? "Check" : "X"} size={14} />{a.state === "approved" ? "Approved" : "Dismissed"}
                </span>
              ) : (
                <div className="ae-approval__actions">
                  <button className="ae-screen-btn ae-screen-btn--ghost" onClick={() => act(a.id, "dismissed")}>Not now</button>
                  <button className="ae-screen-btn ae-screen-btn--primary" onClick={() => act(a.id, "approved")}>Approve</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="ae-notif-section">
        <div className="ae-notif-section__label"><ScIcon name="Activity" size={14} />Recent activity</div>
        <div className="ae-notif-list">
          {notifs.map((n) => (
            <div className={"ae-notif" + (n.unread ? " ae-notif--unread" : "")} key={n.id}>
              <span className={"ae-notif__ico" + (n.nudge ? " ae-notif__ico--nudge" : "")}><ScIcon name={n.icon} size={16} /></span>
              <span className="ae-notif__title">{n.title}</span>
              <span className="ae-notif__meta">{n.agent} · {n.time}</span>
              {n.unread ? <span className="ae-notif__dot" /> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Archive ─────────────────────────────────────────────────── */
function ArchiveView({ onOpenChat }) {
  const [q, setQ] = scUseState("");
  const ql = q.trim().toLowerCase();
  const groups = window.AE.ARCHIVE.map((g) => ({ ...g, items: g.items.filter((it) => !ql || (it.title + " " + it.agent + " " + it.preview).toLowerCase().includes(ql)) })).filter((g) => g.items.length);

  return (
    <div className="ae-screen">
      <ScreenHead kicker="Archive" title="Everything we've <em>talked through</em>."
        lede="Past conversations and briefings, kept and searchable. Open one to pick the thread back up." />
      <div className="ae-archive-search">
        <ScIcon name="Search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the archive…" />
      </div>
      {groups.length === 0 ? <div className="ae-search-empty" style={{ borderRadius: 12 }}>Nothing matches “{q}”.</div> : groups.map((g) => (
        <div className="ae-archive-group" key={g.group}>
          <div className="ae-archive-group__label">{g.group}</div>
          <div className="ae-archive-list">
            {g.items.map((it) => (
              <button className="ae-archive-row" key={it.id} onClick={() => onOpenChat(it.id)}>
                <span className="ae-archive-row__date">{it.date}</span>
                <div className="ae-archive-row__main">
                  <span className="ae-archive-row__title">{it.title}</span>
                  <span className="ae-archive-row__preview">{it.preview}</span>
                </div>
                <span className="ae-archive-row__agent">{it.agent}</span>
                <ScIcon name="ChevronRight" size={16} className="ae-archive-row__chev" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { SearchModal, NotificationsView, ArchiveView, ScreenHead });
