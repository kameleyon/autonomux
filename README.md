# Autonomux

> Your AlterEgo runs your inbox, your calendar, your money, and your writing — so you can run the rest.

A SaaS platform that gives each paying user a personal AI orchestrator — their **AlterEgo** — that lives inside their digital life and acts on their behalf across email, calendar, finances, writing, and wellness, under explicit ongoing user control.

## What this is

Autonomux is a multi-tenant agent platform. Each user gets one AlterEgo (the orchestrator) backed by specialist sub-agents:

| Sub-agent | Domain |
|---|---|
| Mailroom | Email triage + reply drafts |
| Scheduler | Calendar + conflict detection |
| Scribe | Writing + Substack auto-publish |
| Oracle | Cardology + astrology + tarot |
| Treasurer | Bank balance + bills (Plaid) |
| Voice | Long-form chat + topic broadcast |
| Companion | Wellness nudges + reading + exercise |

## Docs

- **[docs/PRD.md](./docs/PRD.md)** — Product Requirements Document (v0.1)
- **[docs/ROADMAP.md](./docs/ROADMAP.md)** — Detailed phased roadmap

## Stack (locked)

| Layer | Choice |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Web + Admin | Next.js 15 (App Router) on Vercel |
| Worker | Node 20 + BullMQ on Railway · Upstash Redis as queue |
| DB | Supabase Postgres + pgvector + RLS |
| Auth | Supabase Auth + TOTP mandatory + WebAuthn |
| LLM | Anthropic Claude — Sonnet 4.6 (orchestration) + Haiku 4.5 (triage) |
| Integrations | Composio (Gmail, Calendar, X, LinkedIn, YouTube, Substack-via-email) + Plaid (US banking) |
| Mobile | PWA Phase 1.1-1.4 → Capacitor native shell Phase 1.5 |
| Secrets | Doppler · AWS KMS for envelope keys |
| Observability | Axiom (logs) · Sentry (errors) · OpenTelemetry (traces) |
| Compliance | Vanta · SOC 2 Type II in audit by month 6 |

## Status

**Phase 0 (autonomux2/) — cardology weekly forecast tool — done.**
Phase 1.0 Foundation scoped, not yet kicked off. See [ROADMAP.md](./docs/ROADMAP.md).

## License

Private. All rights reserved.
