/**
 * apps/web/app/app/settings/data/page.tsx
 *
 * Settings → Data — GDPR self-service surface.
 *
 *   - Article 20: "Export my data" → enqueues an export job. The Settings →
 *     Data history table shows status + download URL when ready.
 *
 *   - Article 17: "Delete my account" → DESTRUCTIVE. Two gates BOTH required:
 *       1. Fresh TOTP step-up (purpose=step_up_account_delete) via the
 *          inline TOTP form on this page. 5-min window.
 *       2. Typed confirmation: the user types "delete my account" exactly.
 *
 *   - Past requests table: requested_at, kind, status, download_url (when
 *     ready), expires_at, failure_reason.
 *
 * No JS required for the export path (plain form POST). The deletion form
 * is also progressively-enhanced — TOTP step-up is a separate form submit
 * before the destructive form unlocks.
 *
 * Owner: [Comply + Forge]
 */

import { cookies } from "next/headers";

import { verifyStepUpToken } from "@autonomux/auth";

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { getStepUpSecret } from "@/lib/twofa/config";
import { STEP_UP_COOKIE } from "@/lib/twofa/cookie";

import {
  listMyGdprRequests,
  submitRequestDeletion,
  submitRequestExport,
  type GdprRequestPublic,
} from "./actions";
import { submitStepUpForDeletion } from "./step-up-action";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Data",
};

interface SearchParams {
  readonly ok?: string;
  readonly err?: string;
  readonly msg?: string;
  readonly id?: string;
  readonly step_up?: string;
}

export default async function DataPage(props: {
  searchParams: Promise<SearchParams>;
}): Promise<React.ReactElement> {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const user = await requireAuth(supabase);

  const cookieStore = await cookies();
  const stepUp = verifyStepUpToken(cookieStore.get(STEP_UP_COOKIE)?.value, {
    userId: user.id,
    purpose: "step_up_account_delete",
    secret: getStepUpSecret(),
  });
  const stepUpFresh = stepUp !== null;

  const history = await listMyGdprRequests();

  return (
    <div className="wrap">
      <h1>Data</h1>
      <p>
        Manage your personal data: export everything we hold on you (GDPR
        Article 20) or permanently delete your account and all associated data
        (GDPR Article 17).
      </p>

      {sp.ok !== undefined ? (
        <p role="status" aria-live="polite">
          Request received. It may take a few minutes to complete; refresh this
          page to see status updates.
        </p>
      ) : null}
      {sp.err !== undefined ? (
        <p role="alert">
          {decodeURIComponent(sp.msg ?? sp.err)} (code: {sp.err})
        </p>
      ) : null}
      {sp.step_up === "ok" ? (
        <p role="status" aria-live="polite">
          Step-up verified. You have 5 minutes to confirm the deletion below.
        </p>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Export — Article 20                                                */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-labelledby="export-h2"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="export-h2">Export my data</h2>
        <p>
          We will package every row from every tenant-scoped table belonging to
          your account into a single compressed JSON archive. The download link
          is signed and expires after 30 days.
        </p>
        <p>
          OAuth tokens, password hashes, and the audit log are <em>not</em>{" "}
          included — those are credentials/legal records, not your data under
          Article 20.
        </p>
        <form action={submitRequestExport}>
          <button type="submit">Export my data</button>
        </form>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Delete — Article 17                                                */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-labelledby="delete-h2"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="delete-h2">Delete my account</h2>
        <p>
          <strong>This is permanent.</strong> After a 30-day grace period your
          tenant data will be hard-deleted: every row in alterego_settings,
          agent_facts, agent_memory_episodes, agent_runs, connected_accounts,
          mailroom_rules, treasurer_bills, scribe_voice_samples, oracle_readings,
          companion_nudges, activity_log, billing_subscriptions, and
          usage_meters belonging to your tenant.
        </p>
        <p>
          You can cancel any time during the 30-day window by signing back in
          and visiting this page.
        </p>

        {!stepUpFresh ? (
          <DeleteStepUpForm />
        ) : (
          <DeleteConfirmForm />
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Past requests                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-labelledby="history-h2"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="history-h2">Request history</h2>
        {history.length === 0 ? (
          <p>No prior requests.</p>
        ) : (
          <RequestHistoryTable rows={history} />
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeleteStepUpForm — inline TOTP submit; on success we re-render with the
// destructive form unlocked.
// ---------------------------------------------------------------------------
function DeleteStepUpForm(): React.ReactElement {
  return (
    <form action={submitStepUpForDeletion} style={{ marginTop: "var(--sp-16)" }}>
      <p>
        Before you can delete your account, please verify with your
        authenticator app.
      </p>
      <div className="adm-field">
        <label htmlFor="step-up-totp" className="adm-label">
          Authenticator code
        </label>
        <input
          id="step-up-totp"
          className="adm-input"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={10}
          required
        />
        <span className="adm-hint">
          6 digits from your authenticator. The code is valid for 5 minutes.
        </span>
      </div>
      <button type="submit">Verify</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// DeleteConfirmForm — typed confirmation phrase.
// ---------------------------------------------------------------------------
function DeleteConfirmForm(): React.ReactElement {
  return (
    <form action={submitRequestDeletion} style={{ marginTop: "var(--sp-16)" }}>
      <div className="adm-field">
        <label htmlFor="delete-confirmation" className="adm-label">
          Type <code>delete my account</code> to confirm
        </label>
        <input
          id="delete-confirmation"
          className="adm-input"
          name="confirmation"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
        <span className="adm-hint">
          This phrase must match exactly. We will sign you out and start the
          30-day grace period.
        </span>
      </div>
      <button
        type="submit"
        style={{ backgroundColor: "var(--brand-red)", color: "var(--brand-white)" }}
      >
        Delete my account
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// RequestHistoryTable
// ---------------------------------------------------------------------------
function RequestHistoryTable(props: {
  rows: ReadonlyArray<GdprRequestPublic>;
}): React.ReactElement {
  return (
    <table>
      <caption className="sz-sr-only">Your past GDPR requests</caption>
      <thead>
        <tr>
          <th scope="col">Requested</th>
          <th scope="col">Kind</th>
          <th scope="col">Status</th>
          <th scope="col">Download</th>
          <th scope="col">Expires</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((r) => {
          /**
           * Jury F-Trace-03 fix 2026-05-29: until now, a user who soft-
           * deleted their account could ONLY cancel during the 30-day
           * grace period via the cancellation email link. The past-
           * requests table now exposes a Cancel button on any pending
           * deletion row so users have an in-app affordance — required
           * by GDPR Art. 7(3) ("withdrawal as easy as consent").
           */
          const cancellable = r.kind === "deletion" && r.status === "pending";
          return (
            <tr key={r.id}>
              <td>{new Date(r.requested_at).toLocaleString()}</td>
              <td>{r.kind}</td>
              <td>
                {r.status}
                {r.failure_reason !== null && r.status === "failed" ? (
                  <>
                    {" "}
                    <small>({r.failure_reason})</small>
                  </>
                ) : null}
              </td>
              <td>
                {r.download_url !== null && r.kind === "export" ? (
                  <a href={r.download_url} rel="noopener">
                    Download
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {r.expires_at !== null ? (
                  new Date(r.expires_at).toLocaleString()
                ) : (
                  "—"
                )}
              </td>
              <td>
                {cancellable ? (
                  <form
                    action="/api/gdpr/cancel-deletion"
                    method="post"
                    style={{ margin: 0 }}
                  >
                    <input type="hidden" name="request_id" value={r.id} />
                    <button
                      type="submit"
                      aria-label={`Cancel deletion request from ${new Date(r.requested_at).toLocaleDateString()}`}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
