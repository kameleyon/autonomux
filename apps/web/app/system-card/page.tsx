/**
 * apps/web/app/system-card/page.tsx
 *
 * AI System Card — published per EU AI Act Art. 50 (transparency) and
 * California SB 942 (AI disclosure). Describes which models we use, what
 * tools the agents may invoke, how user data is handled, and how a person
 * stays in the loop.
 *
 * Owner: [Comply + Herald] · Phase 1.0-C10
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI system card",
  description:
    "What models Autonomux uses, what they are allowed to do, how your data is handled, and how human oversight works.",
};

const LAST_UPDATED = "2026-05-29";
const VERSION = "1.0.0";

export default function SystemCardPage(): React.ReactElement {
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <h1 style={{ fontSize: "var(--fs-display-s)" }}>AI system card</h1>
      <p
        style={{
          color: "var(--muted)",
          fontFamily: "DM Mono, monospace",
          fontSize: "var(--fs-mono-meta)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          marginTop: "var(--sp-4)",
          marginBottom: "var(--sp-32)",
        }}
      >
        Last updated ·{" "}
        <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time> · v{VERSION}
      </p>

      <Section title="Why this document exists.">
        <p>
          The EU AI Act (Regulation 2024/1689) Art. 50 requires providers of
          general-purpose AI systems to publish a public summary of model
          identity, capabilities, data handling, and limitations. California
          SB 942 reaches similar disclosures for consumer-facing AI in the
          United States. This page is the canonical, dated answer. It is
          versioned, and we change the version pin when material details
          move.
        </p>
      </Section>

      <Section title="Model providers.">
        <p>
          Autonomux is a consumer of foundation models — we do not train
          our own. Inference runs on:
        </p>
        <ul>
          <li>
            <strong>Anthropic — Claude Sonnet 4.6.</strong> Primary
            reasoning model for orchestration and most sub-agent work.
          </li>
          <li>
            <strong>Anthropic — Claude Haiku 4.5.</strong> Fast model for
            classification, routing, and short-context follow-ups.
          </li>
        </ul>
        <p>
          Routing is configurable. The default is via{" "}
          <strong>OpenRouter</strong>, which acts as a transit proxy and
          billing aggregator; setting <code>LLM_PROVIDER=anthropic</code>{" "}
          switches to the direct Anthropic API. Both paths are bound by a
          Zero-Data-Retention agreement; neither path is permitted to use
          customer prompts or responses to train models.
        </p>
      </Section>

      <Section title="System prompts.">
        <p>
          The product is organised around a top-level orchestrator and a
          set of named sub-agents. Each carries a versioned system prompt
          with explicit guardrails. The classes:
        </p>
        <ul>
          <li>
            <strong>Orchestrator</strong> — decides which sub-agent answers,
            holds the user&rsquo;s long-term preferences, never sends an
            irreversible action without an explicit confirmation.
          </li>
          <li>
            <strong>Mailroom</strong> — reads and triages email; drafts
            replies for human review; auto-redacts detected health
            identifiers before any LLM call.
          </li>
          <li>
            <strong>Scheduler</strong> — proposes calendar holds and meeting
            slots; only commits after user confirmation.
          </li>
          <li>
            <strong>Scribe</strong> — drafts long-form writing in your
            voice; never publishes without your review.
          </li>
          <li>
            <strong>Oracle</strong> — answers questions over your knowledge
            base; cites sources from your own corpus.
          </li>
          <li>
            <strong>Treasurer</strong> — reads bank balances and
            transactions via Plaid (when this surface ships); proposes
            categorisation and budgets. Never initiates payments.
          </li>
          <li>
            <strong>Voice</strong> — handles voice input and produces voice
            output for hands-free use. No audio is retained after
            transcription unless you explicitly save it.
          </li>
          <li>
            <strong>Companion</strong> — conversational layer that holds
            tone and continuity. Refuses medical, legal, and personalised
            financial advice; routes those to the explicit refusal
            patterns documented in our Terms of service.
          </li>
        </ul>
      </Section>

      <Section title="Training data.">
        <p>
          Autonomux does not train, fine-tune, or distil any foundation
          model. We are a downstream consumer of Anthropic&rsquo;s
          published models. Anthropic publishes its own usage and training
          policy at{" "}
          <a
            href="https://www.anthropic.com/legal/commercial-terms"
            rel="noopener"
          >
            anthropic.com/legal/commercial-terms
          </a>
          .
        </p>
      </Section>

      <Section title="Use of your data.">
        <p>
          Customer prompts, sub-agent inputs, and model responses are
          covered by a Zero-Data-Retention contract with Anthropic.
          Specifically:
        </p>
        <ul>
          <li>
            Your content is <strong>not</strong> used to train our models
            (we have none) or Anthropic&rsquo;s models.
          </li>
          <li>
            Your content is <strong>not</strong> retained on the inference
            provider beyond the request lifetime needed to serve the
            response.
          </li>
          <li>
            We log the <em>shape</em> of each call — model, token counts,
            latency, cost — for billing and observability. We do not log
            the prompt body to our long-term log store.
          </li>
        </ul>
      </Section>

      <Section title="Tools the agents may call.">
        <p>
          Agents can only invoke tools that are explicitly registered. The
          current registry:
        </p>
        <ul>
          <li>
            <strong>Composio integrations</strong> — Gmail (read, draft,
            label, send), Google Calendar (read, propose, commit), Google
            Drive (read, organise). Each integration is OAuth-scoped to
            exactly what is needed.
          </li>
          <li>
            <strong>Plaid</strong> — bank account balances and
            transactions, read-only. Initiated only when the Treasurer
            surface ships and the user links an account.
          </li>
          <li>
            <strong>Internal database queries</strong> — scoped to the
            calling user&rsquo;s row-level-security context. The agent
            cannot read another tenant&rsquo;s data even if asked.
          </li>
          <li>
            <strong>Resend</strong> — transactional email for
            user-confirmed sends only.
          </li>
        </ul>
        <p>
          Every tool call is recorded in the audit log with the agent
          identity, the inputs, and the user-facing result.
        </p>
      </Section>

      <Section title="Bias, safety, and refusal behaviours.">
        <p>
          Foundation models reflect the biases of their training data and
          their alignment objectives. We do not claim to have removed those
          biases. We do constrain agent behaviour at the prompt and tool
          layer:
        </p>
        <ul>
          <li>
            <strong>Companion refuses</strong> personalised medical, legal,
            and financial advice. It surfaces general information and asks
            you to consult a qualified professional. (Founder is a
            registered nurse; this rule is non-negotiable.)
          </li>
          <li>
            <strong>HIPAA refusal.</strong> Mailroom auto-detects PHI
            patterns in inbound mail and redacts before any LLM call. The
            Terms of service §4 prohibit submitting identifiable health
            data; repeat violations may suspend the account.
          </li>
          <li>
            <strong>Limits of competence.</strong> Agents are encouraged to
            say &ldquo;I don&rsquo;t know&rdquo; rather than confabulate.
            We do not promise that this always succeeds.
          </li>
          <li>
            <strong>No autonomous spend.</strong> The Treasurer reads; it
            does not move money.
          </li>
        </ul>
      </Section>

      <Section title="Audit and logs.">
        <p>
          Every LLM call is recorded with model, token counts, latency, and
          cost. Every tool call is recorded with the agent, the inputs, and
          the user-visible outcome. Both feeds are written to the
          Merkle-chained <code>audit_log</code> table; see{" "}
          <Link href="/security">Security &rarr; Audit logging</Link>.
        </p>
      </Section>

      <Section title="Human oversight.">
        <p>
          The product is built around confirmation, not autonomy:
        </p>
        <ul>
          <li>
            <strong>Drafts before sends.</strong> Mailroom and Scribe
            produce drafts you can edit before any external action.
          </li>
          <li>
            <strong>Confirmation gates.</strong> Any irreversible action —
            sending an email, committing a calendar event, deleting data,
            changing billing — requires an explicit user confirmation
            inside the product.
          </li>
          <li>
            <strong>Edit, then commit.</strong> You can always rewrite an
            agent&rsquo;s output before it leaves your account.
          </li>
          <li>
            <strong>Step-up authentication.</strong> Sensitive actions also
            re-prompt for your TOTP factor; see{" "}
            <Link href="/security">Security &rarr; Authentication</Link>.
          </li>
        </ul>
      </Section>

      <Section title="Known limitations.">
        <ul>
          <li>
            <strong>Hallucination.</strong> Foundation models occasionally
            fabricate details. Treat agent output as a draft, not as a
            primary source.
          </li>
          <li>
            <strong>Recency.</strong> Models do not know events after their
            training cut-off unless we surface that context. The agents
            are instructed to say so.
          </li>
          <li>
            <strong>Language coverage.</strong> Primary support is English;
            quality on other languages is best-effort.
          </li>
          <li>
            <strong>No clinical use.</strong> Per the HIPAA refusal
            contract, Autonomux is not for patient care.
          </li>
        </ul>
      </Section>

      <Section title="Incident reporting.">
        <p>
          If you observe harm caused by an agent action, an unsafe refusal
          pattern, a privacy concern, or anything else that warrants
          urgent attention, email{" "}
          <a href="mailto:safety@autonomux.app">safety@autonomux.app</a>.
          The address is provisioned; DNS is being finalised before public
          launch. For pure security issues, see{" "}
          <Link href="/security">Security &rarr; Reporting a security issue</Link>.
        </p>
      </Section>

      <Section title="Related documents.">
        <ul>
          <li>
            <Link href="/security">Security</Link>
          </li>
          <li>
            <Link href="/legal/subprocessors">Subprocessor list</Link>
          </li>
          <li>
            <Link href="/legal/privacy">Privacy policy</Link>
          </li>
          <li>
            <Link href="/legal/terms">Terms of service</Link> (HIPAA
            refusal contract — §4)
          </li>
        </ul>
      </Section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function Section(props: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={{ marginBottom: "var(--sp-40)" }}>
      <h2
        style={{
          fontSize: "var(--fs-h-card)",
          marginBottom: "var(--sp-12)",
        }}
      >
        {props.title}
      </h2>
      <div
        style={{
          fontSize: "var(--fs-body)",
          lineHeight: "var(--lh-body)",
          color: "var(--ink-soft)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-12)",
          maxWidth: "78ch",
        }}
      >
        {props.children}
      </div>
    </section>
  );
}
