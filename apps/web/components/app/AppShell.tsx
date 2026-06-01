"use client";

/**
 * apps/web/components/app/AppShell.tsx
 *
 * Primary chrome for every signed-in route under /app/*. Holds the
 * sidebar-open + collapsed state, listens to viewport width to switch
 * between three layouts (desktop ≥1024, tablet 640–1023, mobile <640),
 * persists the desktop-collapsed preference in localStorage, and renders
 *
 *   [ AppSidebar ] [ <div.app-shell-main> { AppTopBar + children } ]
 *   [ backdrop (mobile + open only) ]
 *
 * No third-party UI lib — pure React state + CSS class toggles in
 * `apps/web/app/app/app-shell.css`. The backdrop is rendered but hidden
 * via media query above the mobile breakpoint, which avoids the brief
 * mount/unmount flash when the viewport crosses 640px.
 *
 * Owner: [Cluster C · App Shell]
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";

const STORAGE_KEY = "autonomux:app-sidebar-collapsed";
const MOBILE_MAX = 640;
const DESKTOP_MIN = 1024;

type ViewportClass = "mobile" | "tablet" | "desktop";

function classify(width: number): ViewportClass {
  if (width >= DESKTOP_MIN) return "desktop";
  if (width > MOBILE_MAX) return "tablet";
  return "mobile";
}

/**
 * Initial state resolver — runs once during the first client render. The
 * server cannot know the viewport, so we render conservatively (sidebar
 * closed on mobile assumption) and immediately re-render after mount
 * with the real values. The hydration flicker is one frame at most.
 */
function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — fall through.
  }
  // No persisted preference — collapse on tablet, expand on desktop.
  return classify(window.innerWidth) !== "desktop";
}

export function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail: string;
}): React.ReactElement {
  // Hydration-safe: render server output with collapsed=false / mobileOpen=false,
  // then `useEffect` below corrects on mount. The `hydrated` flag suppresses
  // animations until after first commit so the sidebar doesn't slide on load.
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [viewport, setViewport] = useState<ViewportClass>("desktop");
  const [hydrated, setHydrated] = useState<boolean>(false);
  const lastViewport = useRef<ViewportClass>("desktop");

  // On mount: read viewport + localStorage, sync state.
  useEffect(() => {
    const v = classify(window.innerWidth);
    setViewport(v);
    lastViewport.current = v;
    setCollapsed(readInitialCollapsed());
    setHydrated(true);

    const onResize = (): void => {
      const next = classify(window.innerWidth);
      if (next === lastViewport.current) return;
      const prev = lastViewport.current;
      lastViewport.current = next;
      setViewport(next);
      // Crossing INTO mobile — make sure the drawer is closed (it's the
      // only state that survives a viewport change unexpectedly).
      if (next === "mobile") {
        setMobileOpen(false);
      }
      // Crossing OUT OF mobile — drawer state is irrelevant on desktop/tablet.
      if (prev === "mobile" && next !== "mobile") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onToggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Persistence failure does not block UX.
      }
      return next;
    });
  }, []);

  const onMobileOpen = useCallback(() => setMobileOpen(true), []);
  const onMobileClose = useCallback(() => setMobileOpen(false), []);

  // ESC closes the mobile drawer for keyboard users.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Effective collapsed flag for the sidebar: only the desktop-collapse
  // preference applies on desktop. Tablet always renders the 64px rail
  // (no toggle visible). Mobile uses transform-based drawer regardless.
  const effectiveCollapsed =
    viewport === "desktop" ? collapsed : viewport === "tablet";

  const sidebarClasses = [
    "app-shell-sidebar",
    effectiveCollapsed ? "app-shell-sidebar--collapsed" : "",
    mobileOpen ? "app-shell-sidebar--open-mobile" : "",
    hydrated ? "" : "app-shell-sidebar--no-transition",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="app-shell-root">
      <AppSidebar
        collapsed={effectiveCollapsed}
        mobileOpen={mobileOpen}
        canToggleCollapsed={viewport === "desktop"}
        onToggleCollapsed={onToggleCollapsed}
        onMobileClose={onMobileClose}
        userEmail={userEmail}
        className={sidebarClasses}
      />

      {mobileOpen ? (
        <div
          className="app-shell-backdrop"
          aria-hidden="true"
          onClick={onMobileClose}
        />
      ) : null}

      <div className="app-shell-main">
        <AppTopBar
          mobileOpen={mobileOpen}
          showHamburger={viewport === "mobile"}
          onHamburgerClick={onMobileOpen}
        />
        {children}
      </div>
    </div>
  );
}
