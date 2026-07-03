/* ============================================================
   AlterEgo — app root (React, Babel)
   ============================================================ */
const { useState: auseState, useEffect: auseEffect, useRef: auseRef, useCallback: auseCallback } = React;
const Icon = window.Icon;

function aeNow() {
  return new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function aeStripEmoji(t) {
  return (t || "").replace(/\p{Extended_Pictographic}/gu, "").replace(/[ \t]{2,}/g, " ").replace(/ +([.,!?;:])/g, "$1").trim();
}

const AE_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "blaze": 1,
  "voice": "warm",
  "readAloud": false,
  "typeScale": 1
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(AE_TWEAK_DEFAULTS);
  const [messages, setMessages] = auseState([]);
  const [inFlight, setInFlight] = auseState(false);
  const [error, setError] = auseState(null);
  const [activeSkillId, setActiveSkillId] = auseState(null);
  const [folders] = auseState(window.AE.FOLDERS);
  const [openFolders, setOpenFolders] = auseState(["mailroom"]);
  const [activeChatId, setActiveChatId] = auseState(null);
  const [activeNav, setActiveNav] = auseState("home");
  const [navOpen, setNavOpen] = auseState(false);
  const [searchOpen, setSearchOpen] = auseState(false);
  const [showDown, setShowDown] = auseState(false);
  const [collapsed, setCollapsed] = auseState(() => { try { return localStorage.getItem("ae-collapsed") === "1"; } catch (e) { return false; } });
  const toggleCollapse = auseCallback(() => setCollapsed((c) => { const n = !c; try { localStorage.setItem("ae-collapsed", n ? "1" : "0"); } catch (e) {} return n; }), []);

  const stopRef = auseRef(false);
  const scrollerRef = auseRef(null);
  const pinnedRef = auseRef(true);

  const skills = window.AE.SKILLS;
  const activeSkill = activeSkillId ? skills.find((s) => s.id === activeSkillId) : null;

  // ⌘K / Ctrl-K opens search
  auseEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // apply tweaks to root
  auseEffect(() => {
    document.documentElement.style.setProperty("--blaze", t.blaze);
    document.documentElement.style.setProperty("--type-scale", t.typeScale);
  }, [t.blaze, t.typeScale]);

  // auto-scroll
  auseEffect(() => {
    const el = scrollerRef.current; if (!el) return;
    const h = () => {
      const dist = el.scrollHeight - (el.scrollTop + el.clientHeight);
      pinnedRef.current = dist < 100;
      setShowDown(dist > 200);
    };
    el.addEventListener("scroll", h, { passive: true });
    return () => el.removeEventListener("scroll", h);
  }, []);
  auseEffect(() => {
    const el = scrollerRef.current; if (!el || !pinnedRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: inFlight ? "auto" : "smooth" });
  }, [messages, inFlight]);

  // ── TTS ──
  const speak = auseCallback((text) => {
    if (!("speechSynthesis" in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(aeStripEmoji(text));
      u.rate = 1.02; u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }, []);

  // ── core send ──
  const runTurn = auseCallback(async (userText, attachments, forcedSkillId) => {
    setError(null);
    const skill = window.AE.routeSkill(forcedSkillId ? "" : userText, forcedSkillId);
    const skillResult = skill ? (window.AE.RESULTS[skill.id] || null) : null;
    const hasCard = !!skillResult;
    const tNow = aeNow();

    const userMsg = { id: `u-${Date.now()}`, role: "user", text: userText, attachments: attachments || [], time: tNow };
    const aId = `a-${Date.now()}`;
    const aiMsg = { id: aId, role: "assistant", text: "", time: tNow, skillId: hasCard ? skill.id : null, result: null };

    setMessages((p) => [...p, userMsg, aiMsg]);
    setInFlight(true);
    setActiveSkillId(null);
    pinnedRef.current = true;
    stopRef.current = false;

    // skill "runs" first (only skills that produce a result card)
    if (hasCard) {
      await new Promise((r) => setTimeout(r, 650));
      if (stopRef.current) { setInFlight(false); return; }
      setMessages((p) => p.map((m) => m.id === aId ? { ...m, result: skillResult } : m));
    }

    // get the conversational wrapper
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    let full = "";
    try {
      if (window.claude && typeof window.claude.complete === "function") {
        const prompt = window.AE.buildPrompt(history, userText, t.voice, skill, hasCard);
        full = await window.claude.complete(prompt);
        full = aeStripEmoji((full || "").replace(/^AlterEgo:\s*/i, "").trim());
      }
    } catch (e) { /* fall through to scripted */ }
    if (!full) full = window.AE.scriptedReply(userText, skill);
    if (stopRef.current) { setInFlight(false); return; }

    // simulate streaming — letter by letter, with natural pauses
    let acc = "";
    for (let i = 0; i < full.length; i++) {
      if (stopRef.current) break;
      const ch = full[i];
      acc += ch;
      setMessages((p) => p.map((m) => m.id === aId ? { ...m, text: acc } : m));
      let d = 17;
      if (ch === "." || ch === "!" || ch === "?") d = 155;
      else if (ch === "," || ch === ";" || ch === ":") d = 95;
      else if (ch === "\n") d = 110;
      else if (ch === " ") d = 24;
      await new Promise((r) => setTimeout(r, d));
    }
    setMessages((p) => p.map((m) => m.id === aId ? { ...m, text: full } : m));
    setInFlight(false);
    if (t.readAloud) speak(full);
  }, [messages, t.voice, t.readAloud, speak]);

  const handleSubmit = auseCallback(({ text, attachments }) => {
    if (inFlight) return;
    let composed = text;
    if (attachments && attachments.length) {
      const labels = attachments.map((a) => `[${a.kind}: ${a.name}]`).join(" ");
      composed = (text ? text + "\n\n" : "") + "Attached: " + labels;
    }
    if (!composed && !activeSkill) return;
    runTurn(composed || activeSkill.name + " — go.", attachments, activeSkill ? activeSkill.id : null);
  }, [inFlight, activeSkill, runTurn]);

  const handleAction = auseCallback((arg) => {
    if (arg === "__regenerate__") {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser) runTurn(lastUser.text, lastUser.attachments, lastUser.skillId);
      return;
    }
    if (typeof arg === "string") runTurn(arg, [], null);
  }, [messages, runTurn]);

  const handlePickSkill = auseCallback((id) => {
    setActiveSkillId(id);
    const ta = document.getElementById("ae-input"); if (ta) ta.focus();
  }, []);

  const handleStop = auseCallback(() => { stopRef.current = true; setInFlight(false); if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  const scrollToBottom = auseCallback(() => {
    const el = scrollerRef.current; if (!el) return;
    pinnedRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowDown(false);
  }, []);

  const newChat = auseCallback(() => {
    setMessages([]); setError(null); setActiveSkillId(null); setActiveChatId(null); setNavOpen(false); setActiveNav("home");
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const toggleFolder = auseCallback((id) => {
    setOpenFolders((prev) => prev.indexOf(id) !== -1 ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const selectChat = auseCallback((id) => {
    setActiveChatId(id); setMessages([]); setActiveSkillId(null); setNavOpen(false); setActiveNav(null);
  }, []);

  const onNav = auseCallback((id) => {
    if (id === "search") { setSearchOpen(true); setNavOpen(false); return; }
    if (id === "admin") { window.location.href = "Admin.html"; return; }
    if (id === "controlroom") { window.location.href = "ControlRoom.html"; return; }
    if (id === "treasurer") { window.location.href = "Treasurer.html"; return; }
    if (id === "logout") { window.location.href = "Login.html"; return; }
    setActiveNav(id); setActiveChatId(null); setNavOpen(false);
  }, []);

  const openChatFromSearch = auseCallback((id) => {
    setActiveChatId(id); setMessages([]); setActiveSkillId(null); setActiveNav(null); setNavOpen(false);
  }, []);

  const lastId = messages.length ? messages[messages.length - 1].id : null;
  const SCREEN_NAVS = ["autoroom", "notifications", "archive", "settings", "usage", "billing"];
  const screenNav = SCREEN_NAVS.indexOf(activeNav) !== -1 ? activeNav : null;

  return (
    <div className="ae-shell">
      <Sidebar folders={folders} openFolders={openFolders} onToggleFolder={toggleFolder} activeChatId={activeChatId} onSelectChat={selectChat} onNewChat={newChat} activeNav={activeNav} onNav={onNav} open={navOpen} onClose={() => setNavOpen(false)} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      <div className="ae-main">
        <header className="ae-topbar">
          <button className="ae-hamburger" aria-label="Open menu" onClick={() => setNavOpen(true)}><Icon name="Menu" size={18} /></button>
          <div className="ae-topbar-spacer" />
          <div className="ae-topbar-actions">
            <button className="ae-tb-btn" onClick={() => setSearchOpen(true)} title="Search (⌘K)" aria-label="Search">
              <Icon name="Search" size={16} />
            </button>
            <button className={"ae-tb-btn" + (t.readAloud ? " ae-tb-btn--on" : "")} onClick={() => setTweak("readAloud", !t.readAloud)} title="Read replies aloud" aria-pressed={t.readAloud}>
              <Icon name={t.readAloud ? "Volume2" : "VolumeX"} size={16} />
              {t.readAloud ? "Reading aloud" : "Read aloud"}
            </button>
          </div>
        </header>

        {screenNav ? (
          <div className="chat-scroller" role="region" aria-label={screenNav}>
            {screenNav === "autoroom" ? <AutoroomView onNav={onNav} /> : null}
            {screenNav === "notifications" ? <NotificationsView /> : null}
            {screenNav === "archive" ? <ArchiveView onOpenChat={openChatFromSearch} /> : null}
            {screenNav === "settings" ? <SettingsView /> : null}
            {screenNav === "usage" ? <UsageView /> : null}
            {screenNav === "billing" ? <BillingView /> : null}
          </div>
        ) : (
        <div className="chat-section">
          <div className="chat-scroller" ref={scrollerRef} role="log" aria-live="polite">
            {messages.length === 0 ? (
              <EmptyState skills={skills} onPickSkill={handlePickSkill} onPrompt={(p) => runTurn(p, [], null)} />
            ) : (
              <div className="chat-stream">
                {messages.map((m) => {
                  const isTail = m.role === "assistant" && inFlight && m.id === lastId;
                  if (m.role === "assistant" && !m.text && !m.result) return <ThinkingTurn key={m.id} time={m.time} />;
                  return (
                    <MessageTurn key={m.id} msg={m} skills={skills} isStreamingTail={isTail}
                      onAction={handleAction} onSpeak={speak} />
                  );
                })}
              </div>
            )}
          </div>

          {error ? <div className="ae-error" role="alert">{error}</div> : null}

          {showDown ? (
            <button className="chat-scrolldown" onClick={scrollToBottom} aria-label="Scroll to latest" title="Back to latest"><Icon name="ArrowDown" size={18} /></button>
          ) : null}

          <Composer
            disabled={inFlight} onSubmit={handleSubmit} onStop={handleStop}
            activeSkill={activeSkill} onClearSkill={() => setActiveSkillId(null)} onSetSkill={setActiveSkillId}
            skills={skills} ttsOn={t.readAloud} onToggleTts={() => setTweak("readAloud", !t.readAloud)} />
        </div>
        )}
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} skills={skills} folders={folders}
        onPickSkill={(id) => { setActiveNav("home"); setActiveChatId(null); handlePickSkill(id); }}
        onOpenChat={openChatFromSearch} onNav={onNav} />

      <TweaksPanel>
        <TweakSection label="The blaze" />
        <TweakSlider label="Intensity" value={t.blaze} min={0.4} max={1.4} step={0.05} onChange={(v) => setTweak("blaze", v)} />
        <TweakSection label="AlterEgo's voice" />
        <TweakRadio label="Tone" value={t.voice} options={["warm", "sharp", "mystical"]} onChange={(v) => setTweak("voice", v)} />
        <TweakToggle label="Read replies aloud" value={t.readAloud} onChange={(v) => setTweak("readAloud", v)} />
        <TweakSection label="Type" />
        <TweakSlider label="Scale" value={t.typeScale} min={0.9} max={1.2} step={0.05} onChange={(v) => setTweak("typeScale", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
