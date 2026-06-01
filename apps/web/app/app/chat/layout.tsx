/**
 * apps/web/app/app/chat/layout.tsx
 *
 * Two-column shell for /app/chat/*. Left rail = ThreadList (secondary
 * contextual nav), right pane = active thread (children). This sits
 * INSIDE the primary app shell — the outer <AppShell> already provides
 * the brand sidebar + topbar, so this layout no longer carries its own
 * width / centering constraints. It just flexes to fill the main pane.
 *
 * The thread list itself is rendered inside this layout via the page
 * components so it can share the loaded thread set without an extra
 * round-trip. We keep the layout dumb — just the responsive split-pane.
 *
 * Owner: [Cluster C · Vega + Forge]
 */

import type { ReactNode } from "react";

export default function ChatLayout({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <main
      id="main"
      tabIndex={-1}
      style={{
        display: "flex",
        gap: "var(--sp-16)",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        padding: "var(--sp-16)",
        alignItems: "stretch",
        overflow: "hidden",
      }}
    >
      {children}
    </main>
  );
}
