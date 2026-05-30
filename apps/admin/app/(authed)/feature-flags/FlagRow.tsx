"use client";

/**
 * FlagRow — inline-edit row for one feature flag.
 *
 * Renders inside a semantic <tr>. Each editable cell is a real form
 * control wired to the same <form> by a unique `form` attribute, so the
 * row submits as one Server Action call.
 *
 * Accessibility:
 *   - The rollout slider is a real <input type="range"> labeled by an
 *     <output> (live value) + min/max + per-row id.
 *   - Tenant lists are <textarea>s validated server-side; UUID errors
 *     surface inline via aria-describedby + aria-invalid.
 *   - The save button is the only submit affordance; the form's
 *     `aria-live="polite"` region announces the result message.
 *   - Delete is a separate form (different action) so it never submits
 *     the update payload by accident.
 *
 * Owner: [Forge + Halo]
 */

import {
  useId,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Dialog } from "@autonomux/ui/Dialog";

import {
  deleteFlagAction,
  updateFlagAction,
  type ActionResult,
} from "./actions";
import { ViewHistoryButton } from "./ViewHistoryButton";

export interface FlagRowProps {
  flagKey: string;
  description: string | null;
  enabledGlobally: boolean;
  rolloutPercentage: number;
  enabledForTenants: string[];
  disabledForTenants: string[];
  updatedAt: string;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function FlagRow(props: FlagRowProps): React.ReactElement {
  const formId = useId();
  const enabledId = `${formId}-enabled`;
  const rolloutId = `${formId}-rollout`;
  const rolloutOutputId = `${formId}-rollout-output`;
  const allowId = `${formId}-allow`;
  const allowDescId = `${formId}-allow-desc`;
  const denyId = `${formId}-deny`;
  const denyDescId = `${formId}-deny-desc`;
  const statusId = `${formId}-status`;

  const [rollout, setRollout] = useState<number>(props.rolloutPercentage);
  const [allowError, setAllowError] = useState<string | null>(null);
  const [denyError, setDenyError] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onRolloutChange(e: ChangeEvent<HTMLInputElement>): void {
    const next = Number.parseInt(e.target.value, 10);
    if (Number.isFinite(next)) setRollout(next);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setAllowError(null);
    setDenyError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await updateFlagAction(props.flagKey, formData);
      setStatus(result);
      if (result.fieldErrors) {
        setAllowError(result.fieldErrors.enabled_for_tenants ?? null);
        setDenyError(result.fieldErrors.disabled_for_tenants ?? null);
      }
    });
  }

  function openConfirm(): void {
    setStatus(null);
    setConfirmOpen(true);
  }

  function closeConfirm(): void {
    if (isPending) return;
    setConfirmOpen(false);
  }

  function confirmDelete(): void {
    startTransition(async () => {
      const result = await deleteFlagAction(props.flagKey);
      setStatus(result);
      if (result.ok) setConfirmOpen(false);
    });
  }

  return (
    <tr>
      <th scope="row" headers="th-key" style={{ textAlign: "left" }}>
        <code className="adm-table__mono">{props.flagKey}</code>
        {props.description ? (
          <div
            style={{
              color: "var(--ink-soft)",
              fontSize: "var(--fs-body-sm)",
              marginTop: "var(--sp-4)",
              maxWidth: "32ch",
            }}
          >
            {props.description}
          </div>
        ) : null}
        <form
          id={formId}
          onSubmit={onSubmit}
          aria-describedby={statusId}
          aria-labelledby={`th-key`}
        />
      </th>

      <td headers="th-enabled">
        <label
          htmlFor={enabledId}
          style={{ display: "flex", alignItems: "center", gap: "var(--sp-8)" }}
        >
          <input
            id={enabledId}
            form={formId}
            type="checkbox"
            name="enabled_globally"
            defaultChecked={props.enabledGlobally}
            disabled={isPending}
          />
          <span className="sz-sr-only">Enable {props.flagKey} globally</span>
          <span aria-hidden="true">global</span>
        </label>
      </td>

      <td headers="th-rollout">
        <label htmlFor={rolloutId} className="sz-sr-only">
          Rollout percentage for {props.flagKey} (0 to 100)
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-8)",
            minWidth: "10rem",
          }}
        >
          <input
            id={rolloutId}
            form={formId}
            type="range"
            name="rollout_percentage"
            min={0}
            max={100}
            step={1}
            value={rollout}
            onChange={onRolloutChange}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={rollout}
            aria-describedby={rolloutOutputId}
            disabled={isPending}
            style={{ flex: 1 }}
          />
          <output
            id={rolloutOutputId}
            htmlFor={rolloutId}
            style={{
              fontFamily: "DM Mono, monospace",
              minWidth: "3ch",
              textAlign: "right",
            }}
          >
            {rollout}%
          </output>
        </div>
      </td>

      <td headers="th-allow">
        <label htmlFor={allowId} className="sz-sr-only">
          Allowlist tenant UUIDs for {props.flagKey} (one per line)
        </label>
        <textarea
          id={allowId}
          form={formId}
          name="enabled_for_tenants"
          defaultValue={props.enabledForTenants.join("\n")}
          rows={Math.min(4, Math.max(1, props.enabledForTenants.length))}
          aria-invalid={allowError !== null}
          aria-describedby={allowError !== null ? allowDescId : undefined}
          disabled={isPending}
          style={{
            width: "16rem",
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-body-sm)",
          }}
          placeholder="one UUID per line"
        />
        {allowError !== null ? (
          <p
            id={allowDescId}
            role="alert"
            style={{
              color: "var(--ink-warning, var(--brand-wine))",
              fontSize: "var(--fs-body-sm)",
              marginTop: "var(--sp-4)",
            }}
          >
            {allowError}
          </p>
        ) : null}
      </td>

      <td headers="th-deny">
        <label htmlFor={denyId} className="sz-sr-only">
          Denylist tenant UUIDs for {props.flagKey} (one per line)
        </label>
        <textarea
          id={denyId}
          form={formId}
          name="disabled_for_tenants"
          defaultValue={props.disabledForTenants.join("\n")}
          rows={Math.min(4, Math.max(1, props.disabledForTenants.length))}
          aria-invalid={denyError !== null}
          aria-describedby={denyError !== null ? denyDescId : undefined}
          disabled={isPending}
          style={{
            width: "16rem",
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-body-sm)",
          }}
          placeholder="one UUID per line"
        />
        {denyError !== null ? (
          <p
            id={denyDescId}
            role="alert"
            style={{
              color: "var(--ink-warning, var(--brand-wine))",
              fontSize: "var(--fs-body-sm)",
              marginTop: "var(--sp-4)",
            }}
          >
            {denyError}
          </p>
        ) : null}
      </td>

      <td headers="th-updated">
        <time
          dateTime={props.updatedAt}
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-body-sm)",
          }}
        >
          {formatTimestamp(props.updatedAt)}
        </time>
      </td>

      <td headers="th-actions">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-4)",
            alignItems: "flex-start",
          }}
        >
          <button
            form={formId}
            type="submit"
            className="adm-cta"
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <ViewHistoryButton flagKey={props.flagKey} />
          <button
            type="button"
            className="adm-cta adm-cta--ghost"
            onClick={openConfirm}
            disabled={isPending}
            aria-label={`Delete flag ${props.flagKey}`}
            aria-haspopup="dialog"
            aria-expanded={confirmOpen}
          >
            Delete
          </button>
          <Dialog
            open={confirmOpen}
            onClose={closeConfirm}
            role="alertdialog"
            title={`Delete “${props.flagKey}”?`}
            description="This cannot be undone. Readers fall back to default (false) within 60s."
            dismissibleOnBackdrop={!isPending}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--sp-8)",
                marginTop: "var(--sp-16)",
              }}
            >
              <button
                type="button"
                className="adm-cta adm-cta--ghost"
                onClick={closeConfirm}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="adm-cta"
                onClick={confirmDelete}
                disabled={isPending}
              >
                {isPending ? "Deleting…" : "Delete flag"}
              </button>
            </div>
          </Dialog>
          <p
            id={statusId}
            role="status"
            aria-live="polite"
            style={{
              fontSize: "var(--fs-body-sm)",
              color:
                status === null
                  ? "transparent"
                  : status.ok
                    ? "var(--ink-soft)"
                    : "var(--brand-wine)",
              minHeight: "1.25rem",
            }}
          >
            {status?.message ?? " "}
          </p>
        </div>
      </td>
    </tr>
  );
}
