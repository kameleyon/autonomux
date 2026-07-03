"use client";

/**
 * apps/web/components/HideOnApp.tsx
 *
 * Renders its children on every route EXCEPT the full-bleed surfaces that
 * bring their own chrome: the landing (`/`) and the signed-in app (`/app/*`).
 * Both are edge-to-edge iframes with their own footer/nav, so the marketing
 * skip-link and SiteFooter must not leak into them (they caused a footer flash
 * and a stray "Skip to content" button). Because this reads the pathname during
 * SSR too, the gated chrome never enters those pages' HTML — no flash.
 */
import { usePathname } from "next/navigation";

export function HideOnApp({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const pathname = usePathname();
  if (pathname !== null && (pathname === "/" || pathname.startsWith("/app"))) {
    return null;
  }
  return <>{children}</>;
}
