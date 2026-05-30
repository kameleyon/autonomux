"use client";

/**
 * ViewHistoryButton — opens a Dialog showing the last 50 audit_log rows
 * for `resource_type='feature_flag' AND resource_id=key`.
 *
 * History is fetched lazily on open via the `fetchHistoryAction` Server
 * Action, so closing the row doesn't hold history in memory.
 *
 * Owner: [Forge + Comply]
 */

import { useState, useTransition } from "react";

import { Dialog } from "@autonomux/ui/Dialog";

import { fetchFlagHistoryAction } from "./history-action";
import type { FlagAuditEntryDto } from "./history-action";

export interface ViewHistoryButtonProps {
  flagKey: string;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function ViewHistoryButton(
  props: ViewHistoryButtonProps,
): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<FlagAuditEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openDialog(): void {
    setOpen(true);
    setError(null);
    startTransition(async () => {
      const result = await fetchFlagHistoryAction(props.flagKey);
      if (result.ok) {
        setEntries(result.entries);
      } else {
        setError(result.message);
      }
    });
  }

  function close(): void {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="adm-cta adm-cta--ghost"
        onClick={openDialog}
        aria-label={`View change history for ${props.flagKey}`}
      >
        View history
      </button>
      <Dialog
        open={open}
        onClose={close}
        title={`History · ${props.flagKey}`}
        description="Audit log for this flag, newest first."
      >
        {isPending ? (
          <p role="status" aria-live="polite">
            Loading…
          </p>
        ) : error !== null ? (
          <p role="alert" style={{ color: "var(--brand-wine)" }}>
            {error}
          </p>
        ) : entries === null || entries.length === 0 ? (
          <p>No history yet for this flag.</p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              maxHeight: "24rem",
              overflowY: "auto",
            }}
          >
            {entries.map((entry) => (
              <li
                key={entry.id}
                style={{
                  padding: "var(--sp-12) 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontFamily: "DM Mono, monospace",
                    fontSize: "var(--fs-body-sm)",
                    color: "var(--ink-soft)",
                  }}
                >
                  {formatTimestamp(entry.created_at)} · {entry.actor_kind}
                  {entry.actor_user_id !== null
                    ? ` · ${entry.actor_user_id.slice(0, 8)}`
                    : ""}
                </div>
                <div style={{ fontWeight: 500, marginTop: "var(--sp-4)" }}>
                  {entry.action}
                </div>
                <pre
                  style={{
                    fontFamily: "DM Mono, monospace",
                    fontSize: "var(--fs-body-sm)",
                    background: "var(--surface-warm)",
                    padding: "var(--sp-8)",
                    borderRadius: "6px",
                    overflowX: "auto",
                    marginTop: "var(--sp-4)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "var(--sp-16)",
          }}
        >
          <button type="button" className="adm-cta" onClick={close}>
            Close
          </button>
        </div>
      </Dialog>
    </>
  );
}
