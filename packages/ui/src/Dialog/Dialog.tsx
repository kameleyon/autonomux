"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

export type DialogRole = "dialog" | "alertdialog";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Accessible label for the dialog. EITHER pass `title` (string) — we
   * render it as a heading + tie it to aria-labelledby — OR pass
   * `ariaLabel` (string) for an unlabeled dialog.
   */
  title?: string;
  ariaLabel?: string;
  description?: string;
  /** Use "alertdialog" when the dialog interrupts and demands a decision. */
  role?: DialogRole;
  /** Disables backdrop-click close. ESC always closes per APG. */
  dismissibleOnBackdrop?: boolean;
  children?: ReactNode;
  /** Optional class for the panel. */
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Dialog — APG-correct modal dialog / alertdialog.
 *
 * Accessibility (WAI-ARIA APG · modal dialog pattern):
 * - Backdrop is a real <button tabIndex={-1}> (not a div+onClick) so SR
 *   announces nothing and keyboard never lands on it.
 * - Panel has role="dialog" | "alertdialog" + aria-modal="true".
 * - aria-labelledby points at the title; aria-describedby at description.
 * - ESC closes. Focus is trapped via Tab/Shift+Tab inside the panel.
 * - On open: focus first focusable. On close: focus returns to opener.
 * - Background is inert (we set body[data-az-dialog-open] so consumers can
 *   apply aria-hidden / inert if needed; we don't mutate sibling roots
 *   because the host owns DOM structure).
 *
 * Important: Dialog renders inline (not portaled). For most app layouts
 * this is fine — z-index in CSS handles stacking. If you need a portal,
 * wrap with React's createPortal at the call site.
 */
export function Dialog(props: DialogProps) {
  const {
    open,
    onClose,
    title,
    ariaLabel,
    description,
    role = "dialog",
    dismissibleOnBackdrop = true,
    children,
    className,
  } = props;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);
  const reactId = useId();
  const titleId = title ? `az-dialog-title-${reactId}` : undefined;
  const descId = description ? `az-dialog-desc-${reactId}` : undefined;

  // Capture opener + initial focus + body lock when opening.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    if (typeof document !== "undefined") {
      document.body.setAttribute("data-az-dialog-open", "true");
    }
    // Focus first focusable inside panel (microtask wait for content paint).
    const id = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) {
        first.focus();
      } else {
        panel.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(id);
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-az-dialog-open");
      }
      // Return focus to opener.
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) {
        opener.focus();
      }
    };
  }, [open]);

  // ESC handler at document level (APG: ESC closes dialog).
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [open, onClose]);

  // Focus trap on Tab / Shift+Tab inside the panel.
  const onPanelKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => !el.hasAttribute("inert"));
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  const onBackdropClick = useCallback(
    (_e: MouseEvent<HTMLButtonElement>) => {
      if (dismissibleOnBackdrop) onClose();
    },
    [dismissibleOnBackdrop, onClose],
  );

  if (!open) return null;

  const computedAriaLabel =
    !titleId && ariaLabel ? ariaLabel : undefined;

  return (
    <div className="az-dialog-root">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="az-dialog__backdrop"
        onClick={onBackdropClick}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-label={computedAriaLabel}
        className={["az-dialog__panel", className ?? ""]
          .filter(Boolean)
          .join(" ")}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
      >
        {title ? (
          <h2 id={titleId} className="az-dialog__title">
            {title}
          </h2>
        ) : null}
        {description ? (
          <p id={descId} className="az-dialog__desc">
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
