import { type ReactNode } from "react";

export interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
}

export interface FooterColumn {
  heading: string;
  links: ReadonlyArray<FooterLink>;
}

export interface FooterProps {
  columns: ReadonlyArray<FooterColumn>;
  /** Copyright line. Default: built from current year + brand. */
  copyright?: string;
  /** Version label — surfaces app version in dim text. */
  version?: string;
  brandName?: string;
  /** Aria-label for the contentinfo landmark. */
  ariaLabel?: string;
  /** Optional left-side block (logo, tagline). */
  brandSlot?: ReactNode;
}

/**
 * Footer — multi-column site footer with copyright + version row.
 *
 * Accessibility:
 * - <footer role="contentinfo"> landmark (implicit via <footer>).
 * - Each column is a region with an <h2> heading + nav landmark.
 * - Reflows to single column ≤ 880px and stays readable to 320px.
 */
export function Footer(props: FooterProps) {
  const {
    columns,
    copyright,
    version,
    brandName = "autonomux",
    ariaLabel = "Site",
    brandSlot,
  } = props;

  const year = new Date().getFullYear();
  const fallbackCopyright = `© ${year} ${brandName}`;

  return (
    <footer className="az-footer" aria-label={ariaLabel}>
      <div className="az-footer__inner">
        {brandSlot ? (
          <div className="az-footer__brand">{brandSlot}</div>
        ) : null}
        <div className="az-footer__columns">
          {columns.map((col, idx) => (
            <nav
              key={`${col.heading}-${idx}`}
              className="az-footer__col"
              aria-labelledby={`az-footer-h-${idx}`}
            >
              <h2 id={`az-footer-h-${idx}`} className="az-footer__col-heading">
                {col.heading}
              </h2>
              <ul className="az-footer__col-list">
                {col.links.map((l) => (
                  <li key={l.href} className="az-footer__col-item">
                    <a
                      href={l.href}
                      className="az-footer__link"
                      {...(l.external
                        ? {
                            target: "_blank",
                            rel: "noopener noreferrer",
                          }
                        : {})}
                    >
                      {l.label}
                      {l.external ? (
                        <span className="sz-sr-only">
                          {" "}
                          (opens in a new tab)
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="az-footer__legal">
        <p className="az-footer__copyright">{copyright ?? fallbackCopyright}</p>
        {version ? (
          <p className="az-footer__version" aria-label={`Version ${version}`}>
            v{version}
          </p>
        ) : null}
      </div>
    </footer>
  );
}
