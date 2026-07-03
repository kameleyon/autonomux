"use client";

/**
 * apps/web/components/chat/SubAgentCard.tsx
 *
 * Renders one `sub_agent_result` event inline in the chat stream.
 *
 * Discrimination: the union switches on `result.kind`. Today only
 * `mailroom` exists; adding Scheduler/Oracle/etc. is a new `case` here
 * + a new renderer function below — no other UI code needs to change.
 *
 * Importance dots: 1-5 filled dots using the warm palette only — gold
 * for top-importance (4-5), amber for mid (2-3), muted for routine (1).
 * No greens/reds/blues; per project memory + PRD §13.2.
 *
 * Approve/Dismiss buttons are stubs: the real action lands in a later
 * sprint (Mailroom write-side / one-click apply). For now they post to
 * `noopMailroomAction` Server Action which logs intent only.
 *
 * Owner: [Cluster C · Vega + Optic]
 */

import type {
  MailroomMessage,
  SubAgentResultPayload,
  SubAgentName,
} from "@/lib/chat/types";
// TODO(sprint-mailroom-apply): real Approve/Dismiss Server Action lands when
// the Mailroom write-side (apps/worker mailroom.apply queue) is wired. For
// now `noopMailroomAction` just records intent server-side so we don't ship
// a button that pretends to do nothing.
import { noopMailroomAction } from "./mailroom-actions";

export interface SubAgentCardProps {
  invocationId: string;
  subAgent: SubAgentName;
  /** Undefined while the sub-agent is still running (sub_agent_start only). */
  result?: SubAgentResultPayload;
  /** Latest `sub_agent_progress` message while running; drives live feedback. */
  progress?: string;
}

export function SubAgentCard({
  invocationId,
  subAgent,
  result,
  progress,
}: SubAgentCardProps): React.ReactElement {
  // Loading state — we received `sub_agent_start` but no `sub_agent_result`
  // yet. Show a tasteful skeleton card with the sub-agent name + spinner.
  if (result === undefined) {
    return (
      <article
        aria-busy="true"
        aria-live="polite"
        style={cardShellStyle}
      >
        <header style={cardHeaderStyle}>
          <span style={subAgentLabelStyle}>{labelFor(subAgent)}</span>
          <span
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: "var(--fs-mono-meta)",
              color: "var(--brand-orange)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            Running…
          </span>
        </header>
        <p
          style={{
            margin: 0,
            color: "var(--ink-soft)",
            fontSize: "var(--fs-body-sm)",
          }}
        >
          {progress !== undefined && progress.length > 0
            ? progress
            : subAgent === "mailroom"
              ? "Fetching and ranking recent messages."
              : "Working."}
        </p>
      </article>
    );
  }

  // Discriminate by sub-agent result kind. Today the union has one
  // variant (`mailroom`); when more land, add another `if` branch (the
  // type narrowing forces a TS error here when the union grows and
  // we've forgotten one).
  if (result.kind === "mailroom") {
    return (
      <MailroomCard
        invocationId={invocationId}
        messages={result.messages}
      />
    );
  }
  // Future variants land via an exhaustive `never` check; for now the
  // union has a single member so the path below is unreachable.
  return (
    <article style={cardShellStyle}>
      <header style={cardHeaderStyle}>
        <span style={subAgentLabelStyle}>{labelFor(subAgent)}</span>
      </header>
      <p style={{ margin: 0 }}>
        Result received (renderer not yet implemented).
      </p>
    </article>
  );
}

// ── Mailroom variant ─────────────────────────────────────────────────────

function MailroomCard({
  invocationId,
  messages,
}: {
  invocationId: string;
  messages: MailroomMessage[];
}): React.ReactElement {
  return (
    <article
      aria-label="Mailroom triage results"
      style={cardShellStyle}
    >
      <header style={cardHeaderStyle}>
        <span style={subAgentLabelStyle}>Mailroom</span>
        <span
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-mono-meta)",
            color: "var(--muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {messages.length} ranked
        </span>
      </header>

      {messages.length === 0 ? (
        <p
          style={{
            margin: 0,
            color: "var(--ink-soft)",
            fontSize: "var(--fs-body-sm)",
          }}
        >
          Nothing pressing right now.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-8)",
          }}
        >
          {messages.map((m) => (
            <MailroomRow
              key={m.id}
              message={m}
              invocationId={invocationId}
            />
          ))}
        </ul>
      )}
    </article>
  );
}

function MailroomRow({
  message,
  invocationId,
}: {
  message: MailroomMessage;
  invocationId: string;
}): React.ReactElement {
  return (
    <li
      style={{
        padding: "var(--sp-12) var(--sp-16)",
        borderRadius: "var(--r-md)",
        background: "var(--brand-white)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-6)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--sp-12)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "var(--fs-body)",
              color: "var(--ink)",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {message.subject}
          </div>
          <div
            style={{
              fontSize: "var(--fs-body-sm)",
              color: "var(--ink-soft)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {message.sender}
          </div>
        </div>
        <ImportanceDots level={message.importance} />
      </div>

      <p
        style={{
          margin: 0,
          fontSize: "var(--fs-body-sm)",
          color: "var(--muted)",
        }}
      >
        <span
          style={{
            fontFamily: "DM Mono, monospace",
            fontSize: "var(--fs-mono-meta)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--brand-orange)",
            marginRight: "var(--sp-8)",
          }}
        >
          {message.proposed_action}
        </span>
        {message.reason}
      </p>

      <div
        style={{
          display: "flex",
          gap: "var(--sp-8)",
          marginTop: "var(--sp-4)",
        }}
      >
        <form action={noopMailroomAction} style={{ display: "inline" }}>
          <input
            type="hidden"
            name="invocation_id"
            value={invocationId}
          />
          <input type="hidden" name="message_id" value={message.id} />
          <input type="hidden" name="decision" value="approve" />
          <button type="submit" style={primaryBtnStyle}>
            Approve
          </button>
        </form>
        <form action={noopMailroomAction} style={{ display: "inline" }}>
          <input
            type="hidden"
            name="invocation_id"
            value={invocationId}
          />
          <input type="hidden" name="message_id" value={message.id} />
          <input type="hidden" name="decision" value="dismiss" />
          <button type="submit" style={ghostBtnStyle}>
            Dismiss
          </button>
        </form>
      </div>
    </li>
  );
}

function ImportanceDots({
  level,
}: {
  level: 1 | 2 | 3 | 4 | 5;
}): React.ReactElement {
  // Warm-only ramp: gold for high (4-5), amber for mid (2-3), muted for 1.
  const filledColor =
    level >= 4
      ? "var(--brand-gold)"
      : level >= 2
        ? "var(--brand-amber)"
        : "var(--muted-soft)";
  return (
    <div
      aria-label={`Importance ${level} of 5`}
      title={`Importance ${level}/5`}
      style={{ display: "flex", gap: "var(--sp-4)", flexShrink: 0 }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "var(--r-pill)",
            background: i <= level ? filledColor : "var(--border)",
            display: "inline-block",
          }}
        />
      ))}
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────

const cardShellStyle: React.CSSProperties = {
  marginTop: "var(--sp-12)",
  padding: "var(--sp-16) var(--sp-20)",
  borderRadius: "var(--r-xl)",
  border: "1px solid var(--border)",
  background: "var(--surface-warm)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--sp-12)",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--sp-12)",
};

const subAgentLabelStyle: React.CSSProperties = {
  fontFamily: "DM Mono, monospace",
  fontSize: "var(--fs-mono-meta)",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--brand-orange)",
};

const primaryBtnStyle: React.CSSProperties = {
  background: "var(--brand-orange)",
  color: "var(--brand-white)",
  border: "none",
  borderRadius: "var(--r-md)",
  padding: "var(--sp-6) var(--sp-12)",
  fontSize: "var(--fs-body-sm)",
  cursor: "pointer",
};

const ghostBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--ink-soft)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--r-md)",
  padding: "var(--sp-6) var(--sp-12)",
  fontSize: "var(--fs-body-sm)",
  cursor: "pointer",
};

function labelFor(name: SubAgentName): string {
  switch (name) {
    case "mailroom":
      return "Mailroom";
    case "scheduler":
      return "Scheduler";
    case "scribe":
      return "Scribe";
    case "oracle":
      return "Oracle";
    case "treasurer":
      return "Treasurer";
    case "voice":
      return "Voice";
    case "companion":
      return "Companion";
  }
}
