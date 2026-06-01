"use client";

/**
 * apps/web/components/app/AppSidebar.tsx
 *
 * The primary nav rail. Renders four sections top-to-bottom:
 *
 *   1. Brand row — "A" letter-tile in brand orange + "autonomux" wordmark.
 *      Collapsed: only the tile is shown.
 *   2. Collapse toggle (desktop only) — chevron button at the top edge.
 *   3. Nav list — Home, Chat, Integrations, Settings. Active route is
 *      detected via `usePathname()` and gets a soft surface + 3px orange
 *      left edge.
 *   4. Account footer — user email (truncated) + sign-out form. Collapsed:
 *      only the avatar chip is shown.
 *
 * Sign-out is wired to the existing `signOutAction` Server Action at
 * `apps/web/app/sign-out/action.ts` — no new route needed.
 *
 * Owner: [Cluster C · App Shell]
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/sign-out/action";

type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly chip: string;
  readonly match: (pathname: string) => boolean;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  {
    href: "/app",
    label: "Home",
    chip: "H",
    match: (p) => p === "/app",
  },
  {
    href: "/app/chat",
    label: "Chat",
    chip: "C",
    match: (p) => p === "/app/chat" || p.startsWith("/app/chat/"),
  },
  {
    href: "/app/settings/integrations",
    label: "Integrations",
    chip: "I",
    match: (p) => p.startsWith("/app/settings/integrations"),
  },
  {
    href: "/app/settings/security",
    label: "Settings",
    chip: "S",
    match: (p) =>
      p.startsWith("/app/settings") &&
      !p.startsWith("/app/settings/integrations"),
  },
];

function NavRow({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}): React.ReactElement {
  const cls = [
    "app-shell-nav-item",
    active ? "app-shell-nav-item--active" : "",
    collapsed ? "app-shell-nav-item--collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Link
      href={item.href}
      className={cls}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
    >
      <span className="app-shell-nav-chip" aria-hidden="true">
        {item.chip}
      </span>
      <span className="app-shell-nav-label">{item.label}</span>
    </Link>
  );
}

export function AppSidebar({
  collapsed,
  mobileOpen,
  canToggleCollapsed,
  onToggleCollapsed,
  onMobileClose,
  userEmail,
  className,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  canToggleCollapsed: boolean;
  onToggleCollapsed: () => void;
  onMobileClose: () => void;
  userEmail: string;
  className: string;
}): React.ReactElement {
  const pathname = usePathname() ?? "";

  // Closing the drawer on nav is the expected mobile pattern — without
  // this the user picks a destination and is left staring at a drawer
  // covering the page they just navigated to.
  const onNavigate = (): void => {
    if (mobileOpen) onMobileClose();
  };

  const initial = (userEmail[0] ?? "?").toUpperCase();

  return (
    <nav
      id="app-sidebar"
      aria-label="App navigation"
      aria-hidden={mobileOpen ? "false" : undefined}
      className={className}
    >
      {/* ── Brand row ────────────────────────────────────────────────── */}
      <div className="app-shell-brand">
        <Link
          href="/app"
          className="app-shell-brand-link"
          onClick={onNavigate}
          aria-label="autonomux home"
        >
          <span className="app-shell-brand-mark" aria-hidden="true">
            A
          </span>
          {!collapsed ? (
            <span className="app-shell-brand-word">autonomux</span>
          ) : null}
        </Link>

        {canToggleCollapsed ? (
          <button
            type="button"
            className="app-shell-collapse-btn"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
          >
            <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
          </button>
        ) : null}
      </div>

      {/* ── Nav list ─────────────────────────────────────────────────── */}
      <ul className="app-shell-nav-list" role="list">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <NavRow
              item={item}
              active={item.match(pathname)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>

      {/* ── Account footer ───────────────────────────────────────────── */}
      <div className="app-shell-account">
        {collapsed ? (
          <div
            className="app-shell-account-avatar"
            aria-hidden="true"
            title={userEmail}
          >
            {initial}
          </div>
        ) : (
          <>
            <div className="app-shell-account-email" title={userEmail}>
              {userEmail}
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="app-shell-account-signout"
              >
                Sign out
              </button>
            </form>
          </>
        )}
      </div>
    </nav>
  );
}
