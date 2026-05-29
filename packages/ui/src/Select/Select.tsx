import {
  forwardRef,
  type SelectHTMLAttributes,
  type ReactNode,
} from "react";

export type SelectVariant = "standard" | "mono";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  variant?: SelectVariant;
  children: ReactNode;
}

/**
 * Select — native <select> (no fake custom dropdown).
 *
 * Accessibility:
 * - Native widget: SR + mobile + keyboard work for free (SC 4.1.2).
 * - Min-height 44px (SC 2.5.8).
 * - Field wrapper provides label, error, helpText plumbing.
 * - `mono` variant uses DM Mono for data-shaped values (timezones, IDs).
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  props,
  ref,
) {
  const { variant = "standard", className, children, ...rest } = props;
  const classes = [
    "az-select",
    `az-select--${variant}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <select ref={ref} className="az-select__control" {...rest}>
        {children}
      </select>
      <span className="az-select__chevron" aria-hidden="true">
        ▾
      </span>
    </div>
  );
});
