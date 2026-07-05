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
  const [status, setStatus] = auseState(null); // live "what AlterEgo is doing" label
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
  const threadRef = auseRef(null);   // real chat_threads id for this conversation
  const abortRef = auseRef(null);    // AbortController for the active SSE fetch
  const audioRef = auseRef(null);    // currently-playing Lemonfox TTS audio

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

  // ── TTS (Lemonfox voice "Adam") ──
  // One persistent <audio> element, reused for every reply. iOS blocks
  // programmatic playback until an element has been played during a user
  // gesture, so we "unlock" this element on the Read-aloud toggle / send tap —
  // after that, replies can auto-read without another tap.
  const SILENT = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKACWQAA==";
  const getAudioEl = auseCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);
  const unlockAudio = auseCallback(() => {
    const a = getAudioEl();
    if (a._unlocked) return;
    try {
      a.muted = true; a.src = SILENT;
      const p = a.play();
      if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; a._unlocked = true; }).catch(() => { a.muted = false; });
    } catch (e) {}
  }, [getAudioEl]);
  const stopAudio = auseCallback(() => {
    try {
      const a = audioRef.current;
      if (a) { a.pause(); if (a._url) { URL.revokeObjectURL(a._url); a._url = null; } }
    } catch (e) {}
    if ("speechSynthesis" in window) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }, []);

  const speak = auseCallback(async (text) => {
    const clean = aeStripEmoji(text || "");
    if (!clean) return;
    stopAudio();
    try {
      const r = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: clean }),
        credentials: "same-origin",
      });
      if (!r.ok) throw new Error("tts " + r.status);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = getAudioEl();
      if (a._url) URL.revokeObjectURL(a._url);
      a._url = url; a.muted = false; a.src = url;
      a.onended = () => { if (a._url) { URL.revokeObjectURL(a._url); a._url = null; } };
      await a.play();
    } catch (e) {
      try {
        if ("speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(clean);
          u.rate = 1.02; window.speechSynthesis.speak(u);
        }
      } catch (_) {}
    }
  }, [stopAudio, getAudioEl]);

  // Lazily create (once per conversation) a real chat_threads row so the
  // streamed turns persist and carry context. Reset on New chat / select.
  const ensureThread = auseCallback(async () => {
    if (threadRef.current) return threadRef.current;
    const r = await fetch("/api/chat/thread", { method: "POST", cache: "no-store", credentials: "same-origin" });
    if (!r.ok) throw new Error(r.status === 401 ? "Your session expired — sign in again." : "Could not start a conversation.");
    const j = await r.json();
    threadRef.current = j.threadId;
    return threadRef.current;
  }, []);

  // ── core send — streams a REAL reply from the orchestrator SSE endpoint ──
  const runTurn = auseCallback(async (userText, attachments) => {
    setError(null);
    const tNow = aeNow();

    const userMsg = { id: `u-${Date.now()}`, role: "user", text: userText, attachments: attachments || [], time: tNow };
    const aId = `a-${Date.now()}`;
    const aiMsg = { id: aId, role: "assistant", text: "", time: tNow, skillId: null, result: null };

    setMessages((p) => [...p, userMsg, aiMsg]);
    setInFlight(true);
    setStatus("Thinking");
    setActiveSkillId(null);
    pinnedRef.current = true;
    stopRef.current = false;

    const ac = new AbortController();
    abortRef.current = ac;

    // ── smooth typewriter reveal ──
    // `target` = everything received so far; `shownLen` = how much is on
    // screen. A rAF loop advances shownLen toward target at a steady pace so
    // the reply types out smoothly (like Claude) regardless of how bursty the
    // network deltas arrive. On stop, we jump to full.
    let target = "";
    let shownLen = 0;
    let streamDone = false;
    let rafId = null;
    let wroteText = false;
    const paint = () => {
      if (shownLen > target.length) shownLen = target.length;
      const text = target.slice(0, shownLen);
      setMessages((p) => p.map((m) => m.id === aId ? { ...m, text } : m));
    };
    const reveal = () => {
      rafId = null;
      if (stopRef.current) { shownLen = target.length; paint(); return; }
      if (shownLen < target.length) {
        const behind = target.length - shownLen;
        const step = Math.max(1, Math.ceil(behind / 22)); // catch up when far behind
        shownLen = Math.min(target.length, shownLen + step);
        paint();
      }
      if (!streamDone || shownLen < target.length) rafId = requestAnimationFrame(reveal);
    };
    const ensureReveal = () => { if (rafId === null && !stopRef.current) rafId = requestAnimationFrame(reveal); };

    try {
      const threadId = await ensureThread();
      const resp = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ threadId, userMessage: userText }),
        signal: ac.signal,
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!resp.ok || !resp.body) {
        throw new Error(resp.status === 401 ? "Your session expired — sign in again." : "AlterEgo is unavailable right now.");
      }

      const reader = resp.body.getReader();
      const dec = new TextDecoder("utf-8");
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("data:")) data += line.slice(5).replace(/^ /, "");
          }
          if (!data || data === "[DONE]") continue;
          let ev;
          try { ev = JSON.parse(data); } catch (e) { continue; }
          if (ev.type === "text_delta") {
            if (!wroteText) { wroteText = true; setStatus("Writing"); }
            target = aeStripEmoji(target + (ev.text || ev.delta || ""));
            ensureReveal();
          } else if (ev.type === "sub_agent_start") {
            const name = ev.sub_agent_name || ev.sub_agent || "a specialist";
            setStatus("Consulting " + name.charAt(0).toUpperCase() + name.slice(1));
          } else if (ev.type === "sub_agent_progress") {
            if (ev.message) setStatus(ev.message);
          } else if (ev.type === "sub_agent_result") {
            // Result folds into the model's own reply — no placeholder text.
            if (!wroteText) setStatus("Composing");
          } else if (ev.type === "final_usage") {
            // CR14: attach the real model attribution to this assistant turn.
            if (ev.model) setMessages((p) => p.map((m) => m.id === aId ? { ...m, model: ev.model } : m));
          } else if (ev.type === "error") {
            setError(ev.message || "Something went wrong.");
          }
        }
      }
    } catch (e) {
      if (e && e.name !== "AbortError") setError((e && e.message) || "Could not reach AlterEgo.");
    } finally {
      streamDone = true;
      ensureReveal(); // let the reveal drain to the full text
      setInFlight(false);
      setStatus(null);
      if (abortRef.current === ac) abortRef.current = null;
      if (t.readAloud && target) speak(target);
    }
  }, [t.readAloud, speak, ensureThread]);

  const handleSubmit = auseCallback(({ text, attachments }) => {
    if (inFlight) return;
    if (t.readAloud) unlockAudio(); // unlock iOS audio during this tap so the reply can auto-read
    let composed = text;
    if (attachments && attachments.length) {
      const labels = attachments.map((a) => `[${a.kind}: ${a.name}]`).join(" ");
      composed = (text ? text + "\n\n" : "") + "Attached: " + labels;
    }
    if (!composed && !activeSkill) return;
    runTurn(composed || activeSkill.name + " — go.", attachments, activeSkill ? activeSkill.id : null);
  }, [inFlight, activeSkill, runTurn, t.readAloud, unlockAudio]);

  // Toggle Read-aloud. Turning it ON is a user gesture — unlock iOS audio then
  // so subsequent replies can auto-read without a separate tap.
  const toggleReadAloud = auseCallback(() => {
    const next = !t.readAloud;
    if (next) unlockAudio();
    setTweak("readAloud", next);
  }, [t.readAloud, unlockAudio, setTweak]);

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

  const handleStop = auseCallback(() => { stopRef.current = true; if (abortRef.current) abortRef.current.abort(); setInFlight(false); stopAudio(); }, [stopAudio]);

  const scrollToBottom = auseCallback(() => {
    const el = scrollerRef.current; if (!el) return;
    pinnedRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowDown(false);
  }, []);

  const newChat = auseCallback(() => {
    threadRef.current = null; // next message starts a fresh real thread
    setMessages([]); setError(null); setActiveSkillId(null); setActiveChatId(null); setNavOpen(false); setActiveNav("home");
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const toggleFolder = auseCallback((id) => {
    setOpenFolders((prev) => prev.indexOf(id) !== -1 ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const selectChat = auseCallback((id) => {
    threadRef.current = null; // library chats are not yet backed by real threads
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
            <button className={"ae-tb-btn" + (t.readAloud ? " ae-tb-btn--on" : "")} onClick={toggleReadAloud} title="Read replies aloud" aria-pressed={t.readAloud}>
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
                  // Empty in-flight assistant turn: no bubble — the WorkingBar
                  // below shows the live activity instead.
                  if (m.role === "assistant" && !m.text && !m.result) return null;
                  return (
                    <MessageTurn key={m.id} msg={m} skills={skills} isStreamingTail={isTail}
                      onAction={handleAction} onSpeak={speak} />
                  );
                })}
                {inFlight ? <WorkingBar label={status} /> : null}
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
            skills={skills} ttsOn={t.readAloud} onToggleTts={toggleReadAloud} />
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
