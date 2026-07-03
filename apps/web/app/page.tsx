/**
 * apps/web/app/page.tsx
 *
 * Public marketing landing — native port of the imported prototype (was a
 * full-viewport iframe of Landing.html). Markup is server-rendered for SEO;
 * the live console ticker, scroll-reveal, and nav scroll-state run in the
 * <LandingEffects> client island. Styles come from ./landing.css, scoped under
 * `.lp`. Auth CTAs are real Next routes (/sign-in, /sign-up).
 */
import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/components/landing/Icon";

import { LandingEffects } from "./LandingEffects";
import "./landing.css";

export default function HomePage(): React.ReactElement {
  return (
    <div className="lp">
      {/* NAV */}
      <nav className="nav is-hero" id="nav">
        <div className="wrap nav__inner">
          <a className="brand" href="#top">
            <Image src="/logowhite.png" alt="autonomux" width={34} height={34} />
            <span className="brand__word">
              autonom<em>ux</em>
            </span>
          </a>
          <div className="nav__links">
            <a className="nav__link" href="#agents">What it does</a>
            <a className="nav__link" href="#how">How it works</a>
            <a className="nav__link" href="#trust">Accountability</a>
            <a className="nav__link" href="#pricing">Pricing</a>
          </div>
          <div className="nav__spacer" />
          <div className="nav__cta">
            <Link className="nav__login" href="/sign-in">Log in</Link>
            <Link className="btn btn--primary btn--sm" href="/sign-up">
              Get your AlterEgo <Icon name="arrow" />
            </Link>
          </div>
          <button
            type="button"
            className="nav__burger"
            id="nav-burger"
            aria-label="Open menu"
            aria-expanded="false"
            aria-controls="nav-mobile"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <div className="nav__mobile" id="nav-mobile">
          <a className="nav__mobile-link" href="#agents">What it does</a>
          <a className="nav__mobile-link" href="#how">How it works</a>
          <a className="nav__mobile-link" href="#trust">Accountability</a>
          <a className="nav__mobile-link" href="#pricing">Pricing</a>
          <Link className="nav__mobile-link" href="/sign-in">Log in</Link>
          <Link className="btn btn--primary" href="/sign-up">
            Get your AlterEgo <Icon name="arrow" />
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <header className="hero" id="top">
        <div className="hero__grid" />
        <div className="wrap hero__inner">
          <div>
            <div className="eyebrow eyebrow--light hero__eyebrow">Personal AI orchestrator</div>
            <h1 className="display hero__title">
              Your <em>AlterEgo</em> runs your inbox, calendar, money&nbsp;&amp; writing.
            </h1>
            <p className="lede hero__lede">
              One AI that lives inside your digital life and acts on your behalf — so you can run the rest.
            </p>
            <div className="hero__cta">
              <Link className="btn btn--primary" href="/sign-up">
                Get your AlterEgo <Icon name="arrow" />
              </Link>
              <a className="btn btn--onwash" href="#how">See how it works</a>
            </div>
            <div className="hero__note">
              <Icon name="shieldcheck" /> Every action confirmed, reversible, and audit-logged.
            </div>
          </div>

          {/* live console */}
          <div className="console reveal in">
            <div className="console__bar">
              <span className="console__dot" style={{ background: "#ff5f57" }} />
              <span className="console__dot" style={{ background: "#ff9050" }} />
              <span className="console__dot" style={{ background: "#e6a06a" }} />
              <span className="console__title">AlterEgo · today</span>
              <span className="console__live">
                <span className="console__pulse" /> Live
              </span>
            </div>
            <div className="console__body" id="console-body" />
          </div>
        </div>

        {/* runs on */}
        <div className="runson">
          <div className="wrap runson__inner">
            <span className="runson__label">Works across</span>
            <div className="runson__list">
              <span className="runson__item">Gmail</span>
              <span className="runson__item">Google Calendar</span>
              <span className="runson__item">Plaid</span>
              <span className="runson__item">Substack</span>
              <span className="runson__item">X</span>
              <span className="runson__item">LinkedIn</span>
              <span className="runson__item">Outlook</span>
            </div>
          </div>
        </div>
      </header>

      {/* MANIFESTO */}
      <section className="manifesto">
        <div className="wrap">
          <p className="manifesto__q reveal">
            Too many lanes. <b>None getting the attention they deserve.</b> AlterEgo takes the
            repeatable weight off every one of them.
          </p>
          <p className="manifesto__foot reveal" data-d="1">
            Built for polymath operators — the ones running four things at once.
          </p>
        </div>
      </section>

      {/* PILLARS */}
      <section className="section">
        <div className="wrap">
          <div className="section__head">
            <div className="eyebrow reveal">Why it&apos;s different</div>
            <h2 className="h2 reveal" data-d="1">
              Not another chatbot. An agent that&apos;s <em className="hot">accountable.</em>
            </h2>
            <p className="section-lede reveal" data-d="2">
              Assistants that forget you and can&apos;t be checked are toys. AlterEgo is built on
              three things the toys don&apos;t have.
            </p>
          </div>
          <div className="pillars">
            <div className="pillar reveal">
              <div className="pillar__num">01</div>
              <span className="pillar__ico"><Icon name="brain" /></span>
              <h3 className="h3">Persistent memory</h3>
              <p>
                It knows your people, your habits, your voice, and your recurring obligations — and
                gets measurably better at the things you keep asking. Your memory never leaves your
                tenant.
              </p>
            </div>
            <div className="pillar reveal" data-d="1">
              <div className="pillar__num">02</div>
              <span className="pillar__ico"><Icon name="scale" /></span>
              <h3 className="h3">Real judgment</h3>
              <p>
                It ranks, drafts, and decides what matters before you ask. Calm and competent — it
                says what it knows, asks when it doesn&apos;t, and never invents.
              </p>
            </div>
            <div className="pillar reveal" data-d="2">
              <div className="pillar__num">03</div>
              <span className="pillar__ico"><Icon name="fileclock" /></span>
              <h3 className="h3">Provable accountability</h3>
              <p>
                Every action it takes is confirmed when it counts, reversible when it can be, and
                written to a signed, tamper-evident audit log you can read and verify.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SUB-AGENTS */}
      <section className="section agents-sec" id="agents">
        <div className="wrap">
          <div className="section__head">
            <div className="eyebrow reveal">One AlterEgo, seven specialists</div>
            <h2 className="h2 reveal" data-d="1">
              It handles the lanes <em className="hot">you keep dropping.</em>
            </h2>
            <p className="section-lede reveal" data-d="2">
              You always talk to one AlterEgo. Behind it, specialists do the work — you never manage
              them.
            </p>
          </div>
          <div className="agents">
            <div className="agent reveal">
              <span className="agent__ico"><Icon name="mail" /></span>
              <div className="agent__name">Mailroom</div>
              <div className="agent__role">Email</div>
              <p className="agent__desc">
                Ranks your inbox, drafts replies in your voice, archives the noise — you approve or
                override.
              </p>
            </div>
            <div className="agent reveal" data-d="1">
              <span className="agent__ico"><Icon name="calendar" /></span>
              <div className="agent__name">Scheduler</div>
              <div className="agent__role">Calendar</div>
              <p className="agent__desc">
                Watches for conflicts, proposes slots, and drafts the decline for the meeting with no
                agenda.
              </p>
            </div>
            <div className="agent reveal" data-d="2">
              <span className="agent__ico"><Icon name="pen" /></span>
              <div className="agent__name">Scribe</div>
              <div className="agent__role">Writing</div>
              <p className="agent__desc">
                Turns your notes into drafts that sound like you — Substack, X, LinkedIn. Plan, draft,
                approve, publish.
              </p>
            </div>
            <div className="agent reveal" data-d="3">
              <span className="agent__ico"><Icon name="landmark" /></span>
              <div className="agent__name">Treasurer</div>
              <div className="agent__role">Money</div>
              <p className="agent__desc">
                Bank balance, upcoming bills, and honest spend insight — &quot;you spent 40% more on
                takeout this month.&quot;
              </p>
            </div>
            <div className="agent reveal">
              <span className="agent__ico"><Icon name="sparkles" /></span>
              <div className="agent__name">Oracle</div>
              <div className="agent__role">Ritual</div>
              <p className="agent__desc">
                Cardology, astrology, and tarot — a daily reading rendered fresh with your date
                context.
              </p>
            </div>
            <div className="agent reveal" data-d="1">
              <span className="agent__ico"><Icon name="message" /></span>
              <div className="agent__name">Voice</div>
              <div className="agent__role">Conversation</div>
              <p className="agent__desc">
                Long-running chat that remembers. Think out loud, and record or broadcast a topic when
                you want.
              </p>
            </div>
            <div className="agent reveal" data-d="2">
              <span className="agent__ico"><Icon name="heart" /></span>
              <div className="agent__name">Companion</div>
              <div className="agent__role">Wellness</div>
              <p className="agent__desc">
                Reading reminders, exercise nudges, a meditation timer, gratitude capture. Soft-touch,
                never gamified.
              </p>
            </div>
            <div className="agent reveal" data-d="3">
              <span className="agent__ico"><Icon name="sun" /></span>
              <div className="agent__name">Briefing</div>
              <div className="agent__role">Every morning</div>
              <p className="agent__desc">
                The whole roster distilled into one summary — in-app at login and in your inbox by
                6 AM.
              </p>
            </div>
          </div>
          <p className="agents-note reveal">
            Sub-agents are implementation detail. <b>You only ever manage one relationship.</b>
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="how">
        <div className="wrap">
          <div className="section__head">
            <div className="eyebrow reveal">The accountability loop</div>
            <h2 className="h2 reveal" data-d="1">
              It proposes. <em className="hot">You stay in command.</em>
            </h2>
            <p className="section-lede reveal" data-d="2">
              Delegation without losing control. Reversible work runs on its own; anything
              irreversible waits for your yes.
            </p>
          </div>
          <div className="loop">
            <div className="step reveal">
              <div className="step__dot">1</div>
              <h3>Briefs you</h3>
              <p>
                Every morning AlterEgo reads across your lanes and hands you one clear summary of what
                happened and what&apos;s next.
              </p>
              <span className="step__tag">Reads · summarizes</span>
            </div>
            <div className="step reveal" data-d="1">
              <div className="step__dot">2</div>
              <h3>Proposes</h3>
              <p>
                It drafts the reply, the decline, the reminder, the post — with its reasoning shown,
                never hidden.
              </p>
              <span className="step__tag">Drafts · ranks</span>
            </div>
            <div className="step reveal" data-d="2">
              <div className="step__dot">3</div>
              <h3>You approve</h3>
              <p>
                Irreversible actions — sending mail, paying a bill, publishing — wait for you. Set
                trusted rules to auto-approve the routine.
              </p>
              <span className="step__tag">Confirmation gate</span>
            </div>
            <div className="step reveal" data-d="3">
              <div className="step__dot">4</div>
              <h3>Acts &amp; logs</h3>
              <p>
                It executes, then writes the action to a signed audit log. Reversible? Undo it in one
                tap.
              </p>
              <span className="step__tag">Executes · records</span>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="section trust-sec" id="trust">
        <div className="wrap">
          <div className="trust-grid">
            <div className="trust__head">
              <div className="eyebrow eyebrow--light reveal">Built to be trusted with the real stuff</div>
              <h2 className="h2 reveal" data-d="1">
                You won&apos;t hand your money to a black box. Neither would we.
              </h2>
              <p className="section-lede reveal" data-d="2">
                Accountability isn&apos;t a feature bolted on. It&apos;s the foundation the whole
                agent stands on.
              </p>
              <ul className="trust__list">
                <li className="trust__item reveal">
                  <span className="trust__ico"><Icon name="fileclock" /></span>
                  <div>
                    <h4>Signed, tamper-evident audit log</h4>
                    <p>
                      Every write to your data is chained with a cryptographic hash. Anyone can replay
                      the chain and prove nothing was altered.
                    </p>
                  </div>
                </li>
                <li className="trust__item reveal" data-d="1">
                  <span className="trust__ico"><Icon name="check" /></span>
                  <div>
                    <h4>Confirmation gate on anything irreversible</h4>
                    <p>
                      Sending, paying, publishing — none happen without your explicit yes, unless
                      you&apos;ve set a trusted rule for it.
                    </p>
                  </div>
                </li>
                <li className="trust__item reveal" data-d="2">
                  <span className="trust__ico"><Icon name="lock" /></span>
                  <div>
                    <h4>Encrypted, per-tenant, never shared</h4>
                    <p>
                      Your memory is encrypted at rest with your own key and never used to train
                      across accounts. Ever.
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            {/* audit ledger visual */}
            <div className="ledger reveal" data-d="1">
              <div className="ledger__head">
                <Icon name="shieldcheck" />
                <span>Your audit log</span>
                <span className="ledger__verify">
                  <Icon name="check" /> Chain verified
                </span>
              </div>
              <div className="ledger__row">
                <span className="ledger__time">7:01 AM</span>
                <span className="ledger__act">mail.draft_reply</span>
                <span className="ledger__class">reversible</span>
              </div>
              <div className="ledger__row">
                <span className="ledger__time">6:35 AM</span>
                <span className="ledger__act">calendar.decline</span>
                <span className="ledger__class">external</span>
              </div>
              <div className="ledger__row">
                <span className="ledger__time">6:34 AM</span>
                <span className="ledger__act">treasurer.remind</span>
                <span className="ledger__class">reversible</span>
              </div>
              <div className="ledger__row">
                <span className="ledger__time">6:32 AM</span>
                <span className="ledger__act">email.archive ×6</span>
                <span className="ledger__class">reversible</span>
              </div>
              <div className="ledger__row">
                <span className="ledger__time">6:30 AM</span>
                <span className="ledger__act">briefing.compose</span>
                <span className="ledger__class">read</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="pricing">
        <div className="wrap">
          <div className="section__head center">
            <div className="eyebrow reveal" style={{ justifyContent: "center" }}>Pricing</div>
            <h2 className="h2 reveal" data-d="1">
              Start free. Grow into your <em className="hot">full AlterEgo.</em>
            </h2>
          </div>
          <div className="pricing">
            <div className="plan reveal">
              <div className="plan__name">Free</div>
              <div className="plan__tag">Try it. See what a second self feels like.</div>
              <div className="plan__price">$0</div>
              <div className="plan__budget">100k tokens / mo</div>
              <ul className="plan__feats">
                <li><Icon name="check" /> Read-only Gmail &amp; Calendar</li>
                <li><Icon name="check" /> Daily Oracle reading</li>
                <li><Icon name="check" /> Morning briefing</li>
              </ul>
              <Link className="btn btn--ghost" href="/sign-up">Start free</Link>
            </div>

            <div className="plan reveal" data-d="1">
              <div className="plan__name">Personal</div>
              <div className="plan__tag">Your AlterEgo starts acting, not just watching.</div>
              <div className="plan__price">$29<span>/mo</span></div>
              <div className="plan__budget">1M tokens / mo</div>
              <ul className="plan__feats">
                <li><Icon name="check" /> Everything in Free</li>
                <li><Icon name="check" /> Gmail write &amp; reply drafts</li>
                <li><Icon name="check" /> Scribe drafting</li>
                <li><Icon name="check" /> Companion wellness</li>
              </ul>
              <Link className="btn btn--ghost" href="/sign-up">Choose Personal</Link>
            </div>

            <div className="plan plan--feature reveal" data-d="2">
              <span className="plan__flag">Most popular</span>
              <div className="plan__name">Pro</div>
              <div className="plan__tag">The full agent — your AlterEgo runs your stuff.</div>
              <div className="plan__price">$79<span>/mo</span></div>
              <div className="plan__budget">5M tokens / mo</div>
              <ul className="plan__feats">
                <li><Icon name="check" /> Everything in Personal</li>
                <li><Icon name="check" /> Scribe publishing</li>
                <li><Icon name="check" /> Treasurer with Plaid</li>
                <li><Icon name="check" /> Outlook + X + LinkedIn</li>
              </ul>
              <Link className="btn btn--primary" href="/sign-up">
                Choose Pro <Icon name="arrow" />
              </Link>
            </div>

            <div className="plan reveal" data-d="3">
              <div className="plan__name">Founder</div>
              <div className="plan__tag">For the polymath running four things at once.</div>
              <div className="plan__price">$199<span>/mo</span></div>
              <div className="plan__budget">20M tokens / mo</div>
              <ul className="plan__feats">
                <li><Icon name="check" /> Everything in Pro</li>
                <li><Icon name="check" /> Multi-account</li>
                <li><Icon name="check" /> Priority queue</li>
                <li><Icon name="check" /> Monthly 1:1 with the team</li>
              </ul>
              <Link className="btn btn--ghost" href="/sign-up">Choose Founder</Link>
            </div>
          </div>
          <p className="pricing-note reveal">
            Save 20% on annual · TOTP 2FA on every account · cancel anytime
          </p>
        </div>
      </section>

      {/* FINALE */}
      <section className="finale">
        <div className="wrap">
          <h2 className="reveal">
            Run the things <em>only you</em> can run.
          </h2>
          <p className="lede reveal" data-d="1">
            Let your AlterEgo handle the rest — accountably, from your very first morning.
          </p>
          <div className="finale__cta reveal" data-d="2">
            <Link className="btn btn--primary" href="/sign-up">
              Get your AlterEgo <Icon name="arrow" />
            </Link>
            <a className="btn btn--ghost" href="#agents">Explore what it does</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="wrap">
          <div className="footer__top">
            <div className="footer__brand">
              <a className="brand" href="#top">
                <Image src="/logowhite.png" alt="autonomux" width={32} height={32} />
                <span className="brand__word">
                  autonom<em>ux</em>
                </span>
              </a>
              <p className="footer__tagline">
                Your AlterEgo runs your inbox, your calendar, your money, and your writing — so you
                can run the rest.
              </p>
            </div>
            <div className="footer__col">
              <h5>Product</h5>
              <a href="#agents">What it does</a>
              <a href="#how">How it works</a>
              <a href="#trust">Accountability</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div className="footer__col">
              <h5>Trust</h5>
              <a href="#trust">Security</a>
              <a href="#trust">Audit log</a>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
            </div>
            <div className="footer__col">
              <h5>Company</h5>
              <a href="#">About</a>
              <Link href="/sign-in">Log in</Link>
              <Link href="/sign-up">Get started</Link>
              <a href="#">Contact</a>
            </div>
          </div>
          <div className="footer__bottom">
            <span className="dm">© 2026 autonomux</span>
            <span>
              Do not paste patient information into AlterEgo. We are not a covered entity and do not
              accept PHI.
            </span>
          </div>
        </div>
      </footer>

      <LandingEffects />
    </div>
  );
}
