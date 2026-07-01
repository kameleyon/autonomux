/* ============================================================
   autonomux Admin — mock operator data (plain JS → window.ADM)
   Realistic shapes mirror apps/admin queries + PRD §3.2.
   ============================================================ */

// ── Navigation (grouped per Optic audit F-Optic-06) ───────────
const ADM_NAV = [
  { group: "Runtime", items: [
    { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { id: "tenants", label: "Tenants", icon: "Users", count: "1,284" },
    { id: "queue", label: "Queue", icon: "ListTree", count: "37" },
    { id: "integrations", label: "Integrations", icon: "Plug", count: "2", alert: true },
    { id: "health", label: "Health", icon: "Activity" },
  ]},
  { group: "Money", items: [
    { id: "costs", label: "Costs", icon: "Coins" },
    { id: "billing", label: "Billing", icon: "CreditCard" },
  ]},
  { group: "Trust", items: [
    { id: "audit", label: "Audit log", icon: "ScrollText" },
    { id: "activity", label: "Activity", icon: "Footprints" },
    { id: "compliance", label: "Compliance", icon: "ShieldCheck", count: "5" },
  ]},
  { group: "Ops", items: [
    { id: "flags", label: "Feature flags", icon: "Flag" },
    { id: "support", label: "Support", icon: "LifeBuoy" },
  ]},
];

// ── Dashboard KPIs ────────────────────────────────────────────
const ADM_KPIS = [
  { label: "Active tenants", value: "1,284", delta: "+38", dir: "up", foot: "this week" },
  { label: "LLM spend · today", value: "$412.80", delta: "+6.2%", dir: "up", foot: "vs. yesterday" },
  { label: "Gross margin", value: "82.4%", delta: "+0.9pt", dir: "up", foot: "Pro + Founder" },
  { label: "Jobs in flight", value: "37", delta: "3 retrying", dir: "flat", foot: "worker queue" },
];

// ── Dashboard section cards (mirror PRD §3.2, grouped) ────────
const ADM_SECTIONS = [
  { group: "Runtime", cards: [
    { id: "tenants", icon: "Users", title: "Tenants", desc: "List, drill-down, usage, cost, errors, last activity.", stat: "1,284 active · 38 new" },
    { id: "queue", icon: "ListTree", title: "Queue", desc: "Railway worker + BullMQ mirror.", stat: "37 running · 3 failed" },
    { id: "integrations", icon: "Plug", title: "Integrations health", desc: "Composio + Plaid status, OAuth refresh failures.", stat: "2 degraded" },
    { id: "health", icon: "Activity", title: "Health", desc: "Per-service SLO board, uptime, error budgets.", stat: "All SLOs green" },
  ]},
  { group: "Money", cards: [
    { id: "costs", icon: "Coins", title: "Costs", desc: "LLM cost per tenant / model / sub-agent, margins.", stat: "$412.80 today" },
    { id: "billing", icon: "CreditCard", title: "Billing", desc: "Stripe MRR, churn, LTV, cohort retention, refunds.", stat: "$48.2K MRR" },
  ]},
  { group: "Trust", cards: [
    { id: "audit", icon: "ScrollText", title: "Audit log", desc: "Searchable, exportable, 7-yr, signed-chain verify.", stat: "Chain verified" },
    { id: "activity", icon: "Footprints", title: "Activity log", desc: "User-facing activity mirror, surfaced for support.", stat: "Live" },
    { id: "compliance", icon: "ShieldCheck", title: "Compliance", desc: "GDPR export/deletion, DPA, CASA, SOC 2 evidence.", stat: "5 in queue" },
  ]},
  { group: "Ops", cards: [
    { id: "flags", icon: "Flag", title: "Feature flags", desc: "GrowthBook console, % rollouts, per-tenant overrides.", stat: "12 active" },
    { id: "support", icon: "LifeBuoy", title: "Support", desc: "Impersonate, force re-OAuth, reset memory, re-brief.", stat: "Audited" },
  ]},
];

// ── Tenants ───────────────────────────────────────────────────
const ADM_TENANTS = [
  { id: "1a2b3c4d", handle: "lightspiritux", plan: "Founder", status: "active", created: "2025-11-02", last: "2 min ago", members: 1, spend: "$38.40", runs: 1820 },
  { id: "9f8e7d6c", handle: "marcus.flow", plan: "Pro", status: "active", created: "2026-01-14", last: "18 min ago", members: 1, spend: "$22.10", runs: 940 },
  { id: "5e4d3c2b", handle: "nadia.writes", plan: "Pro", status: "past_due", created: "2025-12-21", last: "3 h ago", members: 1, spend: "$19.85", runs: 712 },
  { id: "7c6b5a49", handle: "the.long.game", plan: "Personal", status: "active", created: "2026-02-08", last: "1 h ago", members: 2, spend: "$11.20", runs: 388 },
  { id: "3b2a1908", handle: "ember.studio", plan: "Pro", status: "active", created: "2026-03-19", last: "26 min ago", members: 1, spend: "$24.60", runs: 1031 },
  { id: "8d7c6b5a", handle: "quiet.dana", plan: "Free", status: "active", created: "2026-05-01", last: "yesterday", members: 1, spend: "$0.00", runs: 64 },
  { id: "2f1e0d9c", handle: "northwind.co", plan: "Founder", status: "active", created: "2025-10-11", last: "5 min ago", members: 4, spend: "$61.95", runs: 2740 },
  { id: "6a5b4c3d", handle: "trial.gauss", plan: "Free", status: "suspended", created: "2026-04-22", last: "6 d ago", members: 1, spend: "$0.00", runs: 12 },
  { id: "4c3d2e1f", handle: "rivera.ops", plan: "Personal", status: "active", created: "2026-02-27", last: "44 min ago", members: 1, spend: "$8.75", runs: 295 },
  { id: "0e9d8c7b", handle: "halcyon.fm", plan: "Pro", status: "cancelled", created: "2025-12-03", last: "12 d ago", members: 1, spend: "$0.00", runs: 503 },
];

// Tenant drill-down detail (keyed by id)
const ADM_TENANT_DETAIL = {
  handle: "lightspiritux", plan: "Founder", status: "active", region: "us-east-1",
  created: "Nov 2, 2025", lastActivity: "2 min ago", email: "lightspiritux@gmail.com",
  usage: [
    { k: "Spend · MTD", v: "$38.40" }, { k: "Sub-agent runs · MTD", v: "1,820" },
    { k: "Tokens · MTD", v: "14.2M" }, { k: "Errors · 7d", v: "3" },
    { k: "Memory facts", v: "248" }, { k: "Connected accounts", v: "5" },
  ],
  agents: [
    { name: "Mailroom", runs: 612, last: "2 min ago", status: "ok" },
    { name: "Scheduler", runs: 408, last: "31 min ago", status: "ok" },
    { name: "Scribe", runs: 144, last: "yesterday", status: "ok" },
    { name: "Oracle", runs: 210, last: "6 h ago", status: "ok" },
    { name: "Treasurer", runs: 318, last: "1 h ago", status: "warn" },
    { name: "Companion", runs: 128, last: "3 h ago", status: "ok" },
  ],
};

// ── Costs ─────────────────────────────────────────────────────
const ADM_COST_KPIS = [
  { label: "Spend · today", value: "$412.80", delta: "+6.2%", dir: "up", foot: "vs. yesterday" },
  { label: "Spend · MTD", value: "$7,940", delta: "62% of budget", dir: "flat", foot: "$12.8K cap" },
  { label: "Blended margin", value: "82.4%", delta: "+0.9pt", dir: "up", foot: "all tiers" },
  { label: "Cost / active tenant", value: "$0.32", delta: "-3.1%", dir: "up", foot: "per day" },
];
const ADM_COST_MODELS = [
  { name: "Claude Sonnet 4.6", role: "Main agent loop", spend: 5210, pct: 66, hot: true },
  { name: "Claude Haiku 4.5", role: "Routine triage", spend: 1880, pct: 24, hot: false },
  { name: "Embeddings (voyage)", role: "Episodic memory", spend: 540, pct: 7, hot: false },
  { name: "Whisper (voice STT)", role: "Voice notes", spend: 310, pct: 3, hot: false },
];
const ADM_COST_AGENTS = [
  { name: "Mailroom", spend: "$2,140", share: 27 },
  { name: "Scheduler", spend: "$1,180", share: 15 },
  { name: "Oracle", spend: "$1,510", share: 19 },
  { name: "Scribe", spend: "$1,320", share: 17 },
  { name: "Treasurer", spend: "$980", share: 12 },
  { name: "Companion", spend: "$810", share: 10 },
];
const ADM_COST_SPARK = [38, 42, 40, 55, 61, 48, 52, 70, 66, 58, 74, 69, 63, 81];

// ── Integrations health ───────────────────────────────────────
const ADM_INTEGRATIONS = [
  { name: "Composio · Gmail", scope: "read · drafts · labels · send", status: "ok", uptime: "99.98%", note: "Nominal", refreshFails: 0 },
  { name: "Composio · Google Calendar", scope: "events · free/busy · write", status: "ok", uptime: "99.99%", note: "Nominal", refreshFails: 0 },
  { name: "Composio · Substack (email)", scope: "publish-by-email", status: "ok", uptime: "100%", note: "Nominal", refreshFails: 0 },
  { name: "Composio · X / Twitter", scope: "post threads", status: "warn", uptime: "98.4%", note: "Elevated 5xx from upstream", refreshFails: 4 },
  { name: "Composio · LinkedIn", scope: "post", status: "ok", uptime: "99.9%", note: "Nominal", refreshFails: 1 },
  { name: "Plaid · Transactions", scope: "balances · transactions", status: "alert", uptime: "96.1%", note: "OAuth refresh failing for 11 tenants", refreshFails: 11 },
  { name: "Astrology API · Swiss Ephemeris", scope: "chart compute", status: "ok", uptime: "99.95%", note: "Nominal", refreshFails: 0 },
  { name: "Stripe · Billing", scope: "subscriptions · invoices", status: "ok", uptime: "100%", note: "Nominal", refreshFails: 0 },
];

// ── Queue ─────────────────────────────────────────────────────
const ADM_QUEUE_KPIS = [
  { label: "Running", value: "37", dir: "flat", delta: "live", foot: "across 4 workers" },
  { label: "Pending", value: "112", dir: "flat", delta: "", foot: "scheduled + on-demand" },
  { label: "Failed · 24h", value: "9", dir: "down", delta: "-4", foot: "3 retrying now" },
  { label: "Avg. wait", value: "1.8s", dir: "up", delta: "-0.3s", foot: "p50 enqueue→start" },
];
const ADM_QUEUE_JOBS = [
  { id: "job_8f21a", agent: "Mailroom", tenant: "northwind.co", kind: "morning_briefing", status: "running", attempt: 1, dur: "4.2s" },
  { id: "job_8f219", agent: "Treasurer", tenant: "lightspiritux", kind: "bill_scan", status: "running", attempt: 1, dur: "2.1s" },
  { id: "job_8f210", agent: "Scribe", tenant: "nadia.writes", kind: "draft_post", status: "pending", attempt: 0, dur: "—" },
  { id: "job_8f205", agent: "Plaid sync", tenant: "rivera.ops", kind: "txn_refresh", status: "failed", attempt: 3, dur: "12.0s" },
  { id: "job_8f1f8", agent: "Oracle", tenant: "the.long.game", kind: "daily_pull", status: "running", attempt: 1, dur: "0.9s" },
  { id: "job_8f1f0", agent: "Scheduler", tenant: "marcus.flow", kind: "conflict_check", status: "done", attempt: 1, dur: "1.4s" },
  { id: "job_8f1e7", agent: "Mailroom", tenant: "ember.studio", kind: "triage_rank", status: "retrying", attempt: 2, dur: "—" },
];

// ── Audit log ─────────────────────────────────────────────────
const ADM_AUDIT = [
  { ts: "2026-06-02 18:41:07", actor: "ops@autonomux", kind: "admin", action: "admin.tenant.list_viewed", resource: "tenant", tenant: "—" },
  { ts: "2026-06-02 18:39:55", actor: "system", kind: "agent", action: "treasurer.bill_reminder.sent", resource: "email", tenant: "lightspiritux" },
  { ts: "2026-06-02 18:38:12", actor: "ops@autonomux", kind: "admin", action: "admin.support.impersonate_start", resource: "session", tenant: "nadia.writes" },
  { ts: "2026-06-02 18:31:40", actor: "user", kind: "user", action: "scribe.post.published", resource: "substack_post", tenant: "the.long.game" },
  { ts: "2026-06-02 18:22:03", actor: "system", kind: "agent", action: "mailroom.draft.created", resource: "gmail_draft", tenant: "northwind.co" },
  { ts: "2026-06-02 18:15:29", actor: "ops@autonomux", kind: "admin", action: "admin.flag.rollout_changed", resource: "feature_flag", tenant: "—" },
  { ts: "2026-06-02 18:02:51", actor: "user", kind: "user", action: "memory.fact.deleted", resource: "agent_fact", tenant: "rivera.ops" },
  { ts: "2026-06-02 17:58:14", actor: "system", kind: "agent", action: "plaid.refresh.failed", resource: "integration", tenant: "rivera.ops" },
];

// ── Activity (user-facing mirror) ─────────────────────────────
const ADM_ACTIVITY = [
  { ts: "18:41", icon: "Mail", title: "Mailroom ranked 24 new messages", tenant: "northwind.co", detail: "Top: Q3 partnership terms" },
  { ts: "18:39", icon: "Coins", title: "Treasurer flagged an overdue bill", tenant: "lightspiritux", detail: "Invoice #4821 — $340" },
  { ts: "18:31", icon: "PenLine", title: "Scribe published a Substack post", tenant: "the.long.game", detail: "Velocity Is Not the Same as Wealth" },
  { ts: "18:20", icon: "Sparkles", title: "Oracle delivered the daily pull", tenant: "ember.studio", detail: "5 of Clubs — The Experimenter" },
  { ts: "18:08", icon: "CalendarClock", title: "Scheduler resolved a conflict", tenant: "marcus.flow", detail: "Moved 1:1 to 1:00 PM" },
];

// ── Compliance ────────────────────────────────────────────────
const ADM_COMPLIANCE_QUEUES = [
  { kind: "GDPR export", tenant: "halcyon.fm", requested: "2026-06-01", due: "in 27 days", status: "warn" },
  { kind: "GDPR deletion", tenant: "trial.gauss", requested: "2026-05-30", due: "in 25 days", status: "warn" },
  { kind: "GDPR export", tenant: "rivera.ops", requested: "2026-05-28", due: "completed", status: "ok" },
  { kind: "DPA generation", tenant: "northwind.co", requested: "2026-06-02", due: "ready to send", status: "ok" },
  { kind: "GDPR deletion", tenant: "old.account", requested: "2026-05-19", due: "completed", status: "ok" },
];
const ADM_COMPLIANCE_EVIDENCE = [
  { name: "SOC 2 Type II", status: "ok", note: "Continuous monitoring · 0 exceptions" },
  { name: "CASA Tier 2 (Gmail)", status: "ok", note: "Re-cert due Q4 2026" },
  { name: "Encryption at rest", status: "ok", note: "Per-tenant data keys · KMS rotated" },
  { name: "Pen test", status: "warn", note: "Annual test scheduled — 14 days out" },
];

// ── Billing ───────────────────────────────────────────────────
const ADM_BILLING_KPIS = [
  { label: "MRR", value: "$48.2K", delta: "+7.4%", dir: "up", foot: "month over month" },
  { label: "Net churn", value: "1.9%", delta: "-0.4pt", dir: "up", foot: "logo churn 2.6%" },
  { label: "LTV : CAC", value: "4.3×", delta: "+0.2", dir: "up", foot: "blended" },
  { label: "Failed payments", value: "6", dir: "down", delta: "-2", foot: "in dunning" },
];
const ADM_BILLING_PLANS = [
  { plan: "Founder", price: "$49/mo", subs: 142, mrr: "$6,958", share: 14 },
  { plan: "Pro", price: "$19/mo", subs: 1486, mrr: "$28,234", share: 59 },
  { plan: "Personal", price: "$9/mo", subs: 1320, mrr: "$11,880", share: 25 },
  { plan: "Free", price: "$0", subs: 4210, mrr: "$0", share: 2 },
];
const ADM_COHORT = [88, 79, 73, 70, 67, 66, 65];

// ── Feature flags ─────────────────────────────────────────────
const ADM_FLAGS = [
  { key: "voice_call_mode", desc: "Full voice-call surface (Phase 5 preview)", on: false, rollout: 0, scope: "Internal only" },
  { key: "autoroom_v2", desc: "New automation builder UI", on: true, rollout: 25, scope: "Founder tier" },
  { key: "treasurer_autopay", desc: "Auto-approve reversible bill pays", on: true, rollout: 10, scope: "Trusted tenants" },
  { key: "oracle_astrology_api", desc: "Swiss Ephemeris live charts", on: true, rollout: 100, scope: "All tenants" },
  { key: "scribe_linkedin", desc: "LinkedIn cross-post", on: true, rollout: 60, scope: "Pro + Founder" },
  { key: "haiku_triage", desc: "Route routine triage to Haiku 4.5", on: true, rollout: 100, scope: "All tenants" },
];

// ── Support tools ─────────────────────────────────────────────
const ADM_SUPPORT_TOOLS = [
  { id: "impersonate", icon: "UserCog", title: "Impersonate (with audit)", desc: "Open the tenant's app in a read-mostly session. Every action is logged to the audit chain." },
  { id: "reoauth", icon: "KeyRound", title: "Force re-OAuth", desc: "Invalidate a connected account's token and prompt the tenant to reconnect." },
  { id: "resetmem", icon: "Eraser", title: "Reset agent memory", desc: "Hard-delete episodic + structured memory for a tenant (GDPR Art. 17). Irreversible." },
  { id: "rebrief", icon: "RefreshCw", title: "Resend morning briefing", desc: "Re-run the briefing composite and re-deliver to the tenant's inbox." },
];

// ── Health / SLO board ────────────────────────────────────────
const ADM_HEALTH = [
  { name: "API gateway", status: "ok", uptime: "99.99%", slo: "99.9%", budget: 92, latency: "84ms p95" },
  { name: "Agent worker (Railway)", status: "ok", uptime: "99.95%", slo: "99.9%", budget: 78, latency: "1.4s p95" },
  { name: "Supabase (Postgres)", status: "ok", uptime: "99.98%", slo: "99.95%", budget: 88, latency: "12ms p95" },
  { name: "Upstash Redis", status: "ok", uptime: "99.99%", slo: "99.9%", budget: 96, latency: "3ms p95" },
  { name: "Plaid integration", status: "warn", uptime: "96.1%", slo: "99.0%", budget: 18, latency: "2.9s p95" },
  { name: "LLM adapter (OpenRouter)", status: "ok", uptime: "99.92%", slo: "99.5%", budget: 71, latency: "640ms p95" },
];

window.ADM = {
  NAV: ADM_NAV, KPIS: ADM_KPIS, SECTIONS: ADM_SECTIONS,
  TENANTS: ADM_TENANTS, TENANT_DETAIL: ADM_TENANT_DETAIL,
  COST_KPIS: ADM_COST_KPIS, COST_MODELS: ADM_COST_MODELS, COST_AGENTS: ADM_COST_AGENTS, COST_SPARK: ADM_COST_SPARK,
  INTEGRATIONS: ADM_INTEGRATIONS,
  QUEUE_KPIS: ADM_QUEUE_KPIS, QUEUE_JOBS: ADM_QUEUE_JOBS,
  AUDIT: ADM_AUDIT, ACTIVITY: ADM_ACTIVITY,
  COMPLIANCE_QUEUES: ADM_COMPLIANCE_QUEUES, COMPLIANCE_EVIDENCE: ADM_COMPLIANCE_EVIDENCE,
  BILLING_KPIS: ADM_BILLING_KPIS, BILLING_PLANS: ADM_BILLING_PLANS, COHORT: ADM_COHORT,
  FLAGS: ADM_FLAGS, SUPPORT_TOOLS: ADM_SUPPORT_TOOLS, HEALTH: ADM_HEALTH,
};
