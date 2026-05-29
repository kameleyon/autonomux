import {
  forwardRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

export type CardPadding = "sm" | "md" | "lg";
export type CardVariant = "default" | "warm" | "bordered";
export type CardTag = "article" | "section" | "div";

interface CardBase {
  padding?: CardPadding;
  variant?: CardVariant;
  className?: string;
  children?: ReactNode;
}

export interface CardAsTagProps
  extends CardBase,
    Omit<HTMLAttributes<HTMLElement>, "className"> {
  as?: CardTag;
  href?: undefined;
}

export interface CardAsLinkProps
  extends CardBase,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> {
  as?: undefined;
  href: string;
}

export type CardProps = CardAsTagProps | CardAsLinkProps;

function isLink(props: CardProps): props is CardAsLinkProps {
  return typeof (props as CardAsLinkProps).href === "string";
}

/**
 * Card — non-interactive container by default. Becomes a link only when
 * `href` is provided (rendered as <a> with a card-wide hit area).
 *
 * Accessibility:
 * - When `href` set: full card is the interactive target. Focus ring on
 *   <a> via token-driven CSS.
 * - When not interactive: no role added; semantic via `as`.
 */
const Card = forwardRef<HTMLElement, CardProps>(function Card(props, ref) {
  const padding: CardPadding = props.padding ?? "md";
  const variant: CardVariant = props.variant ?? "default";
  const interactive = isLink(props);
  const classes = [
    "az-card",
    `az-card--${variant}`,
    `az-card--pad-${padding}`,
    interactive ? "az-card--interactive" : "",
    props.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isLink(props)) {
    const {
      padding: _padding,
      variant: _variant,
      className: _className,
      children,
      as: _as,
      ...rest
    } = props;
    void _padding;
    void _variant;
    void _className;
    void _as;
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={classes}
        {...rest}
      >
        {children}
      </a>
    );
  }

  const {
    as = "div",
    padding: _padding,
    variant: _variant,
    className: _className,
    children,
    href: _href,
    ...rest
  } = props;
  void _padding;
  void _variant;
  void _className;
  void _href;

  // We use the same prop bag for all three tags; the React HTML attribute
  // types are isomorphic for these and we cast `ref` to the generic element
  // ref at the boundary.
  const sharedProps = {
    className: classes,
    ...rest,
  } as HTMLAttributes<HTMLElement>;

  if (as === "article") {
    return (
      <article
        ref={ref as Ref<HTMLElement>}
        {...(sharedProps as HTMLAttributes<HTMLElement>)}
      >
        {children}
      </article>
    );
  }
  if (as === "section") {
    return (
      <section
        ref={ref as Ref<HTMLElement>}
        {...(sharedProps as HTMLAttributes<HTMLElement>)}
      >
        {children}
      </section>
    );
  }
  return (
    <div
      ref={ref as unknown as Ref<HTMLDivElement>}
      {...(sharedProps as HTMLAttributes<HTMLDivElement>)}
    >
      {children}
    </div>
  );
});

export { Card };
