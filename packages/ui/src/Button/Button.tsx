import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

interface CommonButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
  className?: string;
}

type ButtonAsButton = CommonButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & {
    as?: "button";
  };

type ButtonAsAnchor = CommonButtonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className"> & {
    as: "a";
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

/**
 * Button — accessible action primitive.
 *
 * Accessibility (PRD §9, WCAG 2.2 AA):
 * - Focus-visible: 2px solid var(--focus-ring), 2px offset (SC 2.4.7, 2.4.13).
 * - Hit target: ≥44×44 on md/lg (SC 2.5.8). sm allowed ≥24×24 for inline
 *   dense use only — caller is responsible for surrounding spacing.
 * - Icon-only: caller MUST pass `aria-label`. We do not enforce at the type
 *   level (icons may be decorative wrappers), but a runtime guard would
 *   require knowing intent — preflight should flag missing labels.
 * - Loading: aria-busy + disabled, focus retained, spinner is decorative.
 * - Warm-only palette — `destructive` uses --brand-wine, not red rotation.
 */
function isAnchor(props: ButtonProps): props is ButtonAsAnchor {
  return props.as === "a";
}

const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(props, ref) {
    const {
      variant = "primary",
      size = "md",
      loading = false,
      iconLeft,
      iconRight,
      children,
      className,
    } = props;

    const classes = [
      "az-btn",
      `az-btn--${variant}`,
      `az-btn--${size}`,
      loading ? "az-btn--loading" : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const inner = (
      <>
        {iconLeft ? (
          <span className="az-btn__icon" aria-hidden="true">
            {iconLeft}
          </span>
        ) : null}
        <span className="az-btn__label">{children}</span>
        {iconRight ? (
          <span className="az-btn__icon" aria-hidden="true">
            {iconRight}
          </span>
        ) : null}
        {loading ? (
          <span className="az-btn__spinner" aria-hidden="true" />
        ) : null}
      </>
    );

    if (isAnchor(props)) {
      const {
        as: _as,
        variant: _variant,
        size: _size,
        loading: _loading,
        iconLeft: _iconLeft,
        iconRight: _iconRight,
        children: _children,
        className: _className,
        ...anchorProps
      } = props;
      void _as;
      void _variant;
      void _size;
      void _loading;
      void _iconLeft;
      void _iconRight;
      void _children;
      void _className;
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={classes}
          aria-busy={loading || undefined}
          {...anchorProps}
        >
          {inner}
        </a>
      );
    }

    const {
      as: _as,
      variant: _variant,
      size: _size,
      loading: _loading,
      iconLeft: _iconLeft,
      iconRight: _iconRight,
      children: _children,
      className: _className,
      disabled,
      type,
      ...buttonProps
    } = props;
    void _as;
    void _variant;
    void _size;
    void _loading;
    void _iconLeft;
    void _iconRight;
    void _children;
    void _className;

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        type={type ?? "button"}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...buttonProps}
      >
        {inner}
      </button>
    );
  },
);

export { Button };
