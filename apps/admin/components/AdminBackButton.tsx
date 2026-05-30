/**
 * AdminBackButton — anchor that styles like a chip; back navigation
 * for drill-down pages. Real <Link> so JS isn't required.
 *
 * Owner: [Forge + Vega]
 */
import Link from "next/link";
import type React from "react";

export interface AdminBackButtonProps {
  /** Destination (e.g. "/tenants"). */
  href: string;
  /** Visible label (e.g. "Back to tenants"). */
  label: string;
}

export function AdminBackButton({
  href,
  label,
}: AdminBackButtonProps): React.ReactElement {
  return (
    <Link href={href} className="adm-back" rel="up">
      <span aria-hidden="true">←</span>
      <span>{label}</span>
    </Link>
  );
}
