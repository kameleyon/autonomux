/**
 * apps/web/app/page.tsx
 *
 * Public marketing landing. Bridges the imported Landing prototype full-viewport
 * so `/` shows the real landing design. Its auth CTAs use target="_top" to break
 * out of the iframe into the real /sign-in and /sign-up. (To be ported to a
 * native Next page for SEO in a later phase.)
 */
export default function HomePage(): React.ReactElement {
  return (
    <iframe
      src="/prototypes/autonomux/Landing.html"
      title="autonomux — your AlterEgo"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        border: "none",
      }}
    />
  );
}
