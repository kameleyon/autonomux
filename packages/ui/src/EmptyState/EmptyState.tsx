import { createElement, type ReactNode } from "react";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface EmptyStateCta {
  label: string;
  href?: string;
  onClick?: () => void;
  /** Optional. If omitted, primary uses --brand-orange, secondary outlines. */
  variant?: "primary" | "secondary";
}

export interface EmptyStateProps {
  /** Short uppercase mono kicker above the heading. */
  eyebrow?: string;
  /**
   * Heading text — STRING ONLY.
   * Caller controls heading level via `headingLevel`. We never wrap a
   * caller-supplied element in another heading. (Regression fix ported
   * from studio-zero.)
   */
  heading: string;
  headingLevel?: HeadingLevel;
  /** Optional explicit id for the heading element. */
  headingId?: string;
  body?: ReactNode;
  primaryCta?: EmptyStateCta;
  secondaryCta?: EmptyStateCta;
  className?: string;
}

function CtaButton({ cta }: { cta: EmptyStateCta }) {
  const variant = cta.variant ?? "primary";
  const cls = `az-empty__cta az-empty__cta--${variant}`;
  if (cta.href) {
    return (
      <a href={cta.href} className={cls}>
        {cta.label}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={cta.onClick}>
      {cta.label}
    </button>
  );
}

/**
 * EmptyState — placeholder for empty lists / first-run states.
 *
 * Accessibility:
 * - `heading` is a STRING; caller picks the level via `headingLevel`.
 * - Eyebrow is mono-meta but rendered as <p>; it's NOT a heading.
 * - CTAs render as <a> when href is set, otherwise <button>.
 */
export function EmptyState(props: EmptyStateProps) {
  const {
    eyebrow,
    heading,
    headingLevel = 2,
    headingId,
    body,
    primaryCta,
    secondaryCta,
    className,
  } = props;

  const Heading = createElement(
    `h${headingLevel}`,
    {
      id: headingId,
      className: "az-empty__heading",
    },
    heading,
  );

  return (
    <div
      className={["az-empty", className ?? ""].filter(Boolean).join(" ")}
    >
      {eyebrow ? <p className="az-empty__eyebrow">{eyebrow}</p> : null}
      {Heading}
      {body ? <div className="az-empty__body">{body}</div> : null}
      {primaryCta || secondaryCta ? (
        <div className="az-empty__ctas">
          {primaryCta ? <CtaButton cta={primaryCta} /> : null}
          {secondaryCta ? <CtaButton cta={secondaryCta} /> : null}
        </div>
      ) : null}
    </div>
  );
}
