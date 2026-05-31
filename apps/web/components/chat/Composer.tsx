"use client";

/**
 * apps/web/components/chat/Composer.tsx
 *
 * Auto-growing textarea + send button + attachment chips.
 *
 * Keyboard
 *   - Enter → send.
 *   - Shift + Enter → newline.
 *
 * Attachments (Claude.ai-style)
 *   - Click the paperclip → file picker (multi-select).
 *   - Drag + drop files onto the composer.
 *   - Paste an image or PDF from the clipboard → chip.
 *   - Paste plain text > LARGE_PASTE_CHARS (15 000) → chip (as a .txt
 *     attachment) instead of stuffing the textarea.
 *
 * Accepted types: png, jpeg, gif, webp, pdf, text/* (md/csv/json/plain).
 * Max 5 MB per file; max 5 attachments per turn.
 *
 * The Composer is presentational: it bundles `{ text, attachments[] }`
 * into a single `onSubmit` payload and lets the parent decide what to
 * do with the FileList. The parent (ChatStream) uploads + sends.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_CHARS = 12_000;
/**
 * Threshold at which a paste auto-converts into a `.txt` attachment instead
 * of inserting into the textarea. claude.ai uses ~15k for this; we use a
 * smaller number so it fires reliably BEFORE the textarea's MAX_CHARS cap
 * (otherwise a paste in the 12k–15k range would silently get truncated by
 * the onChange slicer instead of becoming a chip).
 */
const LARGE_PASTE_CHARS = 6_000;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ACCEPTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

export interface ComposerSubmitPayload {
  readonly text: string;
  readonly attachments: ReadonlyArray<File>;
}

export interface ComposerProps {
  disabled: boolean;
  onSubmit: (payload: ComposerSubmitPayload) => void;
}

interface AttachmentItem {
  readonly id: string;
  readonly file: File;
}

export function Composer({
  disabled,
  onSubmit,
}: ComposerProps): React.ReactElement {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta === null) return;
    // Start at 3 lines, grow to 9 lines max. Scrollbar shows up only when
    // content exceeds the cap (overflow-y: auto + a "polite" scrollbar
    // style applied via the className below).
    ta.style.height = "auto";
    ta.style.height = `${Math.min(Math.max(ta.scrollHeight, 84), 220)}px`;
  }, [value]);

  const wasDisabledRef = useRef(disabled);
  useEffect(() => {
    if (wasDisabledRef.current && !disabled) {
      textareaRef.current?.focus();
    }
    wasDisabledRef.current = disabled;
  }, [disabled]);

  const addFiles = useCallback(
    (incoming: ReadonlyArray<File>): void => {
      setWarning(null);
      const accepted: AttachmentItem[] = [];
      for (const f of incoming) {
        if (attachments.length + accepted.length >= MAX_FILES) {
          setWarning(`Max ${MAX_FILES} attachments per message.`);
          break;
        }
        if (f.size > MAX_FILE_BYTES) {
          setWarning(`"${f.name}" is larger than 5 MB.`);
          continue;
        }
        if (!ACCEPTED_MIME.has(f.type) && !f.type.startsWith("text/")) {
          setWarning(`"${f.name}" is an unsupported file type.`);
          continue;
        }
        accepted.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
        });
      }
      if (accepted.length > 0) {
        setAttachments((prev) => [...prev, ...accepted]);
      }
    },
    [attachments.length],
  );

  const removeAttachment = useCallback((id: string): void => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
      const cd = e.clipboardData;
      if (cd === null) return;

      // Files first (images, PDFs from the OS clipboard).
      if (cd.files.length > 0) {
        e.preventDefault();
        addFiles(Array.from(cd.files));
        return;
      }

      // Large text paste → attachment.
      const text = cd.getData("text/plain");
      if (text.length >= LARGE_PASTE_CHARS) {
        e.preventDefault();
        const f = new File(
          [text],
          `pasted-text-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.txt`,
          { type: "text/plain" },
        );
        addFiles([f]);
      }
    },
    [addFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLFormElement>): void => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) addFiles(files);
    },
    [addFiles],
  );

  const submit = useCallback((): void => {
    const trimmed = value.trim();
    if (disabled) return;
    if (trimmed.length === 0 && attachments.length === 0) return;
    onSubmit({
      text: trimmed,
      attachments: attachments.map((a) => a.file),
    });
    setValue("");
    setAttachments([]);
    setWarning(null);
  }, [value, attachments, disabled, onSubmit]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className="app-shell-composer"
      style={{
        padding: "var(--sp-12) var(--sp-20) var(--sp-16) var(--sp-20)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-8)",
        outline: dragOver
          ? "2px dashed var(--brand-orange)"
          : "2px solid transparent",
        outlineOffset: "-4px",
        borderRadius: "var(--r-md)",
        transition: "outline-color 120ms",
      }}
    >
      {attachments.length > 0 && (
        <ul
          aria-label="Attachments"
          style={{
            listStyle: "none",
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--sp-6)",
            margin: 0,
            padding: 0,
          }}
        >
          {attachments.map((a) => (
            <li
              key={a.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--sp-8)",
                padding: "var(--sp-6) var(--sp-10)",
                borderRadius: "var(--r-md)",
                background: "rgba(0,0,0,0.06)",
                border: "1px solid rgba(0,0,0,0.1)",
                fontSize: "var(--fs-body-sm)",
                color: "var(--ink)",
                maxWidth: "260px",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "var(--fs-mono-meta)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--brand-orange)",
                }}
              >
                {fileKindLabel(a.file)}
              </span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
                title={a.file.name}
              >
                {a.file.name}
              </span>
              <span style={{ color: "var(--muted)" }}>
                {formatBytes(a.file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`Remove ${a.file.name}`}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ink-soft)",
                  fontSize: "var(--fs-body)",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor="chat-composer-input" className="visually-hidden">
        Message AlterEgo
      </label>
      <textarea
        id="chat-composer-input"
        ref={textareaRef}
        className="composer-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        onPaste={handlePaste}
        rows={3}
        placeholder={
          disabled
            ? "Streaming response…"
            : "Ask AlterEgo. Enter to send, Shift+Enter for a new line. Paste or drop a file to attach."
        }
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby="chat-composer-hint"
        style={{
          width: "100%",
          minHeight: "84px",
          maxHeight: "220px",
          resize: "none",
          padding: "var(--sp-10) var(--sp-12)",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border-strong)",
          background: "var(--brand-white)",
          color: "var(--ink)",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "var(--fs-body-sm)",
          lineHeight: "var(--lh-body)",
          outline: "none",
          overflowY: "auto",
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={Array.from(ACCEPTED_MIME).join(",") + ",text/*"}
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files !== null) {
            addFiles(Array.from(e.target.files));
            e.target.value = "";
          }
        }}
      />

      {warning !== null && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: "var(--fs-body-sm)",
            color: "var(--brand-red)",
          }}
        >
          {warning}
        </p>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-8)" }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label="Attach files"
            title="Attach files (paste or drop also works)"
            style={{
              background: "transparent",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-md)",
              padding: "var(--sp-6) var(--sp-10)",
              cursor: disabled ? "not-allowed" : "pointer",
              fontSize: "var(--fs-body)",
              color: "var(--ink-soft)",
              lineHeight: 1,
            }}
          >
            ⎘
          </button>
          <p
            id="chat-composer-hint"
            aria-live="polite"
            style={{
              margin: 0,
              fontFamily: "DM Mono, monospace",
              fontSize: "var(--fs-mono-meta)",
              color: "var(--muted)",
              letterSpacing: "0.08em",
            }}
          >
            {value.length} / {MAX_CHARS}
            {attachments.length > 0
              ? ` · ${attachments.length}/${MAX_FILES} files`
              : ""}
            <span style={{ marginLeft: "var(--sp-12)" }}>
              Enter sends · Shift+Enter newline
            </span>
          </p>
        </div>
        <button
          type="submit"
          disabled={
            disabled ||
            (value.trim().length === 0 && attachments.length === 0)
          }
          aria-disabled={
            disabled ||
            (value.trim().length === 0 && attachments.length === 0)
          }
          style={{
            background:
              disabled ||
              (value.trim().length === 0 && attachments.length === 0)
                ? "var(--muted-soft)"
                : "var(--brand-orange)",
            color: "var(--brand-white)",
            border: "none",
            borderRadius: "var(--r-md)",
            padding: "var(--sp-10) var(--sp-20)",
            fontSize: "var(--fs-body-sm)",
            fontWeight: 500,
            cursor:
              disabled ||
              (value.trim().length === 0 && attachments.length === 0)
                ? "not-allowed"
                : "pointer",
            transition: "background 120ms",
          }}
        >
          {disabled ? "Streaming…" : "Send"}
        </button>
      </div>
    </form>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fileKindLabel(f: File): string {
  if (f.type.startsWith("image/")) return "img";
  if (f.type === "application/pdf") return "pdf";
  if (f.type.startsWith("text/") || f.type === "application/json") return "txt";
  return "file";
}
