/**
 * apps/web/app/manifest.ts
 *
 * Web App Manifest (Next App Router file convention → /manifest.webmanifest,
 * link auto-injected). Makes autonomux an installable PWA: Android/Chrome
 * "Add to Home Screen" gets the name, icons, and warm brand colors from here;
 * iOS uses app/apple-icon.png. Icons generated from public/home.png.
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Autonomux — your AlterEgo",
    short_name: "Autonomux",
    description:
      "Your AlterEgo runs your inbox, your calendar, your money, and your writing — so you can run the rest.",
    start_url: "/",
    display: "standalone",
    background_color: "#5a0e06",
    theme_color: "#c43811",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
