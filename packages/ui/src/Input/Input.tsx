"use client";

import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
} from "react";

export type InputVariant = "text" | "email" | "password" | "number";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  variant?: InputVariant;
  /**
   * For password variant: SR-accessible label for the visibility toggle.
   * Default: "Show password" / "Hide password".
   */
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
}

/**
 * Input — primary text-control primitive.
 *
 * Accessibility (PRD §9):
 * - Min-height 44px on the input (SC 2.5.8).
 * - Border ≥ 3:1 against background using --border-strong (SC 1.4.11).
 * - Focus-visible token (SC 2.4.13).
 * - Password variant: visibility toggle is a real <button> with
 *   aria-pressed reflecting visible state. SR text changes accordingly.
 *   Toggle hit-target is ≥44×44.
 * - Field wrapper is responsible for label + id + aria-describedby +
 *   aria-invalid plumbing; Input is variant-agnostic.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  props,
  ref,
) {
  const {
    variant = "text",
    showPasswordLabel = "Show password",
    hidePasswordLabel = "Hide password",
    className,
    ...inputProps
  } = props;

  const [revealed, setRevealed] = useState(false);

  const wrapperClasses = [
    "az-input",
    `az-input--${variant}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (variant === "password") {
    return (
      <div className={`${wrapperClasses} az-input--with-trailing`}>
        <input
          ref={ref}
          type={revealed ? "text" : "password"}
          className="az-input__control"
          {...inputProps}
        />
        <button
          type="button"
          className="az-input__trailing-btn"
          onClick={() => setRevealed((v) => !v)}
          aria-pressed={revealed}
          aria-label={revealed ? hidePasswordLabel : showPasswordLabel}
        >
          <span aria-hidden="true">{revealed ? "Hide" : "Show"}</span>
        </button>
      </div>
    );
  }

  const type =
    variant === "email"
      ? "email"
      : variant === "number"
        ? "number"
        : "text";

  return (
    <div className={wrapperClasses}>
      <input
        ref={ref}
        type={type}
        className="az-input__control"
        {...inputProps}
      />
    </div>
  );
});
