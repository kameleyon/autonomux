import type { Metadata } from "next";

import "@autonomux/ui/tokens.css";
import "@autonomux/ui/Button.css";
import "@autonomux/ui/Dialog.css";
import "./globals.css";

import { CookieBannerSlot } from "@/components/CookieBannerSlot";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: {
    default: "Autonomux â€” your AlterEgo",
    template: "%s Â· Autonomux",
  },
  description:
    "Your AlterEgo runs your inbox, your calendar, your money, and your writing â€” so you can run the rest.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://autonomux.io",
  ),
  icons: {
    icon: "/logo.png",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    siteName: "Autonomux",
    title: "Autonomux â€” your AlterEgo",
    description:
      "Your AlterEgo runs your inbox, your calendar, your money, and your writing â€” so you can run the rest.",
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
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Mono:wght@300;400;500&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a className="sz-skip" href="#main">
          Skip to content
        </a>
        {children}
        <SiteFooter />
        <CookieBannerSlot />
      </body>
    </html>
  );
}
