"use client";

/**
 * apps/web/app/settings/consent/ConsentSettingsPanel.tsx
 *
 * The interactive part of /settings/consent. Mirrors the dialog's three
 * toggles, but as page content. Writes the same cookie.
 *
 * Owner: [Comply + Halo] · Phase 1.0-B9
 */

import { useEffect, useId, useState } from "react";
import { Button } from "@autonomux/ui";
import {
  buildCustomState,
  pendingConsent,
  readConsentCookie,
  writeConsentCookie,
  type ConsentState,
} from "@/lib/consent-cookie";

export function ConsentSettingsPanel(): React.ReactElement {
  const [consent, setConsent] = useState<ConsentState>(pendingConsent());
  const [analytics, setAnalytics] = useState<boolean>(false);
  const [marketing, setMarketing] = useState<boolean>(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const stored = readConsentCookie();
    setConsent(stored);
    setAnalytics(stored.analytics);
    setMarketing(stored.marketing);
  }, []);

  function handleSave(): void {
    const next = buildCustomState({ analytics, marketing });
    writeConsentCookie(next);
    setConsent(next);
    setSavedAt(new Date().toLocaleTimeString());
  }

  const necessaryDescId = useId();
  const analyticsDescId = useId();
  const marketingDescId = useId();
  const statusId = useId();

  const dirty =
    analytics !== consent.analytics || marketing !== consent.marketing;

  return (
    <div
      style={{
        maxWidth: 640,
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-16)",
      }}
    >
      <ToggleRow
        name="necessary"
        label="Necessary"
        description="Required for sign-in and session. Always on."
        descId={necessaryDescId}
        checked={true}
        disabled={true}
        onChange={() => {
          /* no-op */
        }}
      />
      <ToggleRow
        name="analytics"
        label="Analytics"
        description="Helps us see which features get used. No third-party advertising."
        descId={analyticsDescId}
        checked={analytics}
        disabled={false}
        onChange={setAnalytics}
      />
      <ToggleRow
        name="marketing"
        label="Marketing"
        description="Lets us measure which ads brought you here. Off by default."
        descId={marketingDescId}
        checked={marketing}
        disabled={false}
        onChange={setMarketing}
      />

      <div
        style={{
          display: "flex",
          gap: "var(--sp-12)",
          alignItems: "center",
          marginTop: "var(--sp-12)",
          flexWrap: "wrap",
        }}
      >
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!dirty}
          aria-describedby={statusId}
        >
          Save preferences
        </Button>
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          style={{
            margin: 0,
            fontSize: "var(--fs-body-sm)",
            color: "var(--muted)",
          }}
        >
          {savedAt
            ? `Saved at ${savedAt}.`
            : consent.state === "pending"
              ? "No preferences saved yet."
              : `Last saved ${new Date(consent.set_at).toLocaleString()}.`}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

interface ToggleRowProps {
  name: string;
  label: string;
  description: string;
  descId: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow(props: ToggleRowProps): React.ReactElement {
  const { name, label, description, descId, checked, disabled, onChange } =
    props;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--sp-16)",
        padding: "var(--sp-16)",
        borderRadius: "var(--r-xl)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <label
          htmlFor={`consent-settings-${name}`}
          style={{
            display: "block",
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 600,
            fontSize: "var(--fs-body)",
            color: "var(--ink)",
            marginBottom: "var(--sp-4)",
          }}
        >
          {label}
        </label>
        <p
          id={descId}
          style={{
            fontSize: "var(--fs-body-sm)",
            color: "var(--muted)",
            margin: 0,
          }}
        >
          {description}
        </p>
      </div>

      <button
        type="button"
        id={`consent-settings-${name}`}
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
        style={{
          flexShrink: 0,
          width: 52,
          height: 28,
          minWidth: 44,
          minHeight: 28,
          borderRadius: "var(--r-pill)",
          background: checked
            ? "var(--brand-orange)"
            : "var(--border-strong)",
          border: "none",
          padding: 0,
          position: "relative",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "background 160ms ease",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 27 : 3,
            width: 22,
            height: 22,
            borderRadius: "var(--r-pill)",
            background: "var(--brand-white)",
            transition: "left 160ms ease",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        />
        <span
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {checked ? "On" : "Off"}
        </span>
      </button>
    </div>
  );
}
