"use client";

/**
 * apps/web/app/docs/DocsSidebarToggle.tsx
 *
 * Mobile-only: toggles the docs sidebar nav open/closed. On desktop the
 * sidebar is always visible (CSS), so this button is hidden there.
 */
import { useState } from "react";

export function DocsSidebarToggle({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <aside className="dx__side" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="dx__side-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>On this page</span>
        <span aria-hidden="true">{open ? "–" : "+"}</span>
      </button>
      <nav className="dx__side-nav" aria-label="Docs navigation">
        {children}
      </nav>
    </aside>
  );
}
