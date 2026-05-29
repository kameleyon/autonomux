import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Admin · Autonomux",
    template: "%s · Admin · Autonomux",
  },
  description:
    "Autonomux admin cpanel — internal operator surface. Access restricted.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_ADMIN_URL ?? "https://admin.autonomux.app",
  ),
  icons: {
    icon: "/logo.png",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
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
      </body>
    </html>
  );
}
