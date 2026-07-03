/* ============================================================
   AlterEgo — data, persona, and skill routing (plain JS → window)
   ============================================================ */

// ── Skill roster ──────────────────────────────────────────────
// Each skill: id, name, mark (mono glyph), short desc, command, and a
// keyword matcher used for auto-routing when no command is chosen.
const AE_SKILLS = [
  {
    id: "mailroom", name: "Mailroom", mark: "M", command: "/inbox",
    desc: "Triage the inbox — pull recent mail and rank it by what actually matters.",
    keywords: ["inbox", "email", "mail", "triage", "unread", "messages"],
  },
  {
    id: "scheduler", name: "Scheduler", mark: "S", command: "/calendar",
    desc: "Read the calendar, surface today and tomorrow, flag the conflicts.",
    keywords: ["calendar", "schedule", "meeting", "agenda", "my day", "what's on", "conflict", "reschedule", "availability"],
  },
  {
    id: "scribe", name: "Scribe", mark: "W", command: "/write",
    desc: "Draft, edit, and post articles in your voice — then publish on command.",
    keywords: ["write", "article", "draft", "post", "blog", "publish", "newsletter", "essay"],
  },
  {
    id: "oracle", name: "Oracle", mark: "O", command: "/read",
    desc: "Pull a card. Read the day, the week, the money lane — cardology + astrology.",
    keywords: ["read", "card", "astrology", "oracle", "tarot", "horoscope", "money lane", "birth card", "birth chart", "chart", "cardology"],
  },
  {
    id: "treasurer", name: "Treasurer", mark: "T", command: "/money",
    desc: "Map the money — lanes, runway, and what this week is quietly carrying.",
    keywords: ["money", "budget", "spend", "income", "runway", "finance", "cash", "treasurer"],
  },
  {
    id: "studio", name: "Studio", mark: "I", command: "/make",
    desc: "Generate an image or short video from a prompt, framed for where it's going.",
    keywords: ["image", "picture", "video", "generate", "render", "art", "thumbnail", "make me", "design a"],
  },
  {
    id: "companion", name: "Misc", mark: "•", command: "/think", hidden: true,
    desc: "Give an opinion. Talk it through. The take you'd give yourself at 2am.",
    keywords: ["opinion", "think", "should i", "advice", "what do you", "feel", "decide", "honest"],
  },
];

// ── Persona ───────────────────────────────────────────────────
const AE_VOICES = {
  warm: "Warm, grounded, and a little intuitive. You speak like a wiser version of them on a good day — encouraging but never saccharine.",
  sharp: "Sharp, direct, and strategic. You cut to the point fast, name the real pattern, and tell them the thing they're avoiding — kindly, but without padding.",
  mystical: "Intuitive and a little mystical, in the voice of a cardology reader: vivid, second-person, pattern-aware. You read the energy underneath the question, not just the question.",
};

function aePersona(voiceKey) {
  const voice = AE_VOICES[voiceKey] || AE_VOICES.warm;
  return [
    "You are AlterEgo — the user's second self. Not an assistant; their other 'me'.",
    "You speak as if you are them, with more time, more reach, and a longer memory. Use 'I' and 'we' naturally, never 'as an AI'.",
    "You have access to their world: their inbox (Mailroom), calendar (Scheduler), writing (Scribe), cardology/astrology (Oracle), money map (Treasurer), an image/video studio (Studio), and your own counsel (Companion).",
    `Voice: ${voice}`,
    "Keep replies tight and human — usually 2-5 short sentences or a short list. No emoji. No corporate hedging. Don't restate the question.",
    "When a sub-agent has already run and produced a result card, your text should briefly frame or interpret it — don't re-list the data the card already shows.",
  ].join(" ");
}

// Build the full prompt string from the transcript.
function aeBuildPrompt(history, userText, voiceKey, skill, hasCard) {
  const lines = [aePersona(voiceKey), ""];
  if (skill && skill.id === "companion") {
    lines.push("(Answer as your blunt 2am self — the honest take you'd give yourself, no hedging, no preamble. Keep it to 2-3 short sentences max.)", "");
  } else if (skill && hasCard) {
    lines.push(`(The "${skill.name}" skill just ran for this turn. Frame or interpret its result in one or two sentences — warmly and specifically — then stop.)`, "");
  }
  const recent = history.slice(-10);
  for (const m of recent) {
    lines.push(`${m.role === "user" ? "Me" : "AlterEgo"}: ${m.text}`);
  }
  lines.push(`Me: ${userText}`, "AlterEgo:");
  return lines.join("\n");
}

// ── Skill routing ─────────────────────────────────────────────
function aeRouteSkill(text, forcedSkillId) {
  if (forcedSkillId) return AE_SKILLS.find((s) => s.id === forcedSkillId) || null;
  const t = (text || "").toLowerCase();
  // explicit /command
  for (const s of AE_SKILLS) {
    if (t.startsWith(s.command)) return s;
  }
  // score-based: each matched keyword scores by its length (more specific
  // phrases outweigh short generic ones). Whole-word match only, so e.g.
  // "art" doesn't fire inside "chart". Highest score wins; ties → order.
  let best = null, bestScore = 0;
  for (const s of AE_SKILLS) {
    let score = 0;
    for (const k of s.keywords) {
      const re = new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      if (re.test(t)) score += k.length;
    }
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

// ── Mock skill result payloads ────────────────────────────────
// Deterministic, believable result cards. The live model writes the
// conversational wrapper; these render as structured cards.
const AE_RESULTS = {
  mailroom: {
    kind: "mailroom",
    meta: "5 ranked · last 24h",
    items: [
      { subject: "Re: Q3 partnership terms", sender: "dana@northwind.co", importance: 5, action: "Reply today", reason: "They moved on price and need an answer before Wednesday." },
      { subject: "Invoice #4821 is overdue", sender: "billing@stripe.com", importance: 4, action: "Pay", reason: "14 days late — small, but it's gating the next payout." },
      { subject: "Podcast invite — June taping", sender: "producer@thelonggame.fm", importance: 3, action: "Hold", reason: "Good audience, but the date collides with your launch week." },
      { subject: "Newsletter draft feedback", sender: "lena@yourlist.com", importance: 2, action: "Skim", reason: "Low urgency — she just wants a thumbs up." },
      { subject: "Your weekly analytics digest", sender: "noreply@plausible.io", importance: 1, action: "Archive", reason: "Routine. Nothing moved more than 3%." },
    ],
  },
  scheduler: {
    kind: "scheduler",
    meta: "Today · Mon Jun 2",
    slots: [
      { time: "9:30", title: "Deep work — Scribe drafts", sub: "Blocked focus · 90 min", conflict: false },
      { time: "11:00", title: "Northwind partnership call", sub: "Dana + legal · Google Meet", conflict: false },
      { time: "11:30", title: "1:1 with Lena", sub: "Overlaps Northwind by 30 min", conflict: true },
      { time: "2:00", title: "Studio review — launch visuals", sub: "Async, can slide", conflict: false },
      { time: "4:30", title: "Treasurer check-in", sub: "Weekly money map", conflict: false },
    ],
  },
  scribe: {
    kind: "scribe",
    meta: "Draft · 740 words",
    title: "Velocity Is Not the Same as Wealth",
    excerpt: "You're not bad with money — you're fast with it. The same mind that spots the opportunity before anyone else is the one that won't sit still long enough to get paid from it. Here's how to let one thing compound...",
    channel: "Substack · The Long Game",
  },
  oracle: {
    kind: "oracle",
    meta: "Daily pull · Jun 2",
    rank: "5", suit: "♣", suitColor: "black",
    name: "5 of Clubs — The Experimenter",
    read: "A restless, fast-processing day. The pull toward a shiny new idea is strong — and it's the exact thing that keeps the floor from rising. Don't start a fifth lane. Finish the one that's already 80% done. Boredom is not a signal to leave.",
  },
  treasurer: {
    kind: "treasurer",
    meta: "Week of Jun 2 – Jun 8",
    lanes: [
      { label: "Runway", val: "7.4 mo", note: "Steady. No moves needed." },
      { label: "This week in", val: "$6,200", note: "Two invoices clearing Wed." },
      { label: "Pitch lane", val: "Wed", note: "Ace of Spades — your heaviest day." },
      { label: "Watch", val: "Subscriptions", note: "$340/mo, 3 unused." },
    ],
    note: "Wednesday is carrying the week. If you make one money move, make it there.",
  },
  studio: {
    kind: "studio",
    meta: "1 variant · 16:10",
    tag: "GENERATED IMAGE",
    prompt: "Warm ember-toned hero, abstract chameleon silhouette, deep orange-to-burgundy gradient",
  },
};

// ── Library — chats grouped into folders by sub-agent ─────────
const AE_FOLDERS = [
  { id: "mailroom", name: "Mailroom", mark: "M", chats: [
    { id: "m1", title: "Triage before the Northwind call", date: "2h ago" },
    { id: "m2", title: "Unsubscribe sweep", date: "Mon" },
  ]},
  { id: "scheduler", name: "Scheduler", mark: "S", chats: [
    { id: "s1", title: "Tomorrow's agenda + conflicts", date: "Today" },
  ]},
  { id: "scribe", name: "Scribe", mark: "W", chats: [
    { id: "w1", title: "Draft: Velocity isn't wealth", date: "Yesterday" },
    { id: "w2", title: "Newsletter — June edition", date: "Thu" },
  ]},
  { id: "oracle", name: "Oracle", mark: "O", chats: [
    { id: "o1", title: "Daily card — 5 of Clubs", date: "Sat" },
    { id: "o2", title: "Weekly money map reading", date: "May 31" },
  ]},
  { id: "treasurer", name: "Treasurer", mark: "T", chats: [
    { id: "t1", title: "This week's money map", date: "Yesterday" },
  ]},
  { id: "studio", name: "Studio", mark: "I", chats: [
    { id: "st1", title: "Launch visuals, take 3", date: "Fri" },
  ]},
];

// ── AutoRoom — standing automations (grounded in AUTOROOM_PRD.md
//    + AUTOROOM_FUNCTIONALITIES.md: triggers, multi-step skill
//    pipelines, 5 trust tiers, action classes, cost discipline) ──

// The five trust tiers (AUTOROOM_PRD §5)
const AE_TIERS = [
  { id: "observe", name: "Observe", desc: "Runs and shows what it would do — takes no action.", icon: "Eye" },
  { id: "propose", name: "Propose", desc: "Drafts the action; you click to send. Nothing executes on its own.", icon: "PencilLine" },
  { id: "confirm", name: "Confirm-each", desc: "Prepares, then asks you per individual action.", icon: "ListChecks" },
  { id: "autolog", name: "Auto-with-log", desc: "Executes and logs it — you can undo within 24h.", icon: "ScrollText" },
  { id: "full", name: "Full autonomy", desc: "Executes silently. Trusted-action rules only.", icon: "Zap" },
];
const AE_TIER_INDEX = { observe: 0, propose: 1, confirm: 2, autolog: 3, full: 4 };

// Action-class tags on each skill (AUTOROOM_PRD §6)
const AE_ACLASS = {
  read: { label: "read", tone: "muted" },
  write_reversible: { label: "write · reversible", tone: "soft" },
  write_irreversible: { label: "write · irreversible", tone: "warn" },
  external_comms: { label: "sends externally", tone: "warn" },
  money: { label: "money", tone: "warn" },
  destructive: { label: "destructive", tone: "warn" },
};
const AE_MODEL_TIER = { haiku: "Haiku 4.5", sonnet: "Sonnet 4.6", opus: "Opus" };

// The user's automations (jobs). statuses: active · paused · observe · draft
const AE_JOBS = [
  {
    id: "morning-briefing", name: "Morning Briefing", icon: "Sunrise", status: "active",
    tier: "autolog", trigger: "Schedule", triggerText: "Every weekday · 7:00 AM",
    desc: "Composes inbox rank, today's calendar, and the daily card into one briefing, delivered in-app and by email.",
    lastRun: "Today 7:00 AM", lastOutcome: "ok", nextRun: "Tomorrow 7:00 AM",
    runsTotal: 142, successRate: 99, costPerRun: "$0.08",
    steps: [
      { id: "s1", skill: "mailroom.triage_inbox", agent: "Mailroom", model: "haiku", aclass: "read", note: "Rank last 24h of mail." },
      { id: "s2", skill: "scheduler.read_today", agent: "Scheduler", model: "haiku", aclass: "read", note: "Today's events + conflicts." },
      { id: "s3", skill: "oracle.daily_cardology_reading", agent: "Oracle", model: "sonnet", aclass: "read", note: "Pull the day's card." },
      { id: "s4", skill: "system.send_notification", agent: "System", model: "sonnet", aclass: "external_comms", note: "Compose & deliver in-app + email.", input: "{{ s1.output }} + {{ s2.output }} + {{ s3.output }}" },
    ],
    runs: [
      { t: "Today 7:00 AM", dur: "14s", cost: "$0.08", outcome: "ok" },
      { t: "Yesterday 7:00 AM", dur: "12s", cost: "$0.07", outcome: "ok" },
      { t: "Fri 7:00 AM", dur: "16s", cost: "$0.09", outcome: "ok" },
      { t: "Thu 7:00 AM", dur: "13s", cost: "$0.08", outcome: "ok" },
    ],
    guards: [{ k: "Per-run ceiling", v: "$0.50" }, { k: "Integrations", v: "Gmail · Calendar" }, { k: "Quiet hours", v: "Skip 10pm–7am" }],
  },
  {
    id: "inbox-declutter", name: "Inbox Declutter", icon: "Mail", status: "active",
    tier: "full", trigger: "Event", triggerText: "On new mail · + daily 6 AM sweep",
    desc: "Auto-archives newsletters and marketing from senders on your trusted-archive list.",
    lastRun: "22 min ago", lastOutcome: "ok", nextRun: "On next mail",
    runsTotal: 906, successRate: 100, costPerRun: "$0.01",
    steps: [
      { id: "s1", skill: "mailroom.triage_inbox", agent: "Mailroom", model: "haiku", aclass: "read", note: "Scan new mail." },
      { id: "s2", skill: "system.branch_on", agent: "System", model: "haiku", aclass: "read", note: "If sender on archive list…", input: "{{ s1.output.ranked }}" },
      { id: "s3", skill: "mailroom.archive", agent: "Mailroom", model: "haiku", aclass: "write_reversible", note: "Archive matched messages." },
    ],
    runs: [
      { t: "22 min ago", dur: "2s", cost: "$0.01", outcome: "ok" },
      { t: "1h ago", dur: "2s", cost: "$0.01", outcome: "ok" },
      { t: "3h ago", dur: "3s", cost: "$0.01", outcome: "ok" },
    ],
    guards: [{ k: "Per-day action cap", v: "50 archives" }, { k: "Trusted senders", v: "8 on list" }, { k: "Undo window", v: "24h" }],
  },
  {
    id: "calendar-guard", name: "Calendar Guard", icon: "CalendarClock", status: "active",
    tier: "propose", trigger: "Event", triggerText: "On new meeting invite",
    desc: "Drafts a polite decline for any meeting that arrives with no agenda — you send it with one tap.",
    lastRun: "Yesterday 2:41 PM", lastOutcome: "ok", nextRun: "On next invite",
    runsTotal: 38, successRate: 97, costPerRun: "$0.03",
    steps: [
      { id: "s1", skill: "scheduler.read_range", agent: "Scheduler", model: "haiku", aclass: "read", note: "Read the new invite." },
      { id: "s2", skill: "system.branch_on", agent: "System", model: "haiku", aclass: "read", note: "If no agenda attached…" },
      { id: "s3", skill: "scheduler.decline_meeting", agent: "Scheduler", model: "sonnet", aclass: "external_comms", note: "Draft a decline (asks first).", gate: true },
    ],
    runs: [
      { t: "Yesterday 2:41 PM", dur: "6s", cost: "$0.03", outcome: "ok" },
      { t: "Mon 9:12 AM", dur: "5s", cost: "$0.03", outcome: "approved" },
    ],
    guards: [{ k: "Per-run ceiling", v: "$0.20" }, { k: "Calendars", v: "Work only" }],
  },
  {
    id: "vip-watcher", name: "VIP Sender Watcher", icon: "BellRing", status: "active",
    tier: "confirm", trigger: "Event", triggerText: "On mail from a VIP",
    desc: "Surfaces mail from your VIP list the moment it lands and offers a one-tap draft.",
    lastRun: "5h ago", lastOutcome: "ok", nextRun: "On next VIP mail",
    runsTotal: 211, successRate: 98, costPerRun: "$0.02",
    steps: [
      { id: "s1", skill: "mailroom.summarize_thread", agent: "Mailroom", model: "haiku", aclass: "read", note: "Summarize the new thread." },
      { id: "s2", skill: "system.send_notification", agent: "System", model: "haiku", aclass: "external_comms", note: "Ping you in-app." },
      { id: "s3", skill: "mailroom.draft_reply", agent: "Mailroom", model: "sonnet", aclass: "write_reversible", note: "Pre-draft a reply (confirm each).", gate: true },
    ],
    runs: [
      { t: "5h ago", dur: "4s", cost: "$0.02", outcome: "ok" },
      { t: "Yesterday", dur: "4s", cost: "$0.02", outcome: "ok" },
    ],
    guards: [{ k: "VIP list", v: "6 senders" }, { k: "Per-recipient throttle", v: "3 / hour" }],
  },
  {
    id: "wellness-triple", name: "Wellness Triple", icon: "Heart", status: "observe",
    tier: "observe", trigger: "Schedule", triggerText: "Daily · 8 AM / 3 PM / 9 PM",
    desc: "A gratitude prompt, a 3 PM breath timer, and an evening reflection. In its 7-day Observe ramp — day 3.",
    lastRun: "Today 8:00 AM", lastOutcome: "observed", nextRun: "Today 3:00 PM",
    runsTotal: 6, successRate: 100, costPerRun: "$0.02", rampDay: 3,
    steps: [
      { id: "s1", skill: "companion.gratitude_prompt", agent: "Companion", model: "haiku", aclass: "read", note: "Morning gratitude nudge." },
      { id: "s2", skill: "companion.breath_timer", agent: "Companion", model: "haiku", aclass: "read", note: "3 PM box-breathing timer." },
      { id: "s3", skill: "companion.weekly_reflection", agent: "Companion", model: "sonnet", aclass: "read", note: "Evening reflection prompt." },
    ],
    runs: [
      { t: "Today 8:00 AM", dur: "3s", cost: "$0.02", outcome: "observed" },
      { t: "Yesterday 8:00 AM", dur: "3s", cost: "$0.02", outcome: "observed" },
    ],
    guards: [{ k: "Trust ramp", v: "Observe · day 3 of 7" }, { k: "Quiet hours", v: "Skip 10pm–7am" }],
  },
];

// 12 starter templates (AUTOROOM_FUNCTIONALITIES §8.1)
const AE_TEMPLATES = [
  { id: "t1", name: "Morning Briefing", icon: "Sunrise", cat: "productivity", icp: ["Founder", "Polymath", "Creator", "Wellness"], phase: "MVP", agents: "Mailroom · Scheduler · Oracle", desc: "Inbox rank + today's calendar + daily card, delivered every morning." },
  { id: "t2", name: "End-of-day Shutdown", icon: "Moon", cat: "productivity", icp: ["Founder", "Polymath"], phase: "MVP", agents: "Scheduler · Mailroom", desc: "Tomorrow's preview, loose-thread sweep, and a clean inbox before you log off." },
  { id: "t3", name: "Inbox Declutter", icon: "Mail", cat: "productivity", icp: ["Founder", "Polymath", "Creator", "Wellness"], phase: "MVP", agents: "Mailroom", desc: "Auto-archive newsletters and marketing from senders you've trusted." },
  { id: "t4", name: "Calendar Guard", icon: "CalendarClock", cat: "productivity", icp: ["Founder"], phase: "MVP", agents: "Scheduler", desc: "Decline agenda-less meetings with a polite, on-brand note." },
  { id: "t5", name: "VIP Sender Watcher", icon: "BellRing", cat: "productivity", icp: ["Founder", "Creator"], phase: "MVP", agents: "Mailroom", desc: "Get pinged the instant a VIP emails — with a draft ready to send." },
  { id: "t6", name: "Focus Block Auto-set", icon: "Square", cat: "productivity", icp: ["Founder", "Polymath"], phase: "MVP", agents: "Scheduler", desc: "Protect deep-work blocks and shuffle them around your real meetings." },
  { id: "t7", name: "Weekend Mode", icon: "Palmtree", cat: "productivity", icp: ["Founder", "Polymath", "Creator", "Wellness"], phase: "MVP", agents: "System", desc: "Pause every non-critical automation Saturday and Sunday." },
  { id: "t11", name: "Wellness Triple", icon: "Heart", cat: "wellness", icp: ["Wellness"], phase: "MVP", agents: "Companion", desc: "Gratitude at 8, a breath timer at 3, a reflection at 9." },
  { id: "t8", name: "Substack Weekly Draft", icon: "PenLine", cat: "content", icp: ["Creator"], phase: "1.3", agents: "Scribe", desc: "A drafted post in your voice every Friday, ready for your edit." },
  { id: "t9", name: "Daily Cardology + Astro", icon: "Sparkles", cat: "wellness", icp: ["Polymath", "Wellness"], phase: "1.4", agents: "Oracle", desc: "Your card, transits, and moon phase — read for the day ahead." },
  { id: "t10", name: "Bill Watcher", icon: "Coins", cat: "finance", icp: ["Founder", "Polymath", "Creator", "Wellness"], phase: "1.5", agents: "Treasurer", desc: "A heads-up 3 days, 1 day, and the morning a bill is due." },
  { id: "t12", name: "Travel Mode", icon: "Plane", cat: "productivity", icp: ["Founder", "Creator"], phase: "1.6", agents: "Scheduler · System", desc: "Flight-aware focus blocks and a destination brief when you land." },
];
const AE_TEMPLATE_CATS = [
  { id: "all", label: "All" }, { id: "productivity", label: "Productivity" },
  { id: "content", label: "Content" }, { id: "finance", label: "Finance" }, { id: "wellness", label: "Wellness" },
];
const AE_TEMPLATE_ICPS = ["All", "Founder", "Creator", "Polymath", "Wellness"];

// ── Notifications — activity feed + pending approvals (the
//    confirmation gate for irreversible writes) + nudges ────────
const AE_APPROVALS = [
  { id: "ap1", agent: "Mailroom", icon: "Mail", title: "Send your reply to Dana?", detail: "Re: Q3 partnership terms — \"Wednesday works. Sending the revised terms by EOD.\"", gate: "Sending email is irreversible" },
  { id: "ap2", agent: "Treasurer", icon: "Coins", title: "Pay invoice #4821 — $340?", detail: "Stripe · 14 days overdue. Gating your next payout.", gate: "Payment is irreversible" },
  { id: "ap3", agent: "Scribe", icon: "PenLine", title: "Publish \u201CVelocity Is Not the Same as Wealth\u201D?", detail: "740 words → Substack · The Long Game", gate: "Publishing is irreversible" },
];
const AE_NOTIFS = [
  { id: "n1", agent: "Mailroom", icon: "Mail", title: "Ranked 24 new messages", time: "8m ago", unread: true },
  { id: "n2", agent: "Oracle", icon: "Sparkles", title: "Daily card pulled — 5 of Clubs, The Experimenter", time: "2h ago", unread: true },
  { id: "n3", agent: "Companion", icon: "Heart", title: "You've been heads-down 3 hours — step outside?", time: "3h ago", unread: false, nudge: true },
  { id: "n4", agent: "Scheduler", icon: "CalendarClock", title: "Resolved a conflict — moved your 1:1 to 1:00 PM", time: "5h ago", unread: false },
  { id: "n5", agent: "Treasurer", icon: "Coins", title: "Flagged an overdue bill — Invoice #4821", time: "yesterday", unread: false },
];

// ── Archive — past conversations & briefings, grouped by date ──
const AE_ARCHIVE = [
  { group: "This week", items: [
    { id: "a1", title: "Triage before the Northwind call", agent: "Mailroom", date: "Mon", preview: "Ranked the inbox; Northwind was the one that mattered." },
    { id: "a2", title: "This week's money map", agent: "Treasurer", date: "Mon", preview: "Runway 7.4 months. Wednesday carries the week." },
    { id: "a3", title: "Daily card — 5 of Clubs", agent: "Oracle", date: "Sun", preview: "The Experimenter. Finish the 80%-done thing." },
  ]},
  { group: "Earlier", items: [
    { id: "a4", title: "Draft: Velocity isn't wealth", agent: "Scribe", date: "May 28", preview: "740-word draft for Substack, in your voice." },
    { id: "a5", title: "Should I take the podcast?", agent: "Misc", date: "May 27", preview: "Take it — you've been waiting for the right platform." },
    { id: "a6", title: "Launch visuals, take 3", agent: "Studio", date: "May 24", preview: "Warm, ember-toned, abstract chameleon." },
    { id: "a7", title: "Morning briefing", agent: "Briefing", date: "May 24", preview: "Inbox + calendar + card + money in one read." },
  ]},
];


function aeScriptedReply(userText, skill) {
  if (skill) {
    const byId = {
      mailroom: "Pulled the last 24 hours and ranked them. Northwind is the one that actually matters today — they moved on price and they're waiting on you. The rest can wait or disappear.",
      scheduler: "Here's today. The only real problem is 11:30 — Lena overlaps the Northwind call by half an hour. Want me to push her to 1:00?",
      scribe: "Drafted it in your voice — 740 words, ready for Substack. The opening leans into the 'fast, not bad, with money' line you keep coming back to. Read it and I'll post.",
      oracle: "Pulled your card. It's the Experimenter, and it's a little pointed today — the urge to chase a new idea is exactly the thing to resist. Finish the 80%-done one first.",
      treasurer: "Mapped the week. Runway's fine; the whole thing hinges on Wednesday. If you're going to make a money move, that's the square.",
      studio: "Made you a first pass — warm, ember-toned, abstract. Tell me what to push: more chameleon, less gradient, tighter crop?",
      companion: "Honest? You already know the answer — you're just looking for permission to act on it. So here it is: go.",
    };
    return byId[skill.id] || "On it.";
  }
  return "I hear you. Tell me a little more and I'll take it from there — or hand me a task: triage the inbox, read the day, draft something, map the money. I'm you, with more time to look.";
}

window.AE = {
  SKILLS: AE_SKILLS,
  RESULTS: AE_RESULTS,
  FOLDERS: AE_FOLDERS,
  VOICES: AE_VOICES,
  AUTOMATIONS: AE_JOBS,
  JOBS: AE_JOBS,
  TIERS: AE_TIERS,
  TIER_INDEX: AE_TIER_INDEX,
  ACLASS: AE_ACLASS,
  MODEL_TIER: AE_MODEL_TIER,
  TEMPLATES: AE_TEMPLATES,
  TEMPLATE_CATS: AE_TEMPLATE_CATS,
  TEMPLATE_ICPS: AE_TEMPLATE_ICPS,
  APPROVALS: AE_APPROVALS,
  NOTIFS: AE_NOTIFS,
  ARCHIVE: AE_ARCHIVE,
  routeSkill: aeRouteSkill,
  buildPrompt: aeBuildPrompt,
  scriptedReply: aeScriptedReply,
};
