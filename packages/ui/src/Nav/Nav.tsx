"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export interface NavLink {
  href: string;
  label: string;
  /** Optional override for active-route matching. */
  match?: (pathname: string) => boolean;
}

export type NavAuthState = "signed-out" | "signed-in";

export interface NavProps {
  /** Brand block — usually <Logo /> + wordmark. Renders inside the home link. */
  brand: ReactNode;
  /** Brand link href — default "/". */
  brandHref?: string;
  links: ReadonlyArray<NavLink>;
  authState: NavAuthState;
  /** Right-side area for auth controls — sign-in button or user menu. */
  authSlot?: ReactNode;
  /** Accessible label for the nav landmark. Default "Primary". */
  ariaLabel?: string;
  /** SR-accessible labels for drawer toggle. */
  openMenuLabel?: string;
  closeMenuLabel?: string;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function defaultMatch(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Nav — primary top navigation with a mobile drawer below 880px.
 *
 * Accessibility:
 * - Renders as <nav aria-label="Primary"> (SC 2.4.6).
 * - aria-current="page" on the active link computed from window.location.
 * - Drawer toggle: aria-expanded + aria-controls, focus trap inside drawer,
 *   ESC closes, focus returns to the toggle.
 * - Drawer is hidden via display:none below the breakpoint so SR/keyboard
 *   skip the hidden inline links; desktop nav is hidden ABOVE the breakpoint.
 */
export function Nav(props: NavProps) {
  const {
    brand,
    brandHref = "/",
    links,
    authState,
    authSlot,
    ariaLabel = "Primary",
    openMenuLabel = "Open menu",
    closeMenuLabel = "Close menu",
  } = props;

  const [pathname, setPathname] = useState<string>("/");
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  // Read pathname after mount so SSR matches.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setPathname(window.location.pathname);
  }, []);

  // ESC closes drawer + returns focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Initial focus inside drawer on open.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const drawer = drawerRef.current;
      if (!drawer) return;
      const first = drawer.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) first.focus();
    }, 0);
    return () => {
      window.clearTimeout(id);
    };
  }, [open]);

  // Return focus to toggle on close.
  useEffect(() => {
    if (open) return;
    const t = toggleRef.current;
    if (t && document.activeElement === document.body) {
      t.focus();
    }
  }, [open]);

  const onDrawerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusables = Array.from(
        drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !drawer.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [],
  );

  const drawerId = "az-nav-drawer";

  const renderLink = (l: NavLink, onClick?: () => void) => {
    const matcher = l.match ?? ((p: string) => defaultMatch(l.href, p));
    const active = matcher(pathname);
    return (
      <a
        key={l.href}
        href={l.href}
        className={`az-nav__link ${active ? "az-nav__link--active" : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
      >
        {l.label}
      </a>
    );
  };

  return (
    <nav
      className={`az-nav az-nav--${authState}`}
      aria-label={ariaLabel}
    >
      <div className="az-nav__row">
        <a href={brandHref} className="az-nav__brand" aria-label="Home">
          {brand}
        </a>

        <div className="az-nav__desktop-links">
          {links.map((l) => renderLink(l))}
        </div>

        <div className="az-nav__auth-slot">{authSlot}</div>

        <button
          ref={toggleRef}
          type="button"
          className="az-nav__toggle"
          aria-expanded={open}
          aria-controls={drawerId}
          aria-label={open ? closeMenuLabel : openMenuLabel}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">{open ? "Close" : "Menu"}</span>
        </button>
      </div>

      <div
        ref={drawerRef}
        id={drawerId}
        className={`az-nav__drawer ${open ? "az-nav__drawer--open" : ""}`}
        hidden={!open}
        onKeyDown={onDrawerKeyDown}
      >
        <ul className="az-nav__drawer-list">
          {links.map((l) => (
            <li key={l.href} className="az-nav__drawer-item">
              {renderLink(l, () => setOpen(false))}
            </li>
          ))}
          {authSlot ? (
            <li className="az-nav__drawer-item">{authSlot}</li>
          ) : null}
        </ul>
      </div>
    </nav>
  );
}
