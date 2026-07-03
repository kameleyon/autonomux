/**
 * apps/web/components/landing/Icon.tsx
 *
 * Server-renderable inline SVG icon for the landing. Replaces the prototype's
 * `<span data-i="name">` placeholders that landing.js used to hydrate — here the
 * SVG is in the server HTML directly, so no flash and no client dependency.
 *
 * dangerouslySetInnerHTML is safe here: the injected string is a closed lookup
 * into ICON_PATHS — compile-time-constant SVG path literals, never user input.
 */
import { ICON_PATHS } from "./icons";

export function Icon({ name }: { name: keyof typeof ICON_PATHS | string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] ?? "" }}
    />
  );
}
