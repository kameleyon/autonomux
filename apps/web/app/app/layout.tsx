/**
 * apps/web/app/app/layout.tsx
 *
 * Shell for every signed-in route. Two responsibilities:
 *
 *   1. Paint a fiery red→orange gradient that signals "you're inside the
 *      app." The public marketing surface stays neutral; once a user
 *      crosses into /app/* the brand temperature jumps to match the logo.
 *
 *   2. Provide a `.app-shell-card` utility for downstream pages —
 *      frosted-white card on top of the gradient, readable at any
 *      reasonable contrast. Pages opt in by setting `className="app-shell-card"`
 *      on their hero / content containers.
 *
 * Owner: [Vega + Canon]
 */
import "./app-shell.css";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <div className="app-shell">{children}</div>;
}
