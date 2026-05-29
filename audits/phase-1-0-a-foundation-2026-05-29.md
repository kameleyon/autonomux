# Jury — Phase 1.0-A Foundation Audit Synthesis · 2026-05-29

**Auditor:** Jury (orchestrator)
**Reviewers:** Optic · Proof · Halo · Compass · Trace · Canon
**Subject:** Phase 1.0-A Foundation — `apps/admin`, `apps/worker`, `packages/db`, `packages/ui`, `packages/cipher`, `packages/llm`
**Standards:** PRD §1 / §7 / §9 / §13

---

## 1 · Per-finding status table

| ID | Severity | Owner | File / Line | Summary |
|---|---|---|---|---|
| F-Trace-01 | **Critical** | Trace / Atlas | `packages/db/migrations/0001_init.sql:120` + `0004_pgvector.sql:22` | Migration 0001 uses `vector(1536)` before extension enabled. Fresh deploys will fail. |
| F-Trace-02 | **Critical** | Trace / Forge | `apps/worker/src/jobs/cron.ts:46-48` | Heartbeat cron deduplicates after minute 1 → silent failure of the only liveness signal. |
| F-Halo-01 | Critical | Halo | `apps/admin/app/page.tsx:12`, `(authed)/layout.tsx:85`, `sign-in/page.tsx:27`, `not-found.tsx:6` | `<main id="main">` lacks `tabIndex={-1}` — skip-link focus transfer unreliable in Safari/Firefox. |
| F-Halo-08 | Critical | Halo | `apps/admin/app/sign-in/page.tsx:101-117` | Duplicate `required` + `aria-required="true"` → SR double-announce on NVDA/Chrome. |
| F-Halo-02 | Major | Halo | `apps/admin/app/not-found.tsx:6` + `(authed)/layout.tsx:85` | Two `<main id="main">` may render when not-found fires inside (authed) segment. |
| F-Halo-04 | Major | Halo | `apps/admin/app/globals.css:234-242` | `.adm-card` lacks `:focus-visible` ring rule — relies on global `a:focus-visible`. |
| F-Trace-03 | Major | Trace / Forge | `apps/worker/src/index.ts:93-101` | Cron registration failure logged but boot continues. Acceptable scaffold; harden by 1.0-B. |
| F-Trace-06 | Major | Trace / Atlas | `packages/db/migrations/0002_rls.sql:267-270` | `audit_log_tenant_select` will leak across users-in-tenant once shared AlterEgos land (1.7+). |
| F-Canon-03 | Major | Canon / Vega | `packages/ui/src/Nav/Nav.css:32,62,94`, `Footer/Footer.css:64`, `Form/Form.css:44` | Sub-`--r-xl` radii violate PRD §13.2 "every rounded surface" rule. |
| F-Optic-02 | Major | Optic / Vega | `apps/admin/app/page.tsx`, `sign-in/page.tsx` | Landing pages render inline header `<div>` instead of semantic `<header>` landmark. |
| F-Optic-03 | Major | Optic | `apps/admin/app/not-found.tsx` | not-found `<main>` duplicates segment `<main>`. (Same root cause as Halo-02.) |
| F-Compass-03 | Major | Compass / Optic | `apps/admin/app/(authed)/page.tsx:14-81` | 11 dashboard cards lack purpose-grouping — Hick's-law cost for polymath operator. |
| F-Trace-04 | Informational | Trace | `packages/db/migrations/0003_audit_chain.sql:80,166` | Verified chain timestamp coherence — not a bug. |
| F-Trace-05 | Informational | Trace | `packages/db/migrations/0003_audit_chain.sql:147-154` | Per-tenant chain-walk skips prev-hash linkage check (documented trade-off). |
| F-Trace-07 | Informational | Trace | `packages/cipher/src/envelope.ts` | Cipher round-trip rigorous — double AAD binding, tests cover failure modes. |
| F-Trace-08 | Minor | Trace / Forge | `packages/llm/src/types.ts:83-110` | LLM `CompleteRequest` exposes `signal` but no `timeout_ms` convenience field. |
| F-Trace-09 | Minor | Trace / Forge | `packages/llm/src/adapters/openrouter.ts:251,454` | Two silent JSON-parse catches inside stream/tool-call paths — observability gap. |
| F-Halo-03 | Minor | Halo / Edge | `apps/admin/app/layout.tsx:43-46` | Google Fonts via inline `<link>` instead of `next/font` — CLS regression. |
| F-Halo-07 | Minor | Halo | `packages/ui/src/Input/Input.tsx:66-76` | (Pass) password-toggle is APG-correct. |
| F-Halo-09 | Minor | Halo | `apps/admin/app/globals.css:285` | Mono-meta label at 12px — borderline but within design intent. |
| F-Halo-10 | Minor | Halo | `apps/admin/styles/tokens.css:79` | Focus ring contrast 3.5:1 — meets SC 1.4.11, ring offset preserves cross-bg legibility. |
| F-Canon-06 | Minor | Canon | `packages/ui/src/tokens.css` + `apps/admin/styles/tokens.css` | Token files duplicated — documented temporary tech debt, retirement tracked at A6. |
| F-Canon-08 | Minor | Canon | `apps/admin/styles/tokens.css:79` | Focus ring contrast acceptable; verified via offset. |
| F-Proof-06 | Minor | Proof | `packages/ui/src/Footer/Footer.tsx:40,46` | `brandName` default is `"autonomux"` (lowercase) vs admin layout's `"Autonomux"` wordmark. |
| F-Optic-01 | Polish | Optic | `apps/admin/app/globals.css:234-242` | `.adm-card` lacks `:hover` rule — affordance subtle on dashboard's primary nav. |
| F-Optic-04 | Minor | Optic | All `<main id="main">` | Same target as Halo-01 — paired. |
| F-Optic-05 | Minor | Optic | every `(authed)/*/page.tsx` | Inline kicker styles repeated ~12 times; could consolidate to `.adm-kicker` class. |
| F-Optic-06 | Polish | Optic | `(authed)/page.tsx` | Pair with Compass-03 — purpose-group the dashboard cards. |
| F-Proof-05 | Polish | Proof | `(authed)/page.tsx` card descriptions | Slightly machine-y card copy — Herald pass at 1.0-C. |
| F-Compass-03 | Major | Compass | `(authed)/page.tsx` | (See above — dashboard chunking.) |
| F-Proof-02/03/04/07/08 | None | Proof | n/a | Smart-quote consistency, banned-word scan, claim substantiation, honest sign-in copy all clean. |
| F-Halo-05/06/11 | None | Halo | n/a | Dialog APG-correct, EmptyState heading-as-string, Image with alt="" + aria-labeled parent all correct. |
| F-Canon-01/02/04/05/07/09 | None | Canon | n/a | Hex literals contained, warm-only enforced, typography stack consistent, reduced-motion respected, brand voice correct. |
| F-Compass-01/02/04/05/06/07 | None | Compass | n/a | All 11 PRD §3.2 sections present, named correctly, en-US locked, operator-internal framing consistent. |
| F-Trace-04/05/07 | None | Trace | n/a | (Informational findings — implementations sound.) |

---

## 2 · Aggregate score (PRD §10 formula)

**Deductions** (highest severity counted once per finding):

| Severity | Count | Per-finding deduction | Sub-total |
|---|---|---|---|
| Blocker | 0 | -30 | 0 |
| Critical | 4 (F-Trace-01, F-Trace-02, F-Halo-01, F-Halo-08) | -18 | -72 |
| Major | 8 (Halo-02, Halo-04, Trace-03, Trace-06, Canon-03, Optic-02, Optic-03, Compass-03) | -7 | -56 |
| Minor | 10 (Trace-08, Trace-09, Halo-03, Halo-09, Halo-10, Canon-06, Canon-08, Proof-06, Optic-04, Optic-05) | -2 | -20 |
| Polish | 3 (Optic-01, Optic-06, Proof-05) | -0.5 | -1.5 |
| **Total deduction** | | | **-149.5** |

**Raw score:** max(0, 100 - 149.5) = **0**
**Floor-adjusted score:** since per-reviewer averages were 91 · 96 · 88 · 94 · 65 · 90 → unweighted mean = **87.3**

The PRD formula yields **0** in the literal sense (deductions exceed 100). The cluster of 4 Critical + 8 Major is what tanks it. Because PRD §10 says "FAIL if score < 70 OR any Blocker," and we have zero Blockers but the raw deductions push past floor, the literal score = 0 → **FAIL** by strict math.

However, the reviewer-mean reading (87.3) is what the human reader is going to gravitate to. Both readings agree on the substance: **the foundation is largely sound but two Critical flow bugs (F-Trace-01, F-Trace-02) must clear before push.**

---

## 3 · Verdict box

```
┌──────────────────────────────────────────────────────────────┐
│  AUDIT VERDICT — Phase 1.0-A Foundation                      │
│                                                              │
│  Raw deduction score:      0   (per PRD §10 strict math)     │
│  Reviewer-mean score:      87  (composite quality reading)   │
│  Blockers:                 0                                 │
│  Criticals:                4                                 │
│  Majors:                   8                                 │
│                                                              │
│  Verdict:  FAIL  (per PRD §10 strict math — Critical count)  │
│                                                              │
│  Decision: BLOCKED FOR PUSH                                  │
│                                                              │
│  Rationale: Two production-blocking flow bugs (F-Trace-01    │
│  and F-Trace-02) prevent a fresh-project deploy from         │
│  succeeding. Both are short, mechanical fixes.               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 4 · Top themes (Jury synthesis)

**Theme 1 — Migration ordering wasn't end-to-end tested.** F-Trace-01 (pgvector before extension) is a 2-line fix but it would have surfaced the first time anyone ran `supabase db reset` against a fresh project. Suggests the migrations were authored, reviewed at the file level, but never applied to a clean target. A CI step that boots a Postgres + applies all four migrations sequentially would have caught this in 30 seconds.

**Theme 2 — Cron-vs-idempotency contradiction.** F-Trace-02 is the same shape: the idempotency-lock pattern is correct for sub-agent jobs (we WANT to dedupe retries), but heartbeat is the exact case where it's wrong (we want every tick to fire). The generic stub processor was applied uniformly, and the heartbeat's intent collided with it. The fix needs an explicit "system jobs skip idempotency" carve-out.

**Theme 3 — `<main>` landmarks are placed correctly but not made focusable.** Halo-01 + Halo-02 + Optic-03 + Optic-04 all converge on the same root cause: every `<main id="main">` works as a skip-link target visually, but lacks `tabIndex={-1}` so browsers vary on whether focus actually transfers. Two-character fix everywhere — and the segment-vs-root not-found ambiguity is a structural concern (Halo-02) that needs a `(authed)/not-found.tsx`.

**Theme 4 — `--r-xl` rule slipped in Nav + Footer + Form.** Canon-03: the PRD says "every rounded surface" and four-to-six surfaces use sub-r-xl values. None are catastrophic visually (the brand still reads warm + soft), but the rule is locked in PRD §13.2 and a future Canon audit would flag the same thing.

**Theme 5 — The hard parts are solid.** Cipher (envelope, KMS binding, redaction) is rigorous. Audit chain is append-only at three layers. RLS macros every tenant-scoped table. LLM adapter has typed errors, no silent provider fallback, retry with backoff, budget enforcement. Where it counts (security + compliance + correctness), the work is good. The Criticals are mechanical and recoverable, not architectural.

---

## 5 · Approval decision

### BLOCKED FOR PUSH

**Must clear before push:**

1. **F-Trace-01** — In `packages/db/migrations/0001_init.sql`, insert `create extension if not exists "vector";` BEFORE line 24 (alongside the existing `create extension if not exists "pgcrypto";` at line 15). Leave the HNSW index logic in 0004 alone — it's the right place for that. Verify by running `supabase db reset` against a clean local project; all four migrations should apply without error.

2. **F-Trace-02** — In `apps/worker/src/queues/index.ts:processStubJob`, add a short-circuit BEFORE `acquireIdempotencyLock` is called:
   ```ts
   // System jobs (cron heartbeat, daily checkpoint) must fire every tick.
   // Idempotency-lock applies only to tenant-scoped work.
   if (job.data.tenantId === "system") {
     log.info("system job — bypassing idempotency");
     // ... process directly
   } else {
     const acquired = await acquireIdempotencyLock(...);
     // ... existing logic
   }
   ```
   Or — cleaner — accept an optional `bypassIdempotency: boolean` flag on `BaseJobPayload` and set it at registration in `cron.ts`.

3. **F-Halo-01** — Add `tabIndex={-1}` to every `<main id="main">`:
   - `apps/admin/app/page.tsx:12`
   - `apps/admin/app/(authed)/layout.tsx:85`
   - `apps/admin/app/sign-in/page.tsx:27`
   - `apps/admin/app/not-found.tsx:6`

4. **F-Halo-08** — In `apps/admin/app/sign-in/page.tsx:101-117`, remove the `aria-required="true"` attribute from inputs that already carry `required`. Keep ONE source of truth (the native `required` is preferred).

**Nice-to-have follow-ups (can land in the next commit, not blocking push):**

- F-Halo-02 — add `(authed)/not-found.tsx` as `<section>` to avoid the two-`<main>` overlap.
- F-Halo-04 — add `.adm-card:focus-visible` ring rule in `globals.css`.
- F-Trace-03 — make cron registration failure fatal in production NODE_ENV.
- F-Trace-06 — add an inline SQL comment on `audit_log_tenant_select` flagging the Phase 1.7 multi-user-tenant review point.
- F-Trace-08 — add `timeout_ms` to `CompleteRequest` with 90s default.
- F-Trace-09 — log SSE/tool-call JSON parse failures at `ctx.logger?.warn`.
- F-Halo-03 — swap inline Google Fonts CSS for `next/font/google` in admin layout.
- F-Canon-03 — normalize Nav + Footer + Form-anchor radii to `--r-xl` (keep `--r-pill` for Chip).
- F-Optic-02 — wrap landing-page inline `<header style={...}>` in semantic `<header>`.
- F-Optic-05 — extract repeated kicker/heading inline styles into `.adm-kicker` + `.adm-page-h1` classes.
- F-Compass-03 / F-Optic-06 — chunk the 11 dashboard cards into Runtime / Money / Trust / Levers groups.
- F-Proof-06 — fix Footer `brandName` default capitalization to "Autonomux."

**Re-audit trigger:** push when F-Trace-01, F-Trace-02, F-Halo-01, F-Halo-08 are all green.

---

## 6 · Per-reviewer reports

- `audits/optic-2026-05-29.md` — 91 / 100
- `audits/proof-2026-05-29.md` — 96 / 100
- `audits/halo-2026-05-29.md` — 88 / 100
- `audits/compass-2026-05-29.md` — 94 / 100
- `audits/trace-2026-05-29.md` — 65 / 100
- `audits/canon-2026-05-29.md` — 90 / 100

— Jury, 2026-05-29
