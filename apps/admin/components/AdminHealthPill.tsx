/**
 * AdminHealthPill — warm-only health indicator.
 *
 * Brand rule (PRD §13 / tokens.css): semantic distinction by VALUE within
 * the warm spectrum, NEVER by hue. So instead of green/amber/red we map:
 *
 *   healthy (≥95% OK)  → brand-amber  (deep gold — grounded, "all OK")
 *   degraded (80–95%)  → pitch-orange (mid-warm, "watch this")
 *   critical (<80%)    → brand-wine   (burgundy — "act now")
 *
 * The pill ALSO carries a text label for color-blind users and an
 * sr-only sentence so screen-readers don't just read "97%".
 */
import type React from "react";

export type AdminHealthLevel = "healthy" | "degraded" | "critical";

export interface AdminHealthPillProps {
  level: AdminHealthLevel;
  /** Visible label override; defaults to capitalized level. */
  label?: string;
  /** Optional percentage to render after the label. */
  percent?: number;
  /** Extra context for screen-readers (e.g. "Gmail · 1,204 accounts"). */
  srContext?: string;
}

const LEVEL_LABEL: Record<AdminHealthLevel, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  critical: "Critical",
};

const LEVEL_TOKENS: Record<
  AdminHealthLevel,
  { fg: string; bg: string; border: string }
> = {
  healthy: {
    fg: "var(--pause-c)",
    bg: "var(--pause-bg)",
    border: "var(--pause-border)",
  },
  degraded: {
    fg: "var(--pitch-c)",
    bg: "var(--pitch-bg)",
    border: "var(--pitch-border)",
  },
  critical: {
    fg: "var(--save-c)",
    bg: "var(--save-bg)",
    border: "var(--save-border)",
  },
};

/**
 * Map a 0–1 ratio to a health level using the spec'd thresholds.
 *   ≥0.95 → healthy
 *   ≥0.80 → degraded
 *   <0.80 → critical
 */
export function healthLevelFromRatio(ratio: number): AdminHealthLevel {
  if (!Number.isFinite(ratio)) return "critical";
  if (ratio >= 0.95) return "healthy";
  if (ratio >= 0.8) return "degraded";
  return "critical";
}

export function AdminHealthPill({
  level,
  label,
  percent,
  srContext,
}: AdminHealthPillProps): React.ReactElement {
  const tokens = LEVEL_TOKENS[level];
  const visibleLabel = label ?? LEVEL_LABEL[level];
  const pct =
    typeof percent === "number" && Number.isFinite(percent)
      ? ` ${Math.round(percent * 100)}%`
      : "";

  return (
    <span
      className="adm-health-pill"
      data-level={level}
      style={{
        color: tokens.fg,
        background: tokens.bg,
        border: `1px solid ${tokens.border}`,
      }}
    >
      <span aria-hidden="true">
        {visibleLabel}
        {pct}
      </span>
      <span className="sz-sr-only">
        {srContext ? `${srContext}: ` : ""}
        {visibleLabel}
        {pct}
      </span>
    </span>
  );
}
