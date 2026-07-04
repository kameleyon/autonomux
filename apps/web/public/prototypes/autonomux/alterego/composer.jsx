/* ============================================================
   AlterEgo — Composer (React, Babel) → window
   ============================================================ */
const { useState: cuseState, useEffect: cuseEffect, useRef: cuseRef, useCallback: cuseCallback } = React;
const Icon = window.Icon;

const AE_MAX_CHARS = 12000;
const AE_LARGE_PASTE = 6000;
const AE_MAX_FILES = 5;
const AE_MAX_BYTES = 50 * 1024 * 1024;

function aeFileKind(file) {
  if (file.type.startsWith("image/")) return "img";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.includes("word") || /\.docx?$/i.test(file.name)) return "doc";
  if (file.type.startsWith("text/") || file.type === "application/json") return "txt";
  return "file";
}

function Composer({ disabled, onSubmit, onStop, activeSkill, onClearSkill, onSetSkill, skills, ttsOn, onToggleTts }) {
  const [value, setValue] = cuseState("");
  const [atts, setAtts] = cuseState([]);
  const [dragOver, setDragOver] = cuseState(false);
  const [warning, setWarning] = cuseState(null);
  const [listening, setListening] = cuseState(false);
  const [showCmd, setShowCmd] = cuseState(false);
  const [cmdQuery, setCmdQuery] = cuseState("");
  const taRef = cuseRef(null);
  const fileRef = cuseRef(null);
  const recogRef = cuseRef(null);
  const baseValueRef = cuseRef("");

  // auto-grow
  cuseEffect(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(Math.max(ta.scrollHeight, 26), 200) + "px";
  }, [value]);

  cuseEffect(() => {
    if (!disabled) taRef.current && taRef.current.focus();
  }, [disabled]);

  const addFiles = cuseCallback((incoming) => {
    setWarning(null);
    const next = [];
    for (const f of incoming) {
      if (atts.length + next.length >= AE_MAX_FILES) { setWarning(`Max ${AE_MAX_FILES} attachments.`); break; }
      if (f.type.startsWith("video/")) { setWarning("Video isn't supported yet — PDFs, docs, and images only."); continue; }
      if (f.size > AE_MAX_BYTES) { setWarning(`"${f.name}" is over 50 MB.`); continue; }
      const kind = aeFileKind(f);
      const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, kind, file: f, url: null };
      if (kind === "img") item.url = URL.createObjectURL(f);
      next.push(item);
    }
    if (next.length) setAtts((p) => [...p, ...next]);
  }, [atts.length]);

  const addLink = cuseCallback(() => {
    const url = window.prompt("Paste a link to attach:");
    if (!url) return;
    let host = url; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {}
    setAtts((p) => p.length >= AE_MAX_FILES ? p : [...p, { id: `link-${Date.now()}`, name: host, kind: "link", url: null, href: url }]);
  }, []);

  const removeAtt = (id) => setAtts((p) => p.filter((a) => a.id !== id));

  const onChange = (e) => {
    const v = e.target.value.slice(0, AE_MAX_CHARS);
    setValue(v);
    // command menu: show when line starts with "/" and no space yet
    const m = /(^|\n)\/(\w*)$/.exec(v);
    if (m) { setShowCmd(true); setCmdQuery(m[2].toLowerCase()); }
    else setShowCmd(false);
  };

  const onPaste = (e) => {
    const cd = e.clipboardData; if (!cd) return;
    if (cd.files && cd.files.length > 0) { e.preventDefault(); addFiles(Array.from(cd.files)); return; }
    const text = cd.getData("text/plain");
    if (text && text.length >= AE_LARGE_PASTE) {
      e.preventDefault();
      const f = new File([text], `pasted-${Date.now().toString().slice(-6)}.txt`, { type: "text/plain" });
      addFiles([f]);
    }
  };

  const submit = () => {
    if (disabled) return;
    let text = value.trim();
    // strip a leading /command token if present
    text = text.replace(/^\/(\w+)\s*/, "");
    if (text.length === 0 && atts.length === 0 && !activeSkill) return;
    onSubmit({
      text,
      attachments: atts.map((a) => ({ name: a.name, kind: a.kind, url: a.url })),
    });
    setValue(""); setAtts([]); setWarning(null); setShowCmd(false);
  };

  const pickCommand = (skill) => {
    onSetSkill(skill.id);
    setValue((v) => v.replace(/(^|\n)\/\w*$/, "$1"));
    setShowCmd(false);
    taRef.current && taRef.current.focus();
  };

  // ── Speech to text (record → Lemonfox transcription) ──
  // MediaRecorder works on iOS Safari where the Web Speech API does not.
  // Tap once to start recording, tap again to stop + transcribe.
  const toggleMic = async () => {
    if (listening) { // stop + transcribe
      try { recogRef.current && recogRef.current.recorder.stop(); } catch (e) {}
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof window.MediaRecorder === "undefined") {
      setWarning("Voice input isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        setListening(false);
        stream.getTracks().forEach((t) => t.stop());
        recogRef.current = null;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1200) return; // too short to be speech
        setWarning("Transcribing…");
        try {
          const fd = new FormData();
          fd.append("file", blob, "speech.webm");
          const r = await fetch("/api/voice/stt", { method: "POST", body: fd, credentials: "same-origin" });
          if (!r.ok) throw new Error("stt " + r.status);
          const j = await r.json();
          const txt = (j.text || "").trim();
          setWarning(null);
          if (txt) setValue((v) => ((v ? v + " " : "") + txt).slice(0, AE_MAX_CHARS));
        } catch (e) {
          setWarning("Couldn't transcribe that. Try again.");
        }
      };
      recogRef.current = { recorder, stream };
      recorder.start();
      setListening(true);
    } catch (e) {
      setWarning("Microphone permission denied.");
    }
  };

  const isEmpty = value.trim().length === 0 && atts.length === 0;
  const showStop = disabled && typeof onStop === "function";
  const sendReady = !disabled && (!isEmpty || !!activeSkill);
  const overWarn = value.length >= AE_MAX_CHARS * 0.8;

  const cmdSkills = skills.filter((s) => !s.hidden && (!cmdQuery || s.id.startsWith(cmdQuery) || s.command.slice(1).startsWith(cmdQuery)));

  return (
    <div className="ae-composer-band">
      <div className="composer-wrap">
        {/* active skill bar */}
        {activeSkill ? (
          <div className="ae-skillbar">
            <span className="ae-skillbar-chip ae-skillbar-chip--active">
              {activeSkill.name}
              <button className="ae-skillbar-clear" onClick={onClearSkill} aria-label="Clear skill" title="Clear skill">×</button>
            </span>
            <span className="ae-skillbar-desc">{activeSkill.desc}</span>
          </div>
        ) : null}

        {/* command menu */}
        {showCmd ? (
          <div className="ae-cmd-menu" role="listbox" aria-label="Skills">
            <div className="ae-cmd-menu-label">Hand a task to a sub-agent</div>
            {cmdSkills.map((s) => (
              <button key={s.id} className="ae-cmd-item" onClick={() => pickCommand(s)}>
                <span className="ae-cmd-mark">{s.mark}</span>
                <span className="ae-cmd-text">
                  <span className="ae-cmd-name"><span className="ae-cmd-slash">{s.command}</span>{s.name}</span>
                  <span className="ae-cmd-desc">{s.desc}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="composer-card"
          data-dragover={dragOver ? "true" : "false"}
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const fs = Array.from(e.dataTransfer.files || []); if (fs.length) addFiles(fs); }}
        >
          {atts.length > 0 ? (
            <ul className="composer-atts" aria-label="Attachments">
              {atts.map((a) => (
                <li key={a.id} className="composer-att">
                  {a.url ? <img src={a.url} alt="" /> : <span className="ae-att-kind">{a.kind}</span>}
                  <span className="ae-att-name" title={a.name}>{a.name}</span>
                  <button type="button" className="composer-att-x" onClick={() => removeAtt(a.id)} aria-label={`Remove ${a.name}`}>×</button>
                </li>
              ))}
            </ul>
          ) : null}

          <label htmlFor="ae-input" className="visually-hidden">Message AlterEgo</label>
          <textarea
            id="ae-input" ref={taRef} className="composer-textarea" rows={1}
            value={value} onChange={onChange} onPaste={onPaste}
            onKeyDown={(e) => {
              if (showCmd && e.key === "Enter" && cmdSkills.length) { e.preventDefault(); pickCommand(cmdSkills[0]); return; }
              if (e.key === "Escape") setShowCmd(false);
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder={disabled ? "AlterEgo is thinking…" : listening ? "Listening… speak now" : "Ask AlterEgo anything — or type / to hand off a task."}
            disabled={disabled}
          />

          <input ref={fileRef} type="file" multiple style={{ display: "none" }}
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/*,application/json,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => { if (e.target.files) { addFiles(Array.from(e.target.files)); e.target.value = ""; } }} />

          {warning ? <p role="alert" style={{ margin: 0, fontSize: "var(--fs-body-sm)", color: "var(--brand-red)" }}>{warning}</p> : null}

          <div className="composer-footer">
            <div className="composer-tools">
              <button type="button" className="composer-icon-btn" title="Attach a file (or paste / drop)" aria-label="Attach file" onClick={() => fileRef.current && fileRef.current.click()} disabled={disabled}><Icon name="Plus" size={18} /></button>
              <button type="button" className="composer-icon-btn" title="Attach a link" aria-label="Attach link" onClick={addLink} disabled={disabled}><Icon name="Link2" size={16} /></button>
              <button type="button" className={"composer-icon-btn" + (listening ? " composer-icon-btn--mic-on" : "")} title={listening ? "Stop listening" : "Speak to AlterEgo"} aria-label="Voice input" onClick={toggleMic} disabled={disabled}>
                <Icon name={listening ? "Square" : "Mic"} size={listening ? 14 : 17} />
              </button>
              <span className="composer-hint">/ for skills</span>
            </div>
            <div className="composer-right">
              <span className={"composer-count" + (overWarn ? " composer-count--warn" : "")}>
                {value.length.toLocaleString()}/{AE_MAX_CHARS.toLocaleString()}
              </span>
              {showStop ? (
                <button type="button" className="composer-send-btn composer-send-btn--stop" onClick={onStop} aria-label="Stop" title="Stop">
                  <span style={{ width: 10, height: 10, background: "currentColor", borderRadius: 2, display: "inline-block" }} />
                </button>
              ) : (
                <button type="submit" className={"composer-send-btn" + (sendReady ? " composer-send-btn--ready" : "")} disabled={!sendReady} aria-label="Send" title="Send (Enter)"><Icon name="ArrowUp" size={18} stroke={2} /></button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

Object.assign(window, { Composer });
