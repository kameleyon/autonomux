"use client";

/**
 * apps/web/components/chat/Composer.tsx
 *
 * Auto-growing textarea + send button. Submits via parent callback (the
 * ChatStream owns the in-flight state + SSE connection — Composer just
 * collects input).
 *
 * Keyboard:
 *   - Enter inserts a newline (so multi-line messages compose naturally).
 *   - Cmd/Ctrl+Enter submits.
 * Disabled while a turn is in-flight; the disabled state is fully
 * keyboard-discoverable via aria-disabled + a visible status string.
 *
 * a11y:
 *   - Labeled textarea (`<label htmlFor>`).
 *   - Live char counter in aria-live="polite" so SR users hear it without
 *     interruption.
 *   - Focus outline inherits the global var(--focus-ring) ring.
 *
 * Owner: [Cluster C · Vega + Forge + Halo]
 */

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_CHARS = 12_000; // mirrors the server cap in route.ts

export interface ComposerProps {
  disabled: boolean;
  /** Called with the trimmed user message. */
  onSubmit: (message: string) => void;
}

export function Composer({
  disabled,
  onSubmit,
}: ComposerProps): React.ReactElement {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: reset height, then push to scrollHeight. Capped via CSS
  // max-height so a 500-line paste doesn't fill the viewport.
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta === null) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [value]);

  // Re-focus the textarea when the in-flight stream completes — so the
  // user can immediately type their next turn without reaching for the
  // mouse. Only fires on the disabled→enabled edge.
  const wasDisabledRef = useRef(disabled);
  useEffect(() => {
    if (wasDisabledRef.current && !disabled) {
      textareaRef.current?.focus();
    }
    wasDisabledRef.current = disabled;
  }, [disabled]);

  const submit = useCallback((): void => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }, [value, disabled, onSubmit]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{
        borderTop: "1px solid var(--border)",
        padding: "var(--sp-16) var(--sp-20)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-8)",
      }}
    >
      <label
        htmlFor="chat-composer-input"
        className="visually-hidden"
      >
        Message AlterEgo
      </label>
      <textarea
        id="chat-composer-input"
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={
          disabled
            ? "Streaming response…"
            : "Ask AlterEgo to triage your inbox, draft a reply, or surface what changed."
        }
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby="chat-composer-hint"
        style={{
          width: "100%",
          minHeight: "44px",
          maxHeight: "240px",
          resize: "none",
          padding: "var(--sp-10) var(--sp-12)",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border-strong)",
          background: "var(--brand-white)",
          color: "var(--ink)",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "var(--fs-body)",
          lineHeight: "var(--lh-body)",
          outline: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-12)",
        }}
      >
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
          {value.length} / {MAX_CHARS} chars
          <span style={{ marginLeft: "var(--sp-12)" }}>
            Cmd/Ctrl + Enter to send
          </span>
        </p>
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          aria-disabled={disabled || value.trim().length === 0}
          style={{
            background:
              disabled || value.trim().length === 0
                ? "var(--muted-soft)"
                : "var(--brand-orange)",
            color: "var(--brand-white)",
            border: "none",
            borderRadius: "var(--r-md)",
            padding: "var(--sp-10) var(--sp-20)",
            fontSize: "var(--fs-body-sm)",
            fontWeight: 500,
            cursor:
              disabled || value.trim().length === 0
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
