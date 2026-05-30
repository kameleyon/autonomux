"use client";

/**
 * CreateFlagDialog — modal form that inserts a new feature_flags row.
 *
 * Layout: button → on click opens APG-correct Dialog → form posts via the
 * `createFlagAction` Server Action → on success, dialog closes and the
 * page revalidates so the new row appears in the table.
 *
 * Owner: [Forge + Halo]
 */

import { useId, useState, useTransition, type FormEvent } from "react";

import { Dialog } from "@autonomux/ui/Dialog";

import { createFlagAction, type ActionResult } from "./actions";

export function CreateFlagDialog(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const formId = useId();
  const keyId = `${formId}-key`;
  const keyDescId = `${formId}-key-desc`;
  const descId = `${formId}-desc`;
  const statusId = `${formId}-status`;

  function openDialog(): void {
    setStatus(null);
    setOpen(true);
  }

  function close(): void {
    if (isPending) return;
    setOpen(false);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setStatus(null);
    startTransition(async () => {
      const result = await createFlagAction(formData);
      setStatus(result);
      if (result.ok) {
        form.reset();
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="adm-cta"
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        + Create flag
      </button>
      <Dialog
        open={open}
        onClose={close}
        title="Create feature flag"
        description="Add a new flag. You can configure rollout + tenant lists after it appears in the table."
        dismissibleOnBackdrop={!isPending}
      >
        <form onSubmit={onSubmit} aria-describedby={statusId}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-12)" }}>
            <div>
              <label
                htmlFor={keyId}
                style={{ display: "block", marginBottom: "var(--sp-4)" }}
              >
                Flag key
                <span aria-hidden="true" style={{ color: "var(--brand-wine)" }}>
                  {" *"}
                </span>
              </label>
              <input
                id={keyId}
                name="key"
                type="text"
                required
                pattern="^[a-z][a-z0-9_]*$"
                maxLength={128}
                aria-describedby={keyDescId}
                aria-invalid={status?.fieldErrors?.key !== undefined}
                className="adm-input"
                placeholder="experimental_oracle_v2"
                disabled={isPending}
                autoComplete="off"
              />
              <p
                id={keyDescId}
                style={{
                  fontSize: "var(--fs-body-sm)",
                  color:
                    status?.fieldErrors?.key !== undefined
                      ? "var(--brand-wine)"
                      : "var(--ink-soft)",
                  marginTop: "var(--sp-4)",
                }}
              >
                {status?.fieldErrors?.key ??
                  "lowercase snake_case · ≤ 128 chars · stable forever once set"}
              </p>
            </div>

            <div>
              <label
                htmlFor={descId}
                style={{ display: "block", marginBottom: "var(--sp-4)" }}
              >
                Description (optional)
              </label>
              <textarea
                id={descId}
                name="description"
                maxLength={280}
                rows={3}
                disabled={isPending}
                className="adm-input"
                placeholder="What does this flag gate?"
              />
            </div>

            <p
              id={statusId}
              role="status"
              aria-live="polite"
              style={{
                color: status?.ok === false ? "var(--brand-wine)" : "var(--ink-soft)",
                fontSize: "var(--fs-body-sm)",
                minHeight: "1.25rem",
              }}
            >
              {status?.message ?? " "}
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--sp-8)",
              }}
            >
              <button
                type="button"
                className="adm-cta adm-cta--ghost"
                onClick={close}
                disabled={isPending}
              >
                Cancel
              </button>
              <button type="submit" className="adm-cta" disabled={isPending}>
                {isPending ? "Creating…" : "Create flag"}
              </button>
            </div>
          </div>
        </form>
      </Dialog>
    </>
  );
}
