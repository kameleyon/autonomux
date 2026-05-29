import { type AnchorHTMLAttributes } from "react";

export interface SkipLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> {
  /** Anchor target — default "#main". */
  href?: string;
  /** Visible link text — default "Skip to main content". */
  children?: string;
}

/**
 * SkipLink — SC 2.4.1 Bypass Blocks.
 *
 * Must be the FIRST focusable element in the document. Pair with the
 * .sz-skip styles from tokens.css (re-exposed via this package's
 * tokens.css). The target landmark MUST exist with id="main" and a
 * tabIndex of -1 so the browser focuses it after activation.
 */
export function SkipLink(props: SkipLinkProps) {
  const { href = "#main", children = "Skip to main content", className, ...rest } = props;
  return (
    <a
      href={href}
      className={["sz-skip", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </a>
  );
}
