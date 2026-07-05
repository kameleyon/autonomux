# DRAFT Legal Opinion — Autonomux "Treasurer" output is informational, not regulated advice

> **THIS IS A DRAFT FOR COUNSEL REVIEW. IT IS NOT LEGAL ADVICE AND IS NOT AN
> OPINION OF COUNSEL.** It was prepared by the engineering team to (a) frame the
> question precisely, (b) lay out the analysis and the product facts a lawyer
> needs, and (c) enumerate the conditions the product must satisfy for the
> conclusion to hold. A licensed attorney in the relevant US state(s) and the EU
> must review, correct, and sign it before it is relied upon. Roadmap blocker
> **B7** is closed only when a signed opinion (not this draft) is on file, and it
> gates Plaid **Production** submission and the App Store checklist (Guidelines
> 3.2.1 and 5.2.1).

**Prepared:** 2026-07-05 · **For signature by:** ______________________ (counsel)
**Product:** Autonomux — AlterEgo personal AI orchestrator, "Treasurer" surface.

---

## 1. The question presented

Does the Autonomux "Treasurer" surface — which reads a user's own financial data
(via Plaid, **read-only**) and returns plain-language summaries, cash-flow
estimates, spending observations, and bill reminders — constitute **regulated
financial, investment, or tax advice**, or the business of an **investment
adviser**, **money transmitter**, or **broker-dealer**, under (a) US federal and
state law and (b) EU law? And what conditions keep it on the informational,
non-regulated side of the line?

## 2. Short answer (to be confirmed by counsel)

As currently designed and constrained, Treasurer is intended to be a
**general-informational / educational tool**, not regulated advice, because it:

- is **read-only** (it never moves, holds, or transmits money — so it is not a
  money transmitter and holds no custody);
- gives **no securities recommendations** — it never tells the user what to buy,
  sell, or hold, and does not opine on specific securities (a core element of the
  Investment Advisers Act of 1940 §202(a)(11) definition);
- provides **impersonal, educational information about the user's own data** (the
  user's balances, their upcoming bills, their spending patterns), not
  individualized advice as to the advisability of investing in securities;
- carries a **conspicuous disclosure** at every session that it is an AI and
  provides general information, not professional financial, legal, or tax advice.

Counsel must confirm this holds in each state where users reside and in the EU,
and must confirm the boundary is not crossed by any specific Treasurer output.

## 3. Product facts counsel should rely on (verify against the build)

1. **Read-only data access.** Plaid is used in read-only mode; Autonomux cannot
   initiate transfers, payments, or trades. (Money movement is explicitly a
   later, separately-regulated, gated phase — not in this scope.)
2. **No securities recommendations.** The system prompt contains a locked
   financial-advice guardrail (`packages/orchestrator/src/system-prompt.ts`,
   `FINANCIAL_ADVICE`) that forbids recommending any specific security, fund,
   token, or trade, and limits output to general educational information.
3. **Session-start disclosure.** An AI-interaction + not-professional-advice
   disclosure renders at chat session start
   (`apps/web/public/prototypes/autonomux/alterego/components.jsx`).
4. **Per-figure labeling (planned).** Every Treasurer dollar figure will be
   labeled AI-generated (roadmap B8); a non-dismissable advice banner will sit
   above the first Treasurer message (roadmap B9).
5. **Confirmation gate.** Anything irreversible requires explicit user approval.

## 4. Framework the opinion should address

### 4.1 US federal
- **Investment Advisers Act of 1940** — is Autonomux "in the business of"
  advising "as to the value of securities or as to the advisability of investing
  in, purchasing, or selling securities … for compensation"? Address the
  **"solely incidental" / publisher's exception** and the fact that Treasurer
  discusses the user's own cash flow, not securities selection.
- **Money-transmitter status (FinCEN / BSA)** — confirm read-only access means no
  transmission and no MSB registration.
- **CFPB / UDAAP** — confirm disclosures are not deceptive; the "general info, not
  advice" line must be accurate and not contradicted anywhere in the UI (note:
  the session disclosure and the guardrail were reconciled on 2026-07-05).
- **IRS Circular 230** — confirm tax reminders/observations do not constitute
  "practice before the IRS" or paid tax advice.

### 4.2 US state
- **State investment-adviser registration** — many states mirror the federal
  definition; confirm no state triggers registration for impersonal educational
  output about the user's own finances.
- **State money-transmitter licensing** — confirm read-only status avoids the
  ~49-state MTL regime.
- Identify the **specific states** to opine on (at minimum the states of the
  first user cohort; ideally a 50-state read or a representative set).

### 4.3 EU / UK
- **MiFID II** — is any output "investment advice" (a personal recommendation
  concerning specific financial instruments)? Educational, non-instrument-specific
  output about the user's own accounts should fall outside, but confirm.
- **EU AI Act Art. 50(1)** — transparency: users must be told they are
  interacting with an AI. Confirm the session-start disclosure satisfies this at
  Phase 1 (ties to B8/CR12).
- **PSD2 / open banking** — confirm the read-only AIS (account information
  service) posture and whether Autonomux relies on Plaid's regulated status or
  needs its own registration/agent status.
- **GDPR** — confirm the lawful basis for processing financial data and the DPA
  chain (Plaid, the LLM provider — see CR11).

## 5. Conditions the opinion should make load-bearing

The "informational, not regulated" conclusion should be expressly **conditioned**
on the product continuing to:

1. remain **read-only** (any move to initiate payments/trades voids this opinion
   and triggers fresh analysis);
2. **never** output a specific-security buy/sell/hold recommendation;
3. render the **AI + not-professional-advice disclosure** at every session and
   label Treasurer figures as AI-generated;
4. keep the **confirmation gate** on all irreversible actions;
5. re-seek an opinion before entering any new state/country or adding any
   money-movement, lending, or trading feature.

## 6. What counsel must deliver to close B7

A signed opinion letter that (a) answers §1 for the identified US state(s) and
the EU, (b) adopts or corrects §2, (c) confirms the §5 conditions are sufficient,
and (d) is dated and on file before Plaid Production submission and App Store
Connect submission.

---

_Engineering owner: hand this draft, plus links to the cited code, to counsel.
Replace this file with the signed opinion (or link to it) when received, and flip
B7 to done in the roadmap ledger._
