# Persona — the Autonomux freelancer ("Maya")

> **Status: provisional v1 (synthesized).** This persona is built from the PRD,
> the product's target ICP, and published freelancer-economy research — NOT yet
> from 5+ primary interviews. It exists to unblock Phase 0 design decisions and
> give the team one concrete person to build for. **It must be validated and
> revised against 5+ real Scout interviews before Phase 1 UI lock** (see B6 in
> the roadmap ledger). Treat every claim below as a hypothesis to confirm.

---

## Snapshot

**Maya Okafor**, 34. Independent brand + content designer, 3 years freelance
after 6 years in-house. Lives in Austin, TX. Sole proprietor (no LLC yet),
works from a home office and coffee shops. iPhone-first, MacBook for deep work.

- **Income:** ~$85k/yr gross, but *lumpy* — a $12k month can be followed by a
  $2k month. 4-7 active clients, mix of retainer and project.
- **Money tools today:** one business checking account, a personal account she
  "borrows from" both directions, a spreadsheet she updates when she remembers,
  Stripe/PayPal for invoices, and dread every quarter about estimated taxes.
- **Financial-literacy band:** *middle.* Comfortable with budgeting concepts and
  can read a bank statement; NOT comfortable with cash-flow forecasting,
  quarterly tax math, or "is this a good month or am I just relieved" judgment.

---

## Jobs To Be Done

When Maya opens a finance app, the job is rarely "look at a dashboard." It is:

1. **"Tell me if I'm actually okay."** She wants a plain answer to *can I pay
   myself this month, and is next month going to hurt?* — not 12 charts she has
   to interpret.
2. **"Warn me before it's a problem."** Rent, the quarterly tax set-aside, an
   annual software renewal — she wants a heads-up *days before*, not an overdraft
   notice after.
3. **"Make the boring parts disappear."** Chasing the late invoice, categorizing
   spend, remembering the recurring things — she wants an agent that handles the
   repeatable weight so she can do the client work only she can do.
4. **"Don't make me feel stupid about money."** The tone matters as much as the
   data. She has left tools that felt like a lecture.

---

## Current solution (and why it fails her)

- **A spreadsheet + gut feel.** Accurate only right after she updates it, which
  is rarely. Gives her no forecast and no warning.
- **Bank app balance-glancing.** The number lies: it doesn't know about the
  $3,400 invoice landing Friday or the $2k tax set-aside she should have carved
  out. "Looks fine" and "is fine" are different, and the app can't tell her which.
- **A quarterly panic with her accountant.** Expensive, retrospective, and by
  the time she's talking to them the money decision was already made.

The gap: **nothing reads across her lanes and tells her, in a sentence, what
this week is quietly carrying.** That sentence is the product.

---

## Trigger event (what makes her sign up)

A near-miss. She almost missed a quarterly estimated-tax payment because it
wasn't on any calendar, or she took a big project payment as "I'm rich this
month" and spent into a lean stretch. The feeling is *"I can't keep running my
money on vibes and memory."* She's looking the week that fear is fresh.

---

## Device of first use

**iPhone, in the evening, on the couch.** The first session is mobile, low-focus,
and skeptical. If the first screen is a wall of setup or a dense dashboard, she
bounces. If it reads her a one-paragraph "here's where you stand" and offers to
watch for the next bill, she stays. (This is why the mobile empty state and the
first-response quality are Phase-0 critical, not polish.)

---

## What earns her trust (and what breaks it instantly)

**Earns:**
- **Read-only first.** She will connect a bank account only if it's clearly
  view-only and she's told exactly what it can and can't do.
- **Honesty over cheerfulness.** "You spent 40% more on takeout this month" beats
  a gold star. She trusts a tool that tells her the uncomfortable thing kindly.
- **A confirmation gate on anything irreversible.** She wants to approve before
  anything is sent, paid, or published — always, until she chooses otherwise.
- **Plain "this is general info, not financial advice" honesty.** She's an adult;
  she just wants it stated once, not buried or oversold.

**Breaks trust:**
- Any hint the app moved money, sent something, or acted without asking.
- A confident dollar figure that turns out to be wrong or unexplained.
- Being upsold in a lean month. If it can see she's tight, it shouldn't pitch her.

---

## Anti-persona (who this is NOT for, and we won't distort the product to fit)

**"Trent," 27, day-trader / crypto-first.** Wants real-time market data, trade
execution, price alerts, and portfolio alpha. Autonomux is read-only, gives
**no** buy/sell recommendations, and is deliberately calm and slow. Building for
Trent would push us toward trade signals and hype — exactly the regulated,
trust-eroding surface we refuse to build. When a feature request sounds like
Trent, that's a signal to say no.

Secondary anti-persona: **the salaried W-2 employee with steady biweekly pay and
a single account.** Their money is predictable; the cash-flow-forecast core that
makes Maya's life better is largely wasted on them.

---

## Design implications (what this persona demands of Phase 0/1)

- The **first mobile response** must answer "am I okay?" in a sentence, grounded
  in real data, before any dashboard.
- **Proactive bill/tax warnings** are the hero, not a feature buried in a menu.
- **Tone** is warm, plain, grade-8 reading level, never a lecture, never hype.
- **Read-only + confirmation gate + the "general info, not advice" line** are
  non-negotiable trust primitives (ties to B7, B8, B9).
- **No trade signals, no "what to buy."** Ever. (Ties to the financial-advice
  guardrail.)

---

## Open questions to resolve in real interviews (do not ship assumptions)

1. Is the near-miss trigger real, or do freelancers sign up in a calm planning
   moment instead? (Changes onboarding urgency.)
2. Willingness to connect a bank read-only on day one vs. after trust is built.
   (Gates the Plaid-connect flow placement — see CR10.)
3. The true financial-literacy spread — how many are below Maya, and does the
   tone need to go even simpler?
4. Price sensitivity at $29/$79 in a lean month (ties to CR15 WTP research).
5. iOS vs. web as the genuine first-use surface.

_Revise this file after Scout completes 5+ interviews; mark it v2 and record the
interview evidence that confirmed or overturned each hypothesis above._
