/* ============================================================
   autonomux — landing interactions
   Lucide icons · live console ticker · scroll reveal · nav state
   ============================================================ */
(function () {
  "use strict";

  /* ── icons (inline lucide subset, no dependency) ──────────── */
  var ICONS = {
    mail: '<path d="M22 7 13.03 12.7a1.94 1.94 0 0 1-2.06 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
    calendar: '<path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    sparkles: '<path d="M9.94 14.34A2 2 0 0 0 8.66 13L4.6 11.7a.6.6 0 0 1 0-1.15l4.06-1.32A2 2 0 0 0 9.94 7.9l1.32-4.06a.6.6 0 0 1 1.15 0l1.32 4.06a2 2 0 0 0 1.28 1.28l4.06 1.32a.6.6 0 0 1 0 1.15l-4.06 1.32a2 2 0 0 0-1.28 1.28l-1.32 4.06a.6.6 0 0 1-1.15 0Z"/><path d="M19 3v4M21 5h-4"/>',
    landmark: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2 3 8h18Z"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.04 3 5.5l7 7Z"/>',
    brain: '<path d="M12 5a3 3 0 1 0-5.99.13 4 4 0 0 0-2.53 5.78 4 4 0 0 0 .55 6.56A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.99.13 4 4 0 0 1 2.53 5.78 4 4 0 0 1-.55 6.56A4 4 0 1 1 12 18Z"/>',
    scale: '<path d="M12 3v18M8 21h8M3 7h18"/><path d="m7 7-4 7h8ZM17 7l-4 7h8Z"/><path d="M7 7l5-2 5 2"/>',
    shieldcheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    fileclock: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><circle cx="16" cy="16" r="5"/><path d="M16 14v2l1.5 1"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.4 13.92 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 5.92-2.74 7.33"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M5 5l1.5 1.5M17.5 17.5 19 19M2 12h2M20 12h2M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg>";
  }
  document.querySelectorAll("[data-i]").forEach(function (el) { el.innerHTML = svg(el.getAttribute("data-i")); });

  /* ── live console ticker ──────────────────────────────────── */
  var FEED = [
    { who: "Mailroom", i: "mail", t: "Archived 6 overnight newsletters from trusted senders.", time: "6:32 AM" },
    { who: "Scheduler", i: "calendar", t: "Flagged a conflict — proposed moving your 1:1 to 3 PM.", time: "6:34 AM" },
    { who: "Treasurer", i: "landmark", t: "Rent posts in 3 days. Reminder queued for tomorrow.", time: "6:35 AM" },
    { who: "Oracle", i: "sparkles", t: "Daily pull ready — Five of Clubs, money lane.", time: "6:36 AM" },
    { who: "Mailroom", i: "bell", t: "VIP thread from Dana — reply drafted for your review.", time: "7:01 AM" },
    { who: "Scribe", i: "pen", t: "Substack draft assembled from this week's notes.", time: "7:02 AM" },
    { who: "Companion", i: "heart", t: "Gratitude nudge sent · reading reminder at 9 PM.", time: "7:05 AM" },
    { who: "System", i: "sun", t: "Morning briefing composed and delivered.", time: "7:06 AM" },
  ];
  var body = document.getElementById("console-body");
  if (body) {
    var idx = 0, MAX = 5;
    function row(item) {
      var el = document.createElement("div");
      el.className = "logline";
      el.innerHTML =
        '<span class="logline__ico">' + svg(item.i) + "</span>" +
        '<div class="logline__main">' +
          '<div class="logline__who">' + item.who + "</div>" +
          '<div class="logline__text">' + item.t + "</div>" +
          (item.gate ? '<span class="logline__gate">' + svg("lock") + item.gate + "</span>" : "") +
        "</div>" +
        '<span class="logline__time">' + item.time + "</span>";
      return el;
    }
    function push() {
      var item = FEED[idx % FEED.length]; idx++;
      body.appendChild(row(item));
      while (body.children.length > MAX) body.removeChild(body.firstChild);
    }
    // seed
    for (var s = 0; s < 4; s++) push();
    setInterval(push, 3400);
  }

  /* ── scroll reveal ────────────────────────────────────────── */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

  /* ── nav state ────────────────────────────────────────────── */
  var nav = document.getElementById("nav");
  var hero = document.querySelector(".hero");
  function onScroll() {
    // transparent only at the very top; dark bar as soon as you scroll
    var scrolled = window.scrollY > 20;
    nav.classList.toggle("is-stuck", scrolled);
    nav.classList.toggle("is-hero", !scrolled);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();
