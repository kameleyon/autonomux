import type { Metadata } from "next";

import "@autonomux/ui/tokens.css";
import "@autonomux/ui/Button.css";
import "@autonomux/ui/Dialog.css";
import "./globals.css";

import { CookieBannerSlot } from "@/components/CookieBannerSlot";
import { HideOnApp } from "@/components/HideOnApp";
import { SiteFooter } from "@/components/SiteFooter";

/* Defensive: NEXT_PUBLIC_SITE_URL must be a fully-qualified URL with scheme.
 * If an operator pastes the bare host (no https://) into Vercel, `new URL()`
 * throws TypeError: Invalid URL at SSR time and 500s every route. Fall back
 * to the canonical host on any parse failure. Vercel deploy hardening
 * 2026-05-30. */
function resolveMetadataBase(): URL {
  const raw = process.env["NEXT_PUBLIC_SITE_URL"];
  const fallback = "https://autonomux.io";
  if (raw === undefined || raw.length === 0) return new URL(fallback);
  try {
    return new URL(raw);
  } catch {
    return new URL(fallback);
  }
}

export const metadata: Metadata = {
  title: {
    default: "Autonomux — your AlterEgo",
    template: "%s · Autonomux",
  },
  description:
    "Your AlterEgo runs your inbox, your calendar, your money, and your writing — so you can run the rest.",
  metadataBase: resolveMetadataBase(),
  icons: {
    icon: "/logo.png",
  },
  // The add-to-home-screen icon (iOS/Android) is wired via the App Router file
  // convention: app/apple-icon.png (180x180) auto-renders the apple-touch-icon
  // link with the correct rel + sizes — more reliable than a metadata href.
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    siteName: "Autonomux",
    title: "Autonomux — your AlterEgo",
    description:
      "Your AlterEgo runs your inbox, your calendar, your money, and your writing — so you can run the rest.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500;1,600&family=DM+Mono:wght@300;400;500&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <HideOnApp>
          <a className="sz-skip" href="#main">
            Skip to content
          </a>
        </HideOnApp>
        {children}
        <HideOnApp>
          <SiteFooter />
        </HideOnApp>
        <CookieBannerSlot />
      </body>
    </html>
  );
}
