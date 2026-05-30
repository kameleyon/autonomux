"use client";

/**
 * VerifyChainButton — fires `verifyChainAction` and renders the result.
 *
 * If no tenant filter is active, the global verification is expensive
 * (O(N) over the entire chain). We surface that risk with a confirm
 * dialog rendered inline — never `window.confirm`, which is suppressible
 * and inaccessible.
 *
 * Owner: [Forge + Vega]
 */
import { useId, useState, useTransition } from "react";

import {
  verifyChainAction,
  type VerifyChainResult,
} from "./actions";

export interface VerifyChainButtonProps {
  /** Tenant id from the current filter, if any. */
  tenantId: string | null;
}

export function VerifyChainButton({
  tenantId,
}: VerifyChainButtonProps): React.ReactElement {
  const statusId = useId();
  const titleId = useId();
  const descId = useId();

  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<VerifyChainResult | null>(null);

  function runVerify(): void {
    setResult(null);
    startTransition(() => {
      void verifyChainAction(tenantId).then((r) => {
        setResult(r);
        setConfirmOpen(false);
      });
    });
  }

  function handleClick(): void {
    if (tenantId === null || tenantId.length === 0) {
      setConfirmOpen(true);
      return;
    }
    runVerify();
  }

  return (
    <div>
      <button
        type="button"
        className="adm-cta"
        onClick={handleClick}
        disabled={isPending}
        aria-describedby={result !== null ? statusId : undefined}
      >
        {isPending ? "Verifying…" : "Verify chain"}
      </button>

      {confirmOpen ? (
        <div
          className="adm-dialog__backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
        >
          <div className="adm-dialog">
            <h2 id={titleId} className="adm-dialog__title">
              Verify entire chain?
            </h2>
            <p id={descId} className="adm-dialog__body">
              No tenant filter is set. Running verify against every
              tenant rescans the entire audit log — slow on a large
              database. Filter by tenant_id first if you only need a
              single slice.
            </p>
            <div className="adm-dialog__actions">
              <button
                type="button"
                className="adm-cta adm-cta--ghost"
                onClick={() => {
                  setConfirmOpen(false);
                }}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="adm-cta"
                onClick={runVerify}
                disabled={isPending}
              >
                {isPending ? "Verifying…" : "Verify all tenants"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {result !== null ? (
        <div
          id={statusId}
          role="status"
          aria-live="polite"
          className={
            result.error !== undefined
              ? "adm-status adm-status--alert"
              : result.ok
                ? "adm-status adm-status--ok"
                : "adm-status adm-status--alert"
          }
          style={{ marginTop: "var(--sp-12)" }}
        >
          {result.error !== undefined ? (
            <span>
              Chain verification failed to run: {result.error}
            </span>
          ) : result.ok ? (
            <span>
              Chain intact. Verified {result.rows_checked.toLocaleString()}{" "}
              row{result.rows_checked === 1 ? "" : "s"}
              {result.scope === "tenant"
                ? " for this tenant."
                : " across all tenants."}
            </span>
          ) : (
            <span>
              Chain broken
              {result.first_break_row !== undefined
                ? ` — first failure at row ${result.first_break_row}`
                : ""}
              . Verified up to {result.rows_checked.toLocaleString()} rows.
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
