/**
 * apps/admin/app/(authed)/compliance/page.tsx
 *
 * Compliance â€” GDPR queue dashboard + admin-initiated request forms.
 *
 *   - Pending requests table (status in pending|processing)
 *   - Recently completed table (last 30d)
 *   - "Initiate export for tenant" form
 *   - "Initiate deletion for tenant" form (DESTRUCTIVE; requires
 *      AUTONOMUX_ADMIN_OP_TOKEN + typed-in confirmation; see actions.ts)
 *   - Recent gdpr.* audit timeline
 *   - Compliance documentation links (privacy policy, DPA, deletion policy,
 *     retention table)
 *
 * Auth note (Phase 1.0-A): admin sign-in is still a placeholder; this page
 * renders behind the (authed) layout but the layout itself does not yet
 * verify a session. The destructive admin actions are gated on
 * AUTONOMUX_ADMIN_OP_TOKEN as a temporary stand-in for admin TOTP step-up
 * (Phase 1.0-B). The action file flags this with a TODO.
 *
 * Owner: [Comply + Forge]
 */

import { logAuditEvent } from "@autonomux/db";

import {
  listCompletedGdprRequests,
  listPendingGdprRequests,
  listRecentGdprAuditEvents,
  type GdprAuditEvent,
  type GdprRequestAdminRow,
} from "@/lib/gdpr-queries";

import {
  submitInitiateDeletionForTenant,
  submitInitiateExportForTenant,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Jury F-Compass-02 fix 2026-05-29: every admin view that surfaces
 * tenant data â€” including audit timelines and compliance queues â€” is
 * itself an audit-relevant act. Fire `admin.compliance.viewed` so the
 * audit log captures who looked at this surface and when. Operator
 * identity comes from `AUTONOMUX_ADMIN_USER_ID` until real admin auth
 * lands in Phase 1.0-D.
 */
function getAdminViewActor(): string | null {
  const v = process.env["AUTONOMUX_ADMIN_USER_ID"];
  return v !== undefined && v.length > 0 ? v : null;
}

interface SearchParams {
  readonly ok?: string;
  readonly err?: string;
  readonly id?: string;
}

export default async function CompliancePage(props: {
  searchParams: Promise<SearchParams>;
}): Promise<React.ReactElement> {
  const sp = await props.searchParams;
  const [pending, completed, auditEvents] = await Promise.all([
    listPendingGdprRequests(),
    listCompletedGdprRequests({ days: 30 }),
    listRecentGdprAuditEvents({ limit: 50 }),
    // Jury F-Compass-02 fix: audit-log the admin view.
    logAuditEvent({
      tenantId: null,
      actorUserId: getAdminViewActor(),
      actorKind: "admin",
      action: "admin.compliance.viewed",
      resourceType: "admin_console",
      metadata: { surface: "compliance" },
    }),
  ]);

  return (
    <section aria-labelledby="compliance-h1">
      <h1
        id="compliance-h1"
        style={{
          fontSize: "var(--fs-display-s)",
          marginBottom: "var(--sp-16)",
        }}
      >
        Compliance
      </h1>
      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "640px",
        }}
      >
        GDPR Article 20 (export) + Article 17 (deletion) queue, admin-initiated
        request forms, and the rolling audit timeline.
      </p>

      {sp.ok !== undefined ? (
        <p role="status" aria-live="polite">
          Queued â€” request id: <code>{sp.id ?? "?"}</code>
        </p>
      ) : null}
      {sp.err !== undefined ? (
        <p role="alert">Error: {decodeURIComponent(sp.err)}</p>
      ) : null}

      {/* --------------------------------------------------------------- */}
      {/* Pending                                                          */}
      {/* --------------------------------------------------------------- */}
      <section
        aria-labelledby="pending-h2"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="pending-h2">Pending requests</h2>
        {pending.length === 0 ? (
          <p>No pending GDPR requests.</p>
        ) : (
          <RequestsTable rows={pending} showCompleted={false} />
        )}
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Completed                                                        */}
      {/* --------------------------------------------------------------- */}
      <section
        aria-labelledby="completed-h2"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="completed-h2">Completed (last 30 days)</h2>
        {completed.length === 0 ? (
          <p>No completed requests in the last 30 days.</p>
        ) : (
          <RequestsTable rows={completed} showCompleted={true} />
        )}
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Admin actions                                                    */}
      {/* --------------------------------------------------------------- */}
      <section
        aria-labelledby="admin-actions-h2"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="admin-actions-h2">Initiate on behalf of tenant</h2>
        <p>
          Both actions require the <code>AUTONOMUX_ADMIN_OP_TOKEN</code>{" "}
          environment value as a step-up gate. The deletion form additionally
          requires the typed phrase{" "}
          <code>delete tenant &lt;first-8-of-tenant-id&gt;</code>.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "var(--sp-24)",
            marginTop: "var(--sp-16)",
          }}
        >
          <form action={submitInitiateExportForTenant}>
            <fieldset>
              <legend>Initiate export</legend>
              <div className="adm-field">
                <label className="adm-label" htmlFor="export-tenant">
                  Tenant id
                </label>
                <input
                  id="export-tenant"
                  className="adm-input"
                  name="tenant_id"
                  type="text"
                  required
                />
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="export-user">
                  User id (auth.users.id)
                </label>
                <input
                  id="export-user"
                  className="adm-input"
                  name="user_id"
                  type="text"
                  required
                />
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="export-token">
                  Admin op token
                </label>
                <input
                  id="export-token"
                  className="adm-input"
                  name="admin_op_token"
                  type="password"
                  autoComplete="off"
                  required
                />
              </div>
              <button type="submit" className="adm-cta">
                Initiate export
              </button>
            </fieldset>
          </form>

          <form action={submitInitiateDeletionForTenant}>
            <fieldset>
              <legend>Initiate deletion (DESTRUCTIVE)</legend>
              <div className="adm-field">
                <label className="adm-label" htmlFor="delete-tenant">
                  Tenant id
                </label>
                <input
                  id="delete-tenant"
                  className="adm-input"
                  name="tenant_id"
                  type="text"
                  required
                />
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="delete-user">
                  User id (auth.users.id)
                </label>
                <input
                  id="delete-user"
                  className="adm-input"
                  name="user_id"
                  type="text"
                  required
                />
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="delete-token">
                  Admin op token
                </label>
                <input
                  id="delete-token"
                  className="adm-input"
                  name="admin_op_token"
                  type="password"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="adm-field">
                <label className="adm-label" htmlFor="delete-confirmation">
                  Type{" "}
                  <code>delete tenant &lt;first-8-of-tenant-id&gt;</code>
                </label>
                <input
                  id="delete-confirmation"
                  className="adm-input"
                  name="confirmation"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>
              <button
                type="submit"
                className="adm-cta"
                style={{ backgroundColor: "var(--brand-red)" }}
              >
                Initiate deletion
              </button>
            </fieldset>
          </form>
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Audit timeline                                                   */}
      {/* --------------------------------------------------------------- */}
      <section
        aria-labelledby="audit-h2"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="audit-h2">Recent gdpr.* audit events</h2>
        {auditEvents.length === 0 ? (
          <p>No recent GDPR audit events.</p>
        ) : (
          <AuditTable rows={auditEvents} />
        )}
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Docs                                                             */}
      {/* --------------------------------------------------------------- */}
      <section
        aria-labelledby="docs-h2"
        style={{ marginTop: "var(--sp-32)" }}
      >
        <h2 id="docs-h2">Documentation</h2>
        <ul>
          <li>
            <a href="https://autonomux.io/legal/privacy">Privacy policy</a>
          </li>
          <li>
            <a href="https://autonomux.io/legal/dpa">
              Data Processing Agreement
            </a>
          </li>
          <li>
            <a href="https://autonomux.io/legal/deletion-policy">
              Deletion policy (30-day grace period)
            </a>
          </li>
          <li>
            <a href="https://autonomux.io/legal/retention">
              Retention table (90d activity, 7yr audit, 30d export, 30d
              deletion grace)
            </a>
          </li>
        </ul>
      </section>
    </section>
  );
}

function RequestsTable(props: {
  rows: ReadonlyArray<GdprRequestAdminRow>;
  showCompleted: boolean;
}): React.ReactElement {
  return (
    <table>
      <caption className="sz-sr-only">
        {props.showCompleted
          ? "Completed GDPR requests, last 30 days"
          : "Pending GDPR requests"}
      </caption>
      <thead>
        <tr>
          <th scope="col">Requested</th>
          <th scope="col">Kind</th>
          <th scope="col">Status</th>
          <th scope="col">Tenant</th>
          <th scope="col">User</th>
          <th scope="col">Origin</th>
          {props.showCompleted ? <th scope="col">Completed</th> : null}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((r) => (
          <tr key={r.id}>
            <td>{new Date(r.requested_at).toLocaleString()}</td>
            <td>{r.kind}</td>
            <td>
              {r.status}
              {r.failure_reason !== null ? (
                <>
                  {" "}
                  <small>({r.failure_reason})</small>
                </>
              ) : null}
            </td>
            <td>
              <code>{r.tenant_id?.slice(0, 8) ?? "â€”"}</code>
            </td>
            <td>
              <code>{r.user_id.slice(0, 8)}</code>
            </td>
            <td>{r.admin_actor_user_id !== null ? "admin" : "user"}</td>
            {props.showCompleted ? (
              <td>
                {r.completed_at !== null
                  ? new Date(r.completed_at).toLocaleString()
                  : "â€”"}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AuditTable(props: {
  rows: ReadonlyArray<GdprAuditEvent>;
}): React.ReactElement {
  return (
    <table>
      <caption className="sz-sr-only">
        Recent GDPR audit events
      </caption>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">Action</th>
          <th scope="col">Actor</th>
          <th scope="col">Tenant</th>
          <th scope="col">Resource</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((e) => (
          <tr key={e.id}>
            <td>{new Date(e.created_at).toLocaleString()}</td>
            <td>
              <code>{e.action}</code>
            </td>
            <td>{e.actor_kind}</td>
            <td>
              <code>{e.tenant_id?.slice(0, 8) ?? "â€”"}</code>
            </td>
            <td>
              <code>{e.resource_id?.slice(0, 8) ?? "â€”"}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
