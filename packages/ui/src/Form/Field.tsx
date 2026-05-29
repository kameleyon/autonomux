"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

export interface FieldProps {
  /** Visible label text. Required for SC 3.3.2. */
  label: string;
  /** Optional helper text shown below the control. Tied via aria-describedby. */
  helpText?: ReactNode;
  /** When non-empty, renders an inline error (role=alert) + aria-invalid on child. */
  errorText?: string | null;
  /** Marks visually + via aria-required. */
  required?: boolean;
  /**
   * Single form control (Input, Select, native input, etc.). We inject
   * id / aria-describedby / aria-invalid into this element.
   */
  children: ReactNode;
  className?: string;
}

interface InjectedChildProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  required?: boolean;
}

/**
 * Field — accessible label + control + helpText + errorText wrapper.
 *
 * Accessibility (SC 1.3.1, 3.3.1, 3.3.2, 4.1.3):
 * - Auto-generates id with useId() and binds <label htmlFor=...>.
 * - aria-describedby points at helpText + errorText (when present).
 * - aria-invalid set when errorText is non-empty string.
 * - Error renders with role="alert" so SR announces on render.
 * - Caller controls when errorText appears (validation cadence is theirs).
 */
export function Field(props: FieldProps) {
  const {
    label,
    helpText,
    errorText,
    required,
    children,
    className,
  } = props;

  const reactId = useId();
  const id = `az-field-${reactId}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  const hasError = typeof errorText === "string" && errorText.length > 0;

  const describedBy = [
    helpText ? helpId : null,
    hasError ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  const child = Children.only(children);
  let injected: ReactNode = child;

  if (isValidElement(child)) {
    const typedChild = child as ReactElement<InjectedChildProps>;
    injected = cloneElement(typedChild, {
      id: typedChild.props.id ?? id,
      "aria-describedby": describedBy || undefined,
      "aria-invalid": hasError ? true : undefined,
      "aria-required": required ? true : undefined,
      required: required || typedChild.props.required,
    });
  }

  return (
    <div
      className={["az-field", hasError ? "az-field--error" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <label className="az-field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="az-field__required" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {injected}
      {helpText ? (
        <p id={helpId} className="az-field__help">
          {helpText}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} className="az-field__error" role="alert">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
