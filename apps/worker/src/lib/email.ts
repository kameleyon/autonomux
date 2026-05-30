/**
 * apps/worker/src/lib/email.ts
 *
 * Minimal transactional-email sender for GDPR notifications.
 *
 * Design: this is a single-purpose Resend client. Resend's HTTP API is small
 * enough that we avoid pulling the `resend` npm package — one fetch() against
 * https://api.resend.com/emails is enough. Avoiding the dep keeps the worker
 * supply chain tight (no transitive surface area).
 *
 * Failure posture: email is non-blocking. A failed send is logged to stderr
 * (Axiom pipeline routes to PagerDuty) but never aborts the GDPR job. The
 * audit_log row written by the SQL trigger is the legally-binding signal that
 * the request was processed; the email is courtesy.
 *
 * Env:
 *   - RESEND_API_KEY: optional. Without it, sends are stubbed (stderr only).
 *     This lets local dev + CI run without external creds.
 *   - GDPR_EMAIL_FROM: address to send from (defaults to noreply@autonomux.app).
 *   - GDPR_EMAIL_REPLY_TO: optional Reply-To (defaults to privacy@autonomux.app).
 *
 * Owner: [Comply + Atlas]
 */

export type GdprEmailKind = "export_ready" | "deletion_scheduled";

export interface GdprEmailExportPayload {
  readonly downloadUrl: string;
  readonly expiresAtIso: string;
}

export interface GdprEmailDeletionPayload {
  readonly requestId: string;
  readonly hardDeleteAtIso: string;
}

export type GdprEmailPayload =
  | { kind: "export_ready"; payload: GdprEmailExportPayload }
  | { kind: "deletion_scheduled"; payload: GdprEmailDeletionPayload };

export interface SendGdprEmailArgs {
  readonly to: string;
  readonly kind: GdprEmailKind;
  readonly payload: GdprEmailExportPayload | GdprEmailDeletionPayload;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Send a GDPR notification email. Returns true on success, false on any
 * failure (which is logged to stderr).
 *
 * NEVER throws — callers (GDPR job processors) consider email best-effort.
 */
export async function sendGdprEmail(args: SendGdprEmailArgs): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["GDPR_EMAIL_FROM"] ?? "noreply@autonomux.app";
  const replyTo =
    process.env["GDPR_EMAIL_REPLY_TO"] ?? "privacy@autonomux.app";

  const { subject, text, html } = renderEmail(args);

  if (apiKey === undefined || apiKey.length === 0) {
    emitEmailLog("stub", args, "RESEND_API_KEY not set — email stubbed");
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        reply_to: replyTo,
        subject,
        text,
        html,
        tags: [
          { name: "category", value: "gdpr" },
          { name: "kind", value: args.kind },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>");
      emitEmailLog("failed", args, `resend ${res.status}: ${body}`);
      return false;
    }
    emitEmailLog("sent", args, "ok");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitEmailLog("failed", args, msg);
    return false;
  }
}

function renderEmail(args: SendGdprEmailArgs): {
  subject: string;
  text: string;
  html: string;
} {
  switch (args.kind) {
    case "export_ready": {
      const p = args.payload as GdprEmailExportPayload;
      const subject = "Your Autonomux data export is ready";
      const text =
        `Your data export is ready.\n\n` +
        `Download (valid until ${p.expiresAtIso}):\n${p.downloadUrl}\n\n` +
        `The link expires in 30 days. After that, you can request a new export ` +
        `from Settings → Data.\n\n` +
        `If you did not request this export, contact privacy@autonomux.app immediately.\n`;
      const html =
        `<p>Your data export is ready.</p>` +
        `<p><a href="${escapeAttr(p.downloadUrl)}">Download your archive</a></p>` +
        `<p>Link valid until <strong>${escapeText(p.expiresAtIso)}</strong>. ` +
        `After that, request a new export from Settings → Data.</p>` +
        `<p>If you did not request this export, ` +
        `<a href="mailto:privacy@autonomux.app">contact us</a> immediately.</p>`;
      return { subject, text, html };
    }
    case "deletion_scheduled": {
      const p = args.payload as GdprEmailDeletionPayload;
      const subject = "Your Autonomux account is scheduled for deletion";
      const text =
        `Your account is marked for deletion.\n\n` +
        `All of your data will be permanently removed on ${p.hardDeleteAtIso}.\n\n` +
        `You can cancel this any time before that date by signing in and ` +
        `visiting Settings → Data, or by replying to this email.\n\n` +
        `Reference: ${p.requestId}\n`;
      const html =
        `<p>Your Autonomux account is marked for deletion.</p>` +
        `<p>All of your data will be <strong>permanently removed on ` +
        `${escapeText(p.hardDeleteAtIso)}</strong>.</p>` +
        `<p>You can cancel this any time before that date by signing in and ` +
        `visiting Settings → Data.</p>` +
        `<p>Reference: <code>${escapeText(p.requestId)}</code></p>`;
      return { subject, text, html };
    }
  }
}

function escapeText(s: string): string {
  return s.replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );
}

function escapeAttr(s: string): string {
  return s.replace(/["<>&]/g, (c) =>
    c === '"' ? "&quot;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );
}

function emitEmailLog(
  status: "sent" | "failed" | "stub",
  args: SendGdprEmailArgs,
  note: string,
): void {
  const line = {
    level: status === "failed" ? "error" : "info",
    msg: `gdpr.email.${status}`,
    to: args.to,
    kind: args.kind,
    note,
    timestamp: new Date().toISOString(),
  };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}
