/* ============================================================
   AlterEgo — UI components (React, Babel) → window
   ============================================================ */
const { useState, useEffect, useRef, useCallback } = React;

/* ── Lucide icon helper (reads window.lucide.icons node) ──────── */
const AE_LU = (window.lucide && window.lucide.icons) || {};
function aeKebabToCamel(k) { return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function Icon({ name, size = 18, stroke = 1.75, className, style }) {
  const node = AE_LU[name];
  if (!node) return null;
  const children = node[2] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true">
      {children.map((c, i) => {
        const props = { key: i };
        const attrs = c[1] || {};
        for (const k in attrs) props[aeKebabToCamel(k)] = attrs[k];
        return React.createElement(c[0], props);
      })}
    </svg>
  );
}

/* ── tiny inline markdown (bold / italic / inline code) ───────── */
function aeInline(text, keyBase) {
  const nodes = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) nodes.push(<strong key={`${keyBase}-${i}`}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={`${keyBase}-${i}`}>{tok.slice(1, -1)}</code>);
    else nodes.push(<em key={`${keyBase}-${i}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length; i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function aeIsTableSep(line) {
  // a GFM header separator row: | --- | :--: | --- |
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}
function aeSplitRow(line) {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
}

function AeMarkdown({ text }) {
  const blocks = [];
  // Clean up chars the design doesn't want: em/en dashes → hyphen, and drop
  // horizontal-rule + code-fence marker lines entirely (they render as ugly
  // "---" / "```" literals in this lightweight renderer).
  const clean = (text || "")
    .replace(/[—–]/g, "-")
    // Add the space that mashed web-search text drops: "earlier.Micron" ->
    // "earlier. Micron" (only lowercase.Uppercase, so "U.S." is untouched).
    .replace(/([a-z0-9])([.!?,;:])([A-Z])/g, "$1$2 $3")
    // Un-glue a bold label from the following word: "**Numbers**The" ->
    // "**Numbers** The".
    .replace(/(\*\*[^*]+\*\*)(?=[A-Za-z0-9])/g, "$1 ");
  const lines = clean.split("\n").filter((l) => {
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) return false; // horizontal rule
    if (/^\s*`{3,}/.test(l)) return false;                    // code fence marker
    return true;
  });
  let list = null;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const heading = /^\s*(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)/.exec(line);
    const num = /^\s*\d+\.\s+(.*)/.exec(line);

    // GFM table: a `| ... |` line followed by a `|---|` separator line.
    if (line.indexOf("|") !== -1 && idx + 1 < lines.length && aeIsTableSep(lines[idx + 1])) {
      const header = aeSplitRow(line);
      const rows = [];
      idx += 2; // skip header + separator
      while (idx < lines.length && lines[idx].indexOf("|") !== -1 && lines[idx].trim().length) {
        rows.push(aeSplitRow(lines[idx]));
        idx++;
      }
      idx--; // for-loop will ++
      list = null;
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (heading) {
      list = null;
      blocks.push({ type: "h", level: heading[1].length, text: heading[2] });
    } else if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { list = { ordered, items: [] }; blocks.push({ type: "list", list }); }
      list.items.push((bullet ? bullet[1] : num[1]));
    } else if (line.trim().length) {
      list = null;
      blocks.push({ type: "p", text: line });
    }
    // A blank line does NOT end the list: list items are often separated by
    // blank lines, and resetting here made each item its own <ol> restarting
    // at 1 ("1. 1. 1."). The list only ends when a real paragraph/heading/table
    // appears (those set list = null above).
  }
  return (
    <React.Fragment>
      {blocks.map((b, i) => {
        if (b.type === "table") {
          return (
            <div key={i} className="ae-md-tablewrap">
              <table className="ae-md-table">
                <thead><tr>{b.header.map((h, j) => <th key={j}>{aeInline(h, `h${i}-${j}`)}</th>)}</tr></thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>{r.map((c, k) => <td key={k}>{aeInline(c, `${i}-${j}-${k}`)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.type === "h") {
          const Tag = b.level <= 2 ? "h3" : "h4";
          return <Tag key={i} className="ae-md-h">{aeInline(b.text, i)}</Tag>;
        }
        if (b.type === "list") {
          const Tag = b.list.ordered ? "ol" : "ul";
          return <Tag key={i}>{b.list.items.map((it, j) => <li key={j}>{aeInline(it, `${i}-${j}`)}</li>)}</Tag>;
        }
        return <p key={i}>{aeInline(b.text, i)}</p>;
      })}
    </React.Fragment>
  );
}

/* ── Sidebar ──────────────────────────────────────────────────── */
const AE_NAV = [
  { id: "home", label: "Home", icon: "House" },
  { id: "new", label: "New chat", icon: "Plus" },
  { id: "search", label: "Search", icon: "Search" },
  { id: "autoroom", label: "AutoRoom", icon: "Workflow" },
  { id: "controlroom", label: "ControlRoom", icon: "Activity" },
  { id: "treasurer", label: "Treasurer", icon: "Landmark" },
  { id: "notifications", label: "Notifications", icon: "Bell", badge: 3 },
  { id: "archive", label: "Archive", icon: "Archive" },
];

const AE_PROFILE_MENU = [
  { id: "settings", label: "Settings", icon: "Settings" },
  { id: "usage", label: "Usage", icon: "Gauge" },
  { id: "billing", label: "Billing", icon: "CreditCard" },
  { id: "admin", label: "Admin", icon: "ShieldCheck" },
];

function Sidebar({ folders, openFolders, onToggleFolder, activeChatId, onSelectChat, onNewChat, activeNav, onNav, open, onClose, collapsed, onToggleCollapse }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    if (!profileOpen) return;
    const onDoc = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [profileOpen]);

  const handleNav = (id) => {
    if (id === "new") { onNewChat(); return; }
    onNav(id);
  };

  return (
    <React.Fragment>
      {open ? <div className="ae-backdrop" onClick={onClose} /> : null}
      <aside className={"ae-sidebar" + (collapsed ? " ae-sidebar--collapsed" : "") + (open ? " ae-sidebar--open" : "")} aria-label="Navigation">
        <div className="ae-side-head">
          <div className="ae-brand">
            <img className="ae-brand-logo" src="alterego/logo.png" alt="autonomux" />
            <span className="ae-brand-word">autonom<em>ux</em></span>
          </div>
          <button className="ae-icon-ghost" onClick={onToggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand" : "Collapse"}>
            <Icon name={collapsed ? "PanelLeftOpen" : "PanelLeftClose"} size={18} />
          </button>
        </div>

        <nav className="ae-nav" aria-label="Primary">
          {AE_NAV.map((n) => (
            <button
              key={n.id}
              className={"ae-nav-item" + (n.id === activeNav ? " ae-nav-item--active" : "")}
              onClick={() => handleNav(n.id)}
              title={n.label}
            >
              <span className="ae-nav-icon"><Icon name={n.icon} size={18} /></span>
              <span className="ae-nav-label">{n.label}</span>
              {n.badge ? <span className="ae-nav-badge">{n.badge}</span> : null}
            </button>
          ))}
        </nav>

        <div className="ae-rail-label">Library</div>
        <div className="ae-folders">
          {folders.map((f) => {
            const isOpen = openFolders.indexOf(f.id) !== -1;
            return (
              <div className="ae-folder" key={f.id}>
                <button className="ae-folder-head" onClick={() => onToggleFolder(f.id)} aria-expanded={isOpen}>
                  <span className="ae-folder-caret"><Icon name={isOpen ? "ChevronDown" : "ChevronRight"} size={14} /></span>
                  <span className="ae-folder-name">{f.name}</span>
                  <span className="ae-folder-count">{f.chats.length}</span>
                </button>
                {isOpen ? (
                  <ul className="ae-folder-chats">
                    {f.chats.map((c) => (
                      <li key={c.id}>
                        <button
                          className={"ae-chat" + (c.id === activeChatId ? " ae-chat--active" : "")}
                          onClick={() => onSelectChat(c.id)}
                        >
                          <span className="ae-chat-status" aria-hidden="true" />
                          <span className="ae-chat-title">{c.title}</span>
                          <span className="ae-chat-date">{c.date}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="ae-account" ref={profileRef}>
          {profileOpen ? (
            <div className="ae-profile-menu" role="menu">
              {AE_PROFILE_MENU.map((m) => (
                <button key={m.id} className="ae-profile-item" role="menuitem" onClick={() => { onNav(m.id); setProfileOpen(false); }}>
                  <Icon name={m.icon} size={16} />
                  <span>{m.label}</span>
                </button>
              ))}
              <div className="ae-profile-sep" />
              <button className="ae-profile-item ae-profile-item--danger" role="menuitem" onClick={() => { (window.top || window).location.href = "/sign-out"; }}>
                <Icon name="LogOut" size={16} />
                <span>Log out</span>
              </button>
            </div>
          ) : null}
          <button className={"ae-account-row" + (profileOpen ? " ae-account-row--open" : "")} onClick={() => setProfileOpen((v) => !v)} aria-haspopup="menu" aria-expanded={profileOpen}>
            <span className="ae-avatar">L</span>
            <div className="ae-account-text">
              <div className="ae-account-email">lightspiritux@gmail.com</div>
              <div className="ae-account-sub">Tenant · Active</div>
            </div>
            <span className="ae-account-caret"><Icon name="ChevronsUpDown" size={15} /></span>
          </button>
        </div>
      </aside>
    </React.Fragment>
  );
}

/* ── Empty state ──────────────────────────────────────────────── */
function EmptyState({ skills, onPickSkill, onPrompt }) {
  return (
    <div className="chat-empty">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-12)" }}>
        <h1 className="chat-empty-hero">Talk to your <em>AlterEgo</em>.</h1>
        <p className="chat-empty-sub">
          I'm you — with more time, a longer memory, and a way into your inbox, calendar,
          cards, and money. Ask me anything, think out loud, or hand me a task.
        </p>
        <p className="chat-empty-disclosure">
          AlterEgo is an AI. It can be wrong, so check anything that matters. It shares
          general information, not professional financial, legal, or medical advice.
        </p>
      </div>
    </div>
  );
}

/* ── Sub-agent result cards ───────────────────────────────────── */
function importanceDotClass(level, i) {
  if (i >= level) return "sa-dot";
  if (level >= 4) return "sa-dot sa-dot--gold";
  if (level >= 2) return "sa-dot sa-dot--amber";
  return "sa-dot sa-dot--muted";
}

function SubAgentCard({ skill, result, onAction }) {
  const [done, setDone] = useState({});
  const mark = (id) => setDone((d) => ({ ...d, [id]: true }));

  const head = (
    <div className="sa-head">
      <div className="sa-head-left">
        <span className="sa-badge">{skill.mark}</span>
        <span className="sa-label">{skill.name}</span>
      </div>
      <span className="sa-meta">{result.meta}</span>
    </div>
  );

  if (result.kind === "mailroom") {
    return (
      <article className="sa-card" aria-label="Mailroom triage">
        {head}
        <ul className="sa-list">
          {result.items.map((m, i) => (
            <li key={i} className="sa-row">
              <div className="sa-rowhead">
                <div style={{ minWidth: 0 }}>
                  <div className="sa-row-title">{m.subject}</div>
                  <div className="sa-row-sub">{m.sender}</div>
                </div>
                <div className="sa-dots" title={`Importance ${m.importance}/5`}>
                  {[0,1,2,3,4].map((d) => <span key={d} className={importanceDotClass(m.importance, d)} />)}
                </div>
              </div>
              <p className="sa-row-note"><span className="sa-tag">{m.action}</span>{m.reason}</p>
            </li>
          ))}
        </ul>
      </article>
    );
  }

  if (result.kind === "scheduler") {
    return (
      <article className="sa-card" aria-label="Today's schedule">
        {head}
        <div className="sa-agenda">
          {result.slots.map((s, i) => (
            <div key={i} className="sa-slot">
              <div className="sa-slot-time">{s.time}</div>
              <div className="sa-slot-body">
                <div className="sa-slot-title">{s.title}</div>
                <div className="sa-slot-sub">
                  {s.sub}{s.conflict ? <span className="sa-conflict"> · conflict</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="sa-actions">
          <button className={"sa-btn " + (done.fix ? "sa-btn--done" : "sa-btn--primary")} onClick={() => mark("fix")}>
            {done.fix ? "Moved 1:1 to 1:00" : "Resolve conflict"}
          </button>
        </div>
      </article>
    );
  }

  if (result.kind === "scribe") {
    return (
      <article className="sa-card" aria-label="Article draft">
        {head}
        <div className="sa-draft">
          <div className="sa-draft-title">{result.title}</div>
          <div className="sa-draft-excerpt">{result.excerpt}</div>
          <div className="sa-draft-meta">{result.channel}</div>
        </div>
        <div className="sa-actions">
          <button className={"sa-btn " + (done.post ? "sa-btn--done" : "sa-btn--primary")} onClick={() => mark("post")}>
            {done.post ? "Posted to Substack" : "Post it"}
          </button>
          <button className="sa-btn sa-btn--ghost" onClick={() => onAction && onAction("Tighten the opening and cut it to 500 words.")}>Revise</button>
        </div>
      </article>
    );
  }

  if (result.kind === "oracle") {
    return (
      <article className="sa-card" aria-label="Card reading">
        {head}
        <div className="sa-oracle">
          <div className="sa-card-visual">
            <span className="sa-card-rank">{result.rank}</span>
            <span className={"sa-card-suit " + (result.suitColor === "red" ? "sa-card-suit--red" : "sa-card-suit--black")}>{result.suit}</span>
          </div>
          <div className="sa-oracle-body">
            <div className="sa-oracle-name">{result.name}</div>
            <div className="sa-oracle-read">{result.read}</div>
          </div>
        </div>
      </article>
    );
  }

  if (result.kind === "treasurer") {
    return (
      <article className="sa-card" aria-label="Money map">
        {head}
        <div className="sa-lanes">
          {result.lanes.map((l, i) => (
            <div key={i} className="sa-lane">
              <div className="sa-lane-label">{l.label}</div>
              <div className="sa-lane-val">{l.val}</div>
              <div className="sa-lane-note">{l.note}</div>
            </div>
          ))}
        </div>
        <p className="sa-row-note">{result.note}</p>
      </article>
    );
  }

  if (result.kind === "studio") {
    return (
      <article className="sa-card" aria-label="Generated image">
        {head}
        <div className="sa-studio-frame"><span className="sa-studio-tag">{result.tag}</span></div>
        <p className="sa-row-note"><span className="sa-tag">Prompt</span>{result.prompt}</p>
        <div className="sa-actions">
          <button className={"sa-btn " + (done.save ? "sa-btn--done" : "sa-btn--primary")} onClick={() => mark("save")}>
            {done.save ? "Saved" : "Save"}
          </button>
          <button className="sa-btn sa-btn--ghost" onClick={() => onAction && onAction("Make another variant — more chameleon, tighter crop.")}>Regenerate</button>
        </div>
      </article>
    );
  }

  if (result.kind === "companion") {
    return (
      <article className="sa-card" aria-label="Companion take">
        {head}
        <p className="sa-row-note" style={{ fontSize: "var(--fs-body)", color: "var(--ink-soft)", lineHeight: 1.6 }}>{result.text}</p>
      </article>
    );
  }
  return null;
}

/* ── Message turn ─────────────────────────────────────────────── */
function MessageTurn({ msg, skills, isStreamingTail, onAction, onCopy, onSpeak }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);
  const skill = msg.skillId ? skills.find((s) => s.id === msg.skillId) : null;

  const copy = () => {
    if (msg.text) {
      try { navigator.clipboard.writeText(msg.text); } catch (e) {}
    }
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };

  return (
    <article className="chat-turn msg-anim" data-role={msg.role}>
      {isUser ? (
        <div className="chat-turn-body--user">
          {msg.attachments && msg.attachments.length > 0 ? (
            <div className="ae-bubble-atts">
              {msg.attachments.map((a, i) => (
                <span key={i} className="ae-bubble-att">
                  {a.url ? <img src={a.url} alt="" /> : <span className="ae-att-kind">{a.kind}</span>}
                  <span className="ae-att-name">{a.name}</span>
                </span>
              ))}
            </div>
          ) : null}
          {msg.text}
        </div>
      ) : (
        <div className="chat-turn-body--assistant">
          {msg.text ? <AeMarkdown text={msg.text} /> : null}
          {isStreamingTail && !msg.result ? <span className="streaming-cursor" /> : null}
          {skill && msg.result ? (
            <div className="card-anim"><SubAgentCard skill={skill} result={msg.result} onAction={onAction} /></div>
          ) : null}
        </div>
      )}

      {!isStreamingTail ? (
        <div className="msg-actions">
          <span className="msg-time">{msg.time}</span>
          <button className={"msg-action-btn" + (copied ? " msg-action-btn--feedback" : "")} onClick={copy} title={copied ? "Copied" : "Copy"} aria-label="Copy message"><Icon name={copied ? "Check" : "Copy"} size={15} /></button>
          {!isUser ? (
            <button className="msg-action-btn" onClick={() => onSpeak && onSpeak(msg.text)} title="Read aloud" aria-label="Read aloud"><Icon name="Volume2" size={15} /></button>
          ) : null}
          {!isUser ? (
            <button className="msg-action-btn" onClick={() => onAction && onAction("__regenerate__")} title="Regenerate" aria-label="Regenerate"><Icon name="RotateCcw" size={15} /></button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ThinkingTurn({ time }) {
  return (
    <article className="chat-turn msg-anim" data-role="assistant">
      <div className="chat-turn-body--assistant chat-turn-thinking">
        <span className="typing-dots" aria-label="Thinking"><span /><span /><span /></span>
      </div>
    </article>
  );
}

/* Persistent activity indicator — shown the whole time AlterEgo is working,
   even while text streams, so the chat never looks frozen. The label reflects
   what's happening ("Consulting Oracle", "Searching", "Writing"). */
function WorkingBar({ label }) {
  return (
    <div className="ae-working" role="status" aria-live="polite">
      <span className="ae-working-orb" aria-hidden="true" />
      <span className="ae-working-label">{label || "Thinking"}</span>
      <span className="typing-dots ae-working-dots" aria-hidden="true"><span /><span /><span /></span>
    </div>
  );
}

Object.assign(window, { Sidebar, EmptyState, SubAgentCard, MessageTurn, ThinkingTurn, WorkingBar, AeMarkdown, Icon });
