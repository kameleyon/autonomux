"use client";

/**
 * apps/web/components/app/AppTopBar.tsx
 *
 * Thin band at the top of the main pane. On mobile it carries the
 * hamburger that opens the sidebar drawer; on desktop it is an empty
 * spacer that keeps page content off the very top edge of the viewport
 * (and gives child routes a place to slot a contextual title later).
 *
 * Hamburger is drawn with three CSS-only horizontal lines — no emoji,
 * no icon font, no glyph reliance. ARIA wires it to the sidebar by id.
 *
 * Owner: [Cluster C · App Shell]
 */

export function AppTopBar({
  mobileOpen,
  showHamburger,
  onHamburgerClick,
}: {
  mobileOpen: boolean;
  showHamburger: boolean;
  onHamburgerClick: () => void;
}): React.ReactElement {
  return (
    <div className="app-shell-topbar">
      {showHamburger ? (
        <button
          type="button"
          className="app-shell-hamburger"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar"
          onClick={onHamburgerClick}
        >
          <span className="app-shell-hamburger-bar" aria-hidden="true" />
          <span className="app-shell-hamburger-bar" aria-hidden="true" />
          <span className="app-shell-hamburger-bar" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
