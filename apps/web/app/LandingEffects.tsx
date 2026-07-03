"use client";

/**
 * apps/web/app/LandingEffects.tsx
 *
 * Client island that reproduces the prototype's landing.js behaviours on the
 * native landing: the live console ticker, IntersectionObserver scroll-reveal,
 * and the nav's hero/stuck scroll state. Renders nothing — it only wires up
 * effects against the server-rendered markup, scoped to the `.lp` root so it
 * never touches the rest of the app. All DOM here is trusted, static content.
 */
import { useEffect } from "react";

import { iconSvg } from "@/components/landing/icons";

type FeedItem = { who: string; i: string; t: string; time: string };

const FEED: readonly FeedItem[] = [
  { who: "Mailroom", i: "mail", t: "Archived 6 overnight newsletters from trusted senders.", time: "6:32 AM" },
  { who: "Scheduler", i: "calendar", t: "Flagged a conflict — proposed moving your 1:1 to 3 PM.", time: "6:34 AM" },
  { who: "Treasurer", i: "landmark", t: "Rent posts in 3 days. Reminder queued for tomorrow.", time: "6:35 AM" },
  { who: "Oracle", i: "sparkles", t: "Daily pull ready — Five of Clubs, money lane.", time: "6:36 AM" },
  { who: "Mailroom", i: "bell", t: "VIP thread from Dana — reply drafted for your review.", time: "7:01 AM" },
  { who: "Scribe", i: "pen", t: "Substack draft assembled from this week's notes.", time: "7:02 AM" },
  { who: "Companion", i: "heart", t: "Gratitude nudge sent · reading reminder at 9 PM.", time: "7:05 AM" },
  { who: "System", i: "sun", t: "Morning briefing composed and delivered.", time: "7:06 AM" },
];

export function LandingEffects(): null {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (root === null) return;

    /* ── live console ticker ──────────────────────────────────── */
    const body = root.querySelector<HTMLElement>("#console-body");
    let tickerId: ReturnType<typeof setInterval> | undefined;
    if (body !== null) {
      const MAX = 5;
      let idx = 0;
      const row = (item: FeedItem): HTMLElement => {
        const el = document.createElement("div");
        el.className = "logline";
        el.innerHTML =
          '<span class="logline__ico">' + iconSvg(item.i) + "</span>" +
          '<div class="logline__main">' +
            '<div class="logline__who">' + item.who + "</div>" +
            '<div class="logline__text">' + item.t + "</div>" +
          "</div>" +
          '<span class="logline__time">' + item.time + "</span>";
        return el;
      };
      const push = (): void => {
        const item = FEED[idx % FEED.length];
        idx += 1;
        if (item === undefined) return;
        body.appendChild(row(item));
        while (body.children.length > MAX && body.firstChild !== null) {
          body.removeChild(body.firstChild);
        }
      };
      for (let s = 0; s < 4; s += 1) push();
      tickerId = setInterval(push, 3400);
    }

    /* ── scroll reveal ────────────────────────────────────────── */
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));

    /* ── nav state ────────────────────────────────────────────── */
    const nav = root.querySelector<HTMLElement>("#nav");
    const onScroll = (): void => {
      if (nav === null) return;
      const scrolled = window.scrollY > 20;
      nav.classList.toggle("is-stuck", scrolled);
      nav.classList.toggle("is-hero", !scrolled);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (tickerId !== undefined) clearInterval(tickerId);
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
