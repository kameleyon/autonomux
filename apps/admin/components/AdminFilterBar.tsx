/**
 * AdminFilterBar — server-driven filter form.
 *
 * GET-based form so server components can read filters from `searchParams`.
 * Each FilterField is a small field descriptor; the bar renders them in
 * a single <form method="get"> with a "Filter" submit + "Reset" anchor.
 *
 * Accessible: every input has a <label>; the form is keyboard-navigable;
 * tap targets meet WCAG 2.5.5 (44px min).
 */
import type React from "react";

export type AdminFilterField =
  | {
      kind: "text";
      name: string;
      label: string;
      defaultValue?: string;
      placeholder?: string;
    }
  | {
      kind: "select";
      name: string;
      label: string;
      defaultValue?: string;
      options: ReadonlyArray<{ value: string; label: string }>;
    }
  | {
      kind: "multi-select";
      name: string;
      label: string;
      defaultValues?: ReadonlyArray<string>;
      options: ReadonlyArray<{ value: string; label: string }>;
    }
  | {
      kind: "date";
      name: string;
      label: string;
      defaultValue?: string;
    };

export interface AdminFilterBarProps {
  /** Path the form submits to (the page route). */
  action: string;
  fields: ReadonlyArray<AdminFilterField>;
  /** Path the "Reset" link navigates to (defaults to action). */
  resetHref?: string;
  /** Submit-button label (defaults to "Filter"). */
  submitLabel?: string;
}

export function AdminFilterBar({
  action,
  fields,
  resetHref,
  submitLabel = "Filter",
}: AdminFilterBarProps): React.ReactElement {
  return (
    <form
      method="get"
      action={action}
      className="adm-filterbar"
      role="search"
      aria-label="Filter results"
    >
      {fields.map((field) => (
        <div key={field.name} className="adm-filterbar__field">
          <label
            htmlFor={`flt-${field.name}`}
            className="adm-label"
          >
            {field.label}
          </label>
          {field.kind === "text" ? (
            <input
              id={`flt-${field.name}`}
              name={field.name}
              type="search"
              defaultValue={field.defaultValue ?? ""}
              placeholder={field.placeholder}
              className="adm-input"
              autoComplete="off"
            />
          ) : field.kind === "date" ? (
            <input
              id={`flt-${field.name}`}
              name={field.name}
              type="date"
              defaultValue={field.defaultValue ?? ""}
              className="adm-input"
            />
          ) : field.kind === "select" ? (
            <select
              id={`flt-${field.name}`}
              name={field.name}
              defaultValue={field.defaultValue ?? ""}
              className="adm-input"
            >
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              id={`flt-${field.name}`}
              name={field.name}
              multiple
              defaultValue={[...(field.defaultValues ?? [])]}
              className="adm-input adm-input--multi"
              size={Math.min(field.options.length, 5)}
              aria-describedby={`flt-${field.name}-hint`}
            >
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          {field.kind === "multi-select" ? (
            <span
              id={`flt-${field.name}-hint`}
              className="adm-hint"
            >
              Hold ⌘/Ctrl to select multiple
            </span>
          ) : null}
        </div>
      ))}
      <div className="adm-filterbar__actions">
        <button type="submit" className="adm-cta">
          {submitLabel}
        </button>
        <a
          href={resetHref ?? action}
          className="adm-cta adm-cta--ghost"
        >
          Reset
        </a>
      </div>
    </form>
  );
}
