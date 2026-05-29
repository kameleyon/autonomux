/**
 * Autonomux landing — placeholder for Phase 1.0 Foundation.
 *
 * Replaced by the real landing during Phase 1.7 (multi-tenant launch).
 * Until then this surface establishes brand + design-token coverage so
 * Halo + Vega + Canon can audit the foundation against the bar.
 */
import Image from "next/image";

export default function HomePage(): React.ReactElement {
  return (
    <main id="main" className="wrap">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-12)",
          marginBottom: "var(--sp-48)",
        }}
      >
        <Image
          src="/logo.png"
          alt="Autonomux"
          width={44}
          height={44}
          priority
        />
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: "var(--fs-mono-meta)",
            fontWeight: 600,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: "var(--ink)",
          }}
        >
          Autonom<em style={{ color: "var(--brand-orange)", fontStyle: "normal" }}>ux</em>
        </div>
      </header>

      <section
        style={{
          maxWidth: "640px",
          marginTop: "var(--sp-32)",
        }}
        aria-labelledby="page-h1"
      >
        <p
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-mono-meta)",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--brand-orange)",
            marginBottom: "var(--sp-16)",
          }}
        >
          Phase 1.0 · Foundation
        </p>
        <h1
          id="page-h1"
          style={{
            fontSize: "var(--fs-display-m)",
            marginBottom: "var(--sp-24)",
          }}
        >
          Your <em>AlterEgo</em>, almost ready.
        </h1>
        <p
          style={{
            fontSize: "var(--fs-body-lg)",
            color: "var(--ink-soft)",
            marginBottom: "var(--sp-24)",
          }}
        >
          Autonomux gives you a personal AI orchestrator that lives in your
          inbox, your calendar, your money, and your writing — so you can run
          the rest.
        </p>
        <p
          style={{
            fontSize: "var(--fs-body)",
            color: "var(--muted)",
          }}
        >
          The platform is in Foundation build. Public waitlist opens at
          v1.7 — see the{" "}
          <a href="https://github.com/kameleyon/autonomux/blob/main/docs/ROADMAP.md">
            roadmap
          </a>{" "}
          for the path.
        </p>
      </section>
    </main>
  );
}
