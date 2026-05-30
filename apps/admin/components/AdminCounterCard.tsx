/**
 * AdminCounterCard — single-metric tile.
 *
 * Used by Costs + (future) Tenants. Token-driven, warm-only.
 * `delta` is an optional sub-line ("+12% vs last 30d") — neutral
 * styling, NOT a green/red sentiment chip (warm-only palette).
 */
import type React from "react";

export interface AdminCounterCardProps {
  kicker: string;
  /** Big value. Format upstream (e.g. via Intl.NumberFormat). */
  value: string;
  /** Optional sub-line (delta, period, denominator). */
  caption?: string;
  /** Optional accessible long-form for screen readers when value is condensed. */
  srLabel?: string;
}

export function AdminCounterCard({
  kicker,
  value,
  caption,
  srLabel,
}: AdminCounterCardProps): React.ReactElement {
  return (
    <article className="adm-counter">
      <p className="adm-counter__kicker">{kicker}</p>
      <p className="adm-counter__value">
        {srLabel ? <span className="sz-sr-only">{srLabel}</span> : null}
        <span aria-hidden={srLabel ? true : undefined}>{value}</span>
      </p>
      {caption ? <p className="adm-counter__caption">{caption}</p> : null}
    </article>
  );
}
