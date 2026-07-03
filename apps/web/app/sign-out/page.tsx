/**
 * apps/web/app/sign-out/page.tsx
 *
 * Client half of logout. On load it:
 *   1. clears the server session (POST /api/sign-out — kills Supabase cookies),
 *   2. wipes ALL browser state: localStorage, sessionStorage, Cache Storage,
 *      and any registered service workers,
 *   3. hard-replaces to /sign-in so the back button can't return to an
 *      authed, cached page.
 *
 * This is the "clear session + cache completely, every time" logout.
 */
"use client";

import { useEffect, useState } from "react";

export default function SignOutPage(): React.ReactElement {
  const [msg, setMsg] = useState("Signing you out…");

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      // 1. Kill the server session (httpOnly cookies can only die server-side).
      try {
        await fetch("/api/sign-out", { method: "POST", cache: "no-store" });
      } catch {
        // Even if the network call fails, still wipe the client below.
      }

      // 2. Wipe every client-side store.
      try {
        window.localStorage.clear();
      } catch {
        /* storage may be blocked */
      }
      try {
        window.sessionStorage.clear();
      } catch {
        /* storage may be blocked */
      }
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        /* Cache Storage unavailable */
      }
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch {
        /* SW unavailable */
      }

      if (cancelled) return;
      setMsg("Signed out. Redirecting…");

      // 3. Hard replace — no history entry back into the app, cache-busted.
      window.location.replace("/sign-in?loggedout=1&t=" + Date.now());
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 15,
        color: "#3a302a",
        background: "#fff8f3",
      }}
    >
      <p>{msg}</p>
    </main>
  );
}
