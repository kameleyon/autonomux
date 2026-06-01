/**
 * apps/web/components/chat/ThreadRow.tsx
 *
 * Client island. One row in the chat sidebar. Owns the local UI state
 * for the hover kebab → popover (Rename / Archive / Delete), the inline
 * rename input, and the two-step Delete confirmation. Each destructive
 * action is a `<form action={serverAction}>` so the actual mutation
 * runs on the server (see `apps/web/app/app/chat/actions.ts`).
 *
 * Variants:
 *   - "active"   — full menu: Rename · Archive · Delete
 *   - "archived" — Unarchive · Delete (no Rename — archived threads
 *                   keep their last name; users can unarchive to edit).
 *
 * a11y:
 *   - The kebab is a `<button aria-haspopup="menu">` with aria-expanded.
 *   - The popover is `role="menu"`; items are `role="menuitem"`.
 *   - Esc closes the popover and cancels rename.
 *   - Outside-click closes the popover.
 *
 * Owner: [Cluster C · Forge]
 */

"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type { ChatThreadRow } from "@/lib/chat/types";
import {
  archiveThread,
  deleteThread,
  renameThread,
  unarchiveThread,
} from "@/app/app/chat/actions";

export interface ThreadRowProps {
  thread: ChatThreadRow;
  isActive: boolean;
  variant: "active" | "archived";
}

/** Delete confirmation auto-resets after this many ms of inactivity. */
const DELETE_CONFIRM_RESET_MS = 3000;

export function ThreadRow({
  thread,
  isActive,
  variant,
}: ThreadRowProps): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const rowRef = useRef<HTMLLIElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const deleteResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();

  const closeMenu = useCallback((): void => {
    setMenuOpen(false);
    setDeleteArmed(false);
    if (deleteResetTimer.current !== null) {
      clearTimeout(deleteResetTimer.current);
      deleteResetTimer.current = null;
    }
  }, []);

  /* Outside-click + Esc close the popover. We listen at the document
   * level only while the menu is open so we don't leak a global listener
   * across rows. */
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointer = (ev: MouseEvent): void => {
      if (rowRef.current === null) return;
      if (!rowRef.current.contains(ev.target as Node)) {
        closeMenu();
      }
    };
    const handleKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen, closeMenu]);

  /* Auto-reset the delete confirmation after 3s of no second click. */
  useEffect(() => {
    if (!deleteArmed) return;
    deleteResetTimer.current = setTimeout(() => {
      setDeleteArmed(false);
      deleteResetTimer.current = null;
    }, DELETE_CONFIRM_RESET_MS);
    return () => {
      if (deleteResetTimer.current !== null) {
        clearTimeout(deleteResetTimer.current);
        deleteResetTimer.current = null;
      }
    };
  }, [deleteArmed]);

  /* When the user picks Rename, flip to edit mode + focus + select. */
  useEffect(() => {
    if (!renaming) return;
    const input = renameInputRef.current;
    if (input === null) return;
    input.focus();
    input.select();
  }, [renaming]);

  const onKebabClick = useCallback(
    (ev: React.MouseEvent<HTMLButtonElement>): void => {
      ev.preventDefault();
      ev.stopPropagation();
      setMenuOpen((open) => !open);
      setDeleteArmed(false);
    },
    [],
  );

  const onRenamePick = useCallback((): void => {
    setMenuOpen(false);
    setRenaming(true);
  }, []);

  const onRenameKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLInputElement>): void => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        setRenaming(false);
      }
      /* Enter submits via the form's default — no handler needed. */
    },
    [],
  );

  const onDeleteClick = useCallback(
    (ev: React.MouseEvent<HTMLButtonElement>): void => {
      if (!deleteArmed) {
        /* First click: arm the button. The form's actual submit fires
         * only on the second click (because we preventDefault here). */
        ev.preventDefault();
        setDeleteArmed(true);
      }
      /* Second click falls through to the form submit. */
    },
    [deleteArmed],
  );

  const stamp = thread.last_message_at ?? thread.updated_at ?? thread.created_at;

  return (
    <li ref={rowRef} className="thread-list-row">
      {renaming ? (
        <form
          action={renameThread}
          className="thread-rename-form"
          onKeyDown={(ev) => {
            if (ev.key === "Escape") {
              ev.preventDefault();
              setRenaming(false);
            }
          }}
        >
          <input type="hidden" name="threadId" value={thread.id} />
          <input
            ref={renameInputRef}
            type="text"
            name="newTitle"
            defaultValue={thread.title}
            maxLength={140}
            className="thread-rename-input"
            aria-label="Rename conversation"
            onKeyDown={onRenameKeyDown}
          />
          <div className="thread-rename-actions">
            <button
              type="button"
              className="thread-rename-btn"
              onClick={() => setRenaming(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="thread-rename-btn thread-rename-btn--primary"
            >
              Save
            </button>
          </div>
        </form>
      ) : (
        <>
          <Link
            href={`/app/chat/${thread.id}`}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "thread-list-item thread-list-item--active"
                : "thread-list-item"
            }
            style={{
              display: "block",
              padding: "10px 12px",
              paddingRight: "36px",
              borderRadius: "var(--r-md)",
              background: isActive ? "rgba(0, 0, 0, 0.05)" : "transparent",
              color: "var(--ink)",
              textDecoration: "none",
              transition: "background 120ms",
            }}
          >
            <div
              style={{
                fontSize: "var(--fs-body-sm)",
                color: isActive ? "var(--ink)" : "var(--ink-soft)",
                fontWeight: isActive ? 500 : 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {thread.title}
            </div>
            <div
              style={{
                marginTop: "var(--sp-2)",
                fontFamily: "DM Mono, monospace",
                fontSize: "calc(var(--fs-mono-meta) * 0.95)",
                color: "var(--muted)",
                letterSpacing: "0.05em",
              }}
            >
              {formatStamp(stamp)}
            </div>
          </Link>

          <button
            type="button"
            className="thread-actions-kebab"
            aria-label={`Open actions for ${thread.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            data-open={menuOpen ? "true" : "false"}
            onClick={onKebabClick}
          >
            <span aria-hidden="true">⋯</span>
          </button>

          {menuOpen ? (
            <div
              id={menuId}
              role="menu"
              aria-label="Thread actions"
              className="thread-actions-menu"
              onClick={(ev) => ev.stopPropagation()}
            >
              {variant === "active" ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="thread-actions-menu-item"
                    onClick={onRenamePick}
                  >
                    Rename
                  </button>
                  <form
                    action={archiveThread}
                    className="thread-actions-menu-form"
                  >
                    <input
                      type="hidden"
                      name="threadId"
                      value={thread.id}
                    />
                    <button
                      type="submit"
                      role="menuitem"
                      className="thread-actions-menu-item"
                      onClick={() => setMenuOpen(false)}
                    >
                      Archive
                    </button>
                  </form>
                </>
              ) : (
                <form
                  action={unarchiveThread}
                  className="thread-actions-menu-form"
                >
                  <input
                    type="hidden"
                    name="threadId"
                    value={thread.id}
                  />
                  <button
                    type="submit"
                    role="menuitem"
                    className="thread-actions-menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    Unarchive
                  </button>
                </form>
              )}

              <form
                action={deleteThread}
                className="thread-actions-menu-form"
              >
                <input type="hidden" name="threadId" value={thread.id} />
                <button
                  type="submit"
                  role="menuitem"
                  className="thread-actions-menu-item thread-actions-menu-item--danger"
                  data-armed={deleteArmed ? "true" : "false"}
                  onClick={onDeleteClick}
                >
                  {deleteArmed ? "Click again to delete" : "Delete"}
                </button>
              </form>
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}

function formatStamp(iso: string | null): string {
  if (iso === null) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
