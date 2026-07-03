"use client";

/**
 * apps/web/components/HideOnApp.tsx
 *
 * Renders its children on every route EXCEPT the signed-in app (/app/*).
 * The /app surface is a full-bleed experience with its own chrome, so the
 * marketing skip-link and SiteFooter must not leak into it (they caused a
 * footer flash on load and a stray "Skip to content" button). Because this
 * reads the pathname during SSR too, the gated chrome never enters the
 * /app HTML — no flash.
 */
import { usePathname } from "next/navigation";

export function HideOnApp({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const pathname = usePathname();
  if (pathname !== null && pathname.startsWith("/app")) return null;
  return <>{children}</>;
}
