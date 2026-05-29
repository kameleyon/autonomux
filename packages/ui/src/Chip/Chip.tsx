import { type HTMLAttributes, type ReactNode } from "react";

export type ChipVariant = "mono-meta" | "push" | "pitch" | "pause" | "save";

export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  variant?: ChipVariant;
  children: ReactNode;
  /**
   * If true, expose to SR as labeled status. Default: variant is purely
   * visual and SR consumers read the chip text as inline content.
   */
  asStatus?: boolean;
}

/**
 * Chip — small inline label.
 *
 * Variants:
 * - `mono-meta` — uppercase DM Mono · for metadata (timestamps, IDs).
 * - `push|pitch|pause|save` — PPPS severity, warm-only palette per tokens.
 *
 * Accessibility: when `asStatus`, renders role="status" so the chip
 * text is announced when content changes. Otherwise read as plain inline.
 */
export function Chip(props: ChipProps) {
  const { variant = "mono-meta", children, asStatus, className, ...rest } = props;
  const classes = ["az-chip", `az-chip--${variant}`, className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      role={asStatus ? "status" : undefined}
      {...rest}
    >
      {children}
    </span>
  );
}
