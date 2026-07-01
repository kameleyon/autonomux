/* ============================================================
   ControlRoom — data + live-engine seed (plain JS → window.CR)
   Grounded in CONTROLROOM_PRD.md + CONTROLROOM_FUNCTIONALITIES.md
   and the automations defined in alterego/data.js (window.AE.JOBS).
   ============================================================ */

(function () {
  const AE = window.AE || {};
  const JOBS = AE.JOBS || [];
  const byId = (id) => JOBS.find((j) => j.id === id) || {};

  // ── deterministic 30-run success pattern per automation ──────
  // 1 = ok/approved, 0 = failed. Drives sparklines + success rate.
  const PATTERNS = {
    "morning-briefing": "111111111111111111111101111111",
    "inbox-declutter":  "111111111111111111111111111111",
    "calendar-guard":   "111111111101111111111111110111",
    "vip-watcher":      "111111111111110111111111111011",
    "wellness-triple":  "111111111111111111111111111111",
  };
  function sparkFor(id) {
    return (PATTERNS[id] || "111111111111111111111111111111").split("").map((c) => c === "1" ? 1 : 0);
  }

  // ── Health signals per automation (computed-ish) ─────────────
  const HEALTH = JOBS.map((j) => {
    const spark = sparkFor(j.id);
    const fails = spark.filter((x) => x === 0).length;
    const cents = Math.round(parseFloat(String(j.costPerRun).replace("$", "")) * 100) || 0;
    return {
      id: j.id, name: j.name, icon: j.icon, status: j.status, tier: j.tier,
      trigger: j.trigger, triggerText: j.triggerText, desc: j.desc,
      successRate: j.successRate, runsTotal: j.runsTotal,
      costPerRunCents: cents, lastRun: j.lastRun, nextRun: j.nextRun,
      lastOutcome: j.lastOutcome, steps: j.steps, runs: j.runs, guards: j.guards,
      rampDay: j.rampDay || null,
      spark, fails,
      avgDurSec: { "morning-briefing": 14, "inbox-declutter": 2, "calendar-guard": 6, "vip-watcher": 4, "wellness-triple": 3 }[j.id] || 5,
      p50: { "morning-briefing": 11, "inbox-declutter": 2, "calendar-guard": 5, "vip-watcher": 3, "wellness-triple": 3 }[j.id] || 4,
      p95: { "morning-briefing": 22, "inbox-declutter": 4, "calendar-guard": 11, "vip-watcher": 8, "wellness-triple": 6 }[j.id] || 9,
      monthCostCents: { "morning-briefing": 168, "inbox-declutter": 226, "calendar-guard": 42, "vip-watcher": 92, "wellness-triple": 9 }[j.id] || 50,
      integrations: { "morning-briefing": ["gmail", "calendar", "resend"], "inbox-declutter": ["gmail"], "calendar-guard": ["calendar"], "vip-watcher": ["gmail"], "wellness-triple": [] }[j.id] || [],
      pendingApprovals: 0,
    };
  });

  // ── Integrations (CONTROLROOM_FUNCTIONALITIES §7) ────────────
  const INTEGRATIONS = [
    { id: "gmail", name: "Gmail", icon: "Mail", state: "connected", detail: "OAuth valid · last call 22s ago", affected: ["morning-briefing", "inbox-declutter", "vip-watcher"] },
    { id: "calendar", name: "Google Calendar", icon: "CalendarClock", state: "connected", detail: "OAuth valid · last call 3m ago", affected: ["morning-briefing", "calendar-guard"] },
    { id: "resend", name: "Resend", icon: "Send", state: "connected", detail: "Last successful send · 7:00 AM today", affected: ["morning-briefing"] },
    { id: "plaid", name: "Plaid", icon: "Landmark", state: "expiring", detail: "OAuth token expires in 6 days — reconnect soon", affected: ["bill-watcher"] },
    { id: "substack", name: "Substack", icon: "PenLine", state: "connected", detail: "Last publish · Fri 9:12 AM", affected: ["substack-weekly"] },
    { id: "twilio", name: "Twilio (SMS)", icon: "MessageSquare", state: "disconnected", detail: "Not connected — SMS alerts disabled", affected: ["vip-watcher"] },
  ];

  // ── 14-day cost series (daily spend, cents) ──────────────────
  const COST_SERIES = [
    { d: "May 22", c: 19 }, { d: "May 23", c: 22 }, { d: "May 24", c: 17 },
    { d: "May 25", c: 14 }, { d: "May 26", c: 24 }, { d: "May 27", c: 21 },
    { d: "May 28", c: 23 }, { d: "May 29", c: 26 }, { d: "May 30", c: 20 },
    { d: "May 31", c: 18 }, { d: "Jun 1", c: 31 }, { d: "Jun 2", c: 27 },
    { d: "Jun 3", c: 25 }, { d: "Jun 4", c: 16 },
  ];
  const COST_BY_AGENT = [
    { id: "mailroom", name: "Mailroom", cents: 214, color: "#f26b1a" },
    { id: "system", name: "System", cents: 96, color: "#e63312" },
    { id: "scheduler", name: "Scheduler", cents: 71, color: "#c2701a" },
    { id: "oracle", name: "Oracle", cents: 48, color: "#8a3410" },
    { id: "companion", name: "Companion", cents: 18, color: "#b81f00" },
  ];
  const COST_BY_MODEL = [
    { id: "haiku", name: "Haiku 4.5", cents: 188, color: "#c2701a" },
    { id: "sonnet", name: "Sonnet 4.6", cents: 232, color: "#f26b1a" },
    { id: "opus", name: "Opus", cents: 27, color: "#b81f00" },
  ];
  const BUDGET = { monthCeilingCents: 1500, monthUsedCents: 447, weekCents: 168, todayCents: 16 };

  // ── Activity timeline seed (CONTROLROOM_FUNCTIONALITIES §2) ───
  // verbs auto-generated from audit_log + runs. undoable within window.
  const ACTIVITY = [
    { id: "ac1", t: "8m ago", ts: 8, verb: "ran", jobId: "inbox-declutter", agent: "Mailroom", icon: "Mail", outcome: "ok", costCents: 1, detail: "Archived 4 newsletters from trusted senders.", undoable: true, ack: false },
    { id: "ac2", t: "22m ago", ts: 22, verb: "ran", jobId: "inbox-declutter", agent: "Mailroom", icon: "Mail", outcome: "ok", costCents: 1, detail: "Archived 2 marketing emails (Plausible, Notion).", undoable: true, ack: false },
    { id: "ac3", t: "1h ago", ts: 60, verb: "requested approval", jobId: "vip-watcher", agent: "Mailroom", icon: "BellRing", outcome: "approval", costCents: 2, detail: "Pre-drafted a reply to Dana — awaiting your confirm.", undoable: false, ack: false },
    { id: "ac4", t: "2h ago", ts: 120, verb: "ran", jobId: "vip-watcher", agent: "Mailroom", icon: "BellRing", outcome: "ok", costCents: 2, detail: "Summarized a new VIP thread from Lena and pinged you.", undoable: false, ack: true },
    { id: "ac5", t: "5h ago", ts: 300, verb: "ran", jobId: "calendar-guard", agent: "Scheduler", icon: "CalendarClock", outcome: "approved", costCents: 3, detail: "Drafted a decline for an agenda-less 30-min invite — you sent it.", undoable: false, ack: true },
    { id: "ac6", t: "Today 7:00 AM", ts: 360, verb: "ran", jobId: "morning-briefing", agent: "System", icon: "Sunrise", outcome: "ok", costCents: 8, detail: "Composed & delivered the morning briefing in-app + email.", undoable: false, ack: true },
    { id: "ac7", t: "Today 6:32 AM", ts: 388, verb: "ran", jobId: "inbox-declutter", agent: "Mailroom", icon: "Mail", outcome: "ok", costCents: 1, detail: "Morning sweep — archived 6 overnight newsletters.", undoable: true, ack: true },
    { id: "ac8", t: "Yesterday 2:41 PM", ts: 1480, verb: "ran", jobId: "calendar-guard", agent: "Scheduler", icon: "CalendarClock", outcome: "ok", costCents: 3, detail: "Flagged a conflict and proposed moving your 1:1.", undoable: false, ack: true },
    { id: "ac9", t: "Yesterday 11:18 AM", ts: 1560, verb: "failed", jobId: "vip-watcher", agent: "Mailroom", icon: "BellRing", outcome: "failed", costCents: 1, detail: "Gmail rate-limited the summarize step — retried and recovered.", undoable: false, ack: true },
    { id: "ac10", t: "Yesterday 8:00 AM", ts: 1640, verb: "observed", jobId: "wellness-triple", agent: "Companion", icon: "Heart", outcome: "observed", costCents: 2, detail: "Observe ramp — would have sent a gratitude nudge (day 3 of 7).", undoable: false, ack: true },
  ];

  // ── Audit log (GDPR Art. 15 surface, §17) ────────────────────
  const AUDIT = [
    { id: "au1", t: "8m ago", action: "email.archive", jobId: "inbox-declutter", aclass: "write_reversible", hash: "9f3a…c012", ok: true },
    { id: "au2", t: "1h ago", action: "mail.draft_reply", jobId: "vip-watcher", aclass: "write_reversible", hash: "71be…aa48", ok: true },
    { id: "au3", t: "5h ago", action: "calendar.decline_meeting", jobId: "calendar-guard", aclass: "external_comms", hash: "3c0d…ff19", ok: true },
    { id: "au4", t: "Today 7:00 AM", action: "system.send_notification", jobId: "morning-briefing", aclass: "external_comms", hash: "be21…7d55", ok: true },
    { id: "au5", t: "Yesterday 2:41 PM", action: "scheduler.read_range", jobId: "calendar-guard", aclass: "read", hash: "0a4f…1e6c", ok: true },
    { id: "au6", t: "Yesterday 11:18 AM", action: "mail.summarize_thread", jobId: "vip-watcher", aclass: "read", hash: "55d8…b3a1", ok: true },
  ];

  // ── Default custom views (§10 / PRD §7.1) ────────────────────
  const VIEWS = [
    { id: "all-active", name: "All active", icon: "LayoutGrid", desc: "Every active automation", builtin: true },
    { id: "needs-attention", name: "Needs attention", icon: "TriangleAlert", desc: "Failed 24h · approval pending · integration broken", builtin: true },
    { id: "most-expensive", name: "Most expensive", icon: "Coins", desc: "Sorted by cost, last 30 days", builtin: true },
    { id: "recently-changed", name: "Recently changed", icon: "History", desc: "Edited or version-bumped in last 7 days", builtin: true },
    { id: "archived", name: "Archived", icon: "Archive", desc: "Paused + archived, hidden from main views", builtin: true },
  ];

  // ── Live-feed seed: what's running / queued right now ────────
  // status: running · queued · awaiting_approval. The engine ticks these.
  function freshRun(jobId, status, currentStep) {
    const j = byId(jobId);
    const steps = (j.steps || []).map((s) => ({ name: s.skill, agent: s.agent, gate: !!s.gate, status: "pending" }));
    return {
      id: "run-" + jobId + "-" + Math.random().toString(36).slice(2, 7),
      jobId, jobName: j.name, icon: j.icon, tier: j.tier,
      status: status || "running",
      steps, totalSteps: steps.length,
      currentStep: currentStep == null ? 0 : currentStep,
      costCents: 0, durationSec: 0, outcome: null,
      pinned: false, acknowledged: false, startedLabel: "just now",
    };
  }

  const LIVE_SEED = [
    (function () { const r = freshRun("morning-briefing", "running", 2); r.durationSec = 9; r.costCents = 5; r.steps.forEach((s, i) => { s.status = i < 2 ? "done" : i === 2 ? "running" : "pending"; }); r.startedLabel = "9s ago"; return r; })(),
    (function () { const r = freshRun("inbox-declutter", "running", 1); r.durationSec = 2; r.costCents = 1; r.steps.forEach((s, i) => { s.status = i < 1 ? "done" : i === 1 ? "running" : "pending"; }); r.startedLabel = "2s ago"; return r; })(),
    (function () { const r = freshRun("vip-watcher", "awaiting_approval", 2); r.durationSec = 4; r.costCents = 2; r.steps.forEach((s, i) => { s.status = i < 2 ? "done" : i === 2 ? "gate" : "pending"; }); r.startedLabel = "1m ago"; return r; })(),
    (function () { const r = freshRun("calendar-guard", "queued", 0); r.startedLabel = "queued"; return r; })(),
  ];

  // Job ids the engine may spontaneously trigger (scheduled/event jobs).
  const SPAWNABLE = ["inbox-declutter", "vip-watcher", "calendar-guard", "morning-briefing"];

  // ── Approvals: reuse AE.APPROVALS, enrich for ControlRoom ────
  const ACLASS_OF = { ap1: "external_comms", ap2: "money", ap3: "external_comms" };
  const TTL_OF = { ap1: 52, ap2: 18, ap3: 240 }; // minutes remaining
  const COST_OF = { ap1: 0, ap2: 34000, ap3: 0 }; // cost-if-approved cents (invoice = $340)
  const HIRISK = { ap1: false, ap2: true, ap3: false }; // 2FA step-up
  const APPROVALS = (AE.APPROVALS || []).map((a) => ({
    ...a,
    aclass: ACLASS_OF[a.id] || "external_comms",
    ttlMin: TTL_OF[a.id] || 60,
    costCents: COST_OF[a.id] || 0,
    highRisk: !!HIRISK[a.id],
    jobId: { ap1: "vip-watcher", ap2: "bill-watcher", ap3: "substack-weekly" }[a.id] || null,
  }));

  window.CR = {
    HEALTH, INTEGRATIONS, COST_SERIES, COST_BY_AGENT, COST_BY_MODEL, BUDGET,
    ACTIVITY, AUDIT, VIEWS, LIVE_SEED, SPAWNABLE, APPROVALS,
    ACLASS: AE.ACLASS || {}, TIERS: AE.TIERS || [], MODEL_TIER: AE.MODEL_TIER || {},
    freshRun, sparkFor, byId,
    health: (id) => HEALTH.find((h) => h.id === id) || null,
  };
})();
