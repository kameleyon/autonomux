/**
 * apps/web/components/auth/AuthLayout.tsx
 *
 * Shared split-pane layout for every auth surface (sign-in, sign-up,
 * forgot-password, reset-password, verify-email).
 *
 * Server Component — child forms are Client Components.
 *
 * Owner: [Vega + Forge]
 */
import type { ReactNode } from "react";

import styles from "./AuthLayout.module.css";

export interface AuthLayoutProps {
  readonly title: string;
  readonly subtitle: string;
  readonly headline?: string;
  readonly heroCopy?: string;
  readonly topbarText?: string;
  readonly topbarLinkLabel?: string;
  readonly topbarLinkHref?: string;
  readonly children: ReactNode;
}

const DEFAULT_HEADLINE = "Your AlterEgo is ready.";
const DEFAULT_HERO_COPY =
  "A second self that reads your inbox, your calendar, your cards, and your money — and acts while you live your life.";

export function AuthLayout({
  title,
  subtitle,
  headline = DEFAULT_HEADLINE,
  heroCopy = DEFAULT_HERO_COPY,
  topbarText,
  topbarLinkLabel,
  topbarLinkHref,
  children,
}: AuthLayoutProps): React.ReactElement {
  // Split headline so we can italicize the "AlterEgo" word.
  const headlineParts = headline.split(/(AlterEgo)/);

  return (
    <div className={styles.authSplit}>
      <section className={styles.visual}>
        <div className={styles.bg} />
        <img
          className={styles.heroImage}
          src="/auth.png"
          alt=""
          aria-hidden="true"
        />
        <div className={styles.scrim} />

        <div className={styles.brand}>
          <img
            className={styles.brandLogo}
            src="/logo.png"
            alt="autonomux"
          />
          <span className={styles.brandWord}>
            autonom<em>ux</em>
          </span>
        </div>

        <div className={styles.copy}>
          <h1 className={styles.headline}>
            {headlineParts.map((part, idx) =>
              part === "AlterEgo" ? (
                <em key={idx}>{part}</em>
              ) : (
                <span key={idx}>{part}</span>
              ),
            )}
          </h1>
          <p className={styles.sub}>{heroCopy}</p>
        </div>
      </section>

      <section className={styles.formWrap}>
        {topbarText !== undefined &&
        topbarLinkLabel !== undefined &&
        topbarLinkHref !== undefined ? (
          <div className={styles.topbar}>
            <span>{topbarText}</span>
            <a href={topbarLinkHref}>{topbarLinkLabel}</a>
          </div>
        ) : null}

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>{title}</h2>
            <p className={styles.cardSubtitle}>{subtitle}</p>
          </div>
          <div className={styles.cardBody}>{children}</div>
        </div>
      </section>
    </div>
  );
}

/** Re-export styles for child forms that need to compose with the layout. */
export { styles as authStyles };
