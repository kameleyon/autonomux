"use client";

/**
 * apps/web/components/CookieBannerSlot.tsx
 *
 * Layout-level slot that decides whether the cookie banner should appear
 * on the current route.
 *
 * Suppressed on /legal/* and /settings/consent — otherwise users on the
 * cookie policy page get the banner asking them to consent to the policy
 * they're trying to read. Recursion in UX form.
 *
 * Owner: [Comply + Halo] · Phase 1.0-B9
 */

import { usePathname } from "next/navigation";
import { CookieBanner } from "./CookieBanner";

const SUPPRESS_PREFIXES = ["/legal/", "/settings/consent"];

export function CookieBannerSlot(): React.ReactElement | null {
  const pathname = usePathname();
  if (pathname && SUPPRESS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }
  return <CookieBanner />;
}
