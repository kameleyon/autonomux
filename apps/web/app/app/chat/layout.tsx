/**
 * apps/web/app/app/chat/layout.tsx
 *
 * Two-column shell for /app/chat/*. Left rail = ThreadList (240px fixed),
 * right pane = active thread (children).
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
        gap: "var(--sp-24)",
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "var(--sp-24) var(--sp-16)",
        minHeight: "calc(100vh - 80px)",
        alignItems: "stretch",
      }}
    >
      {children}
    </main>
  );
}
