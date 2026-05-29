"use client";

/**
 * apps/web/components/CookiePreferencesDialog.tsx
 *
 * Modal opened from the banner's "Manage preferences" button.
 *
 * Three categories — Necessary (forced on), Analytics (opt-in), Marketing
 * (opt-in). Defaults are OFF for the opt-in toggles; that matters under
 * GDPR Recital 32 (consent must be a clear affirmative action — pre-
 * checked boxes are not valid consent, per CJEU Planet49 C-673/17).
 *
 * Accessibility:
 * - Built on @autonomux/ui Dialog — focus-trap, ESC closes, focus returns
 *   to the opener (the "Manage preferences" button in the banner).
 * - The Necessary toggle is `aria-disabled` + visually disabled with a
 *   short explanation tied to the control via `aria-describedby`.
 * - Save / Cancel are real <button>s with focus-visible rings inherited
 *   from globals.css.
 *
 * Owner: [Comply + Halo] · Phase 1.0-B9
 */

import { useEffect, useId, useState } from "react";
import { Button, Dialog } from "@autonomux/ui";
import type { ConsentState } from "@/lib/consent-cookie";

interface CookiePreferencesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Currently-stored consent — toggles initialise from this. */
  initial: ConsentState;
  /** Save handler — caller writes the cookie + reacts however it needs to. */
  onSave: (next: { analytics: boolean; marketing: boolean }) => void;
}

export function CookiePreferencesDialog(
  props: CookiePreferencesDialogProps,
): React.ReactElement {
  const { open, onClose, initial, onSave } = props;

  const [analytics, setAnalytics] = useState<boolean>(initial.analytics);
  const [marketing, setMarketing] = useState<boolean>(initial.marketing);

  // Re-sync when the dialog re-opens with a different stored value.
  useEffect(() => {
    if (open) {
      setAnalytics(initial.analytics);
      setMarketing(initial.marketing);
    }
  }, [open, initial.analytics, initial.marketing]);

  const necessaryDescId = useId();
  const analyticsDescId = useId();
  const marketingDescId = useId();

  function handleSave(): void {
    onSave({ analytics, marketing });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cookie preferences"
      description="Choose which cookies autonomux may set. You can change this anytime in Settings."
      dismissibleOnBackdrop={false}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-16)",
          marginTop: "var(--sp-16)",
        }}
      >
        <ToggleRow
          name="necessary"
          label="Necessary"
          checked={true}
          disabled={true}
          descId={necessaryDescId}
          description="Required for sign-in and session. Always on."
          onChange={() => {
            /* no-op — necessary cannot be disabled */
          }}
        />
        <ToggleRow
          name="analytics"
          label="Analytics"
          checked={analytics}
          disabled={false}
          descId={analyticsDescId}
          description="Helps us see which features get used. No third-party advertising."
          onChange={setAnalytics}
        />
        <ToggleRow
          name="marketing"
          label="Marketing"
          checked={marketing}
          disabled={false}
          descId={marketingDescId}
          description="Lets us measure which ads brought you here. Off by default."
          onChange={setMarketing}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: "var(--sp-12)",
          marginTop: "var(--sp-24)",
          justifyContent: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave}>
          Save preferences
        </Button>
      </div>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  ToggleRow — accessible custom switch.
// ─────────────────────────────────────────────────────────────────────────

interface ToggleRowProps {
  name: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  descId: string;
  description: string;
  onChange: (next: boolean) => void;
}

function ToggleRow(props: ToggleRowProps): React.ReactElement {
  const { name, label, checked, disabled, descId, description, onChange } =
    props;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--sp-16)",
        padding: "var(--sp-12)",
        borderRadius: "var(--r-xl)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <label
          htmlFor={`consent-toggle-${name}`}
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
        id={`consent-toggle-${name}`}
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
          minWidth: 44, // 44px tap target
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
