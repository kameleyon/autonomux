/**
 * Feature flags console — Phase 1.0-C6.
 *
 * Self-hosted minimum store backed by `public.feature_flags`
 * (migration 0006). The evaluator package `@autonomux/flags` powers
 * the web app's runtime checks; this page is the operator-side UI.
 *
 * Per PRD §3.2: "GrowthBook console · percent rollouts · per-tenant
 * overrides". We ship the same surface without the GrowthBook
 * dependency (PRD §11 budget constraints). A future swap to
 * GrowthBook is a one-import-line change in `apps/web/lib/flags.ts`.
 *
 * Owner: [Lens + Forge]
 */
import "@autonomux/ui/Dialog.css";

import { logAuditEvent } from "@autonomux/db";

import { CreateFlagDialog } from "./CreateFlagDialog";
import { FlagRow } from "./FlagRow";
import { listFeatureFlags } from "../../../lib/feature-flags-queries";

export const dynamic = "force-dynamic";

// Jury F-Compass-03 fix 2026-05-29: audit-log every view of this surface.
function getAdminViewActor(): string | null {
  const v = process.env["AUTONOMUX_ADMIN_USER_ID"];
  return v !== undefined && v.length > 0 ? v : null;
}

// Column ids must match the `headers=` references in FlagRow cells so SRs
// announce the correct header per cell.
const COLUMNS: ReadonlyArray<{ id: string; label: string; width?: string }> = [
  { id: "key", label: "Key", width: "20%" },
  { id: "enabled", label: "Global", width: "8%" },
  { id: "rollout", label: "Rollout %", width: "14%" },
  { id: "allow", label: "Allowlist (tenant UUIDs)", width: "20%" },
  { id: "deny", label: "Denylist (tenant UUIDs)", width: "20%" },
  { id: "updated", label: "Updated", width: "10%" },
  { id: "actions", label: "Actions", width: "8%" },
];

export default async function FeatureFlagsPage(): Promise<React.ReactElement> {
  const [flags] = await Promise.all([
    listFeatureFlags(),
    // Jury F-Compass-03 fix: audit-log the admin view.
    logAuditEvent({
      tenantId: null,
      actorUserId: getAdminViewActor(),
      actorKind: "admin",
      action: "admin.feature_flags.viewed",
      resourceType: "admin_console",
      metadata: { surface: "feature_flags" },
    }),
  ]);

  return (
    <section aria-labelledby="flags-h1">
      <p
        style={{
          fontFamily: "DM Mono, monospace",
          fontSize: "var(--fs-mono-meta)",
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: "var(--brand-orange)",
          marginBottom: "var(--sp-12)",
        }}
      >
        PRD §3.2 &middot; Self-hosted (GrowthBook-drop-in)
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "var(--sp-16)",
          marginBottom: "var(--sp-16)",
          flexWrap: "wrap",
        }}
      >
        <h1
          id="flags-h1"
          style={{ fontSize: "var(--fs-display-s)", margin: 0 }}
        >
          Feature flags
        </h1>
        <CreateFlagDialog />
      </div>

      <p
        style={{
          fontSize: "var(--fs-body-lg)",
          color: "var(--ink-soft)",
          maxWidth: "720px",
          marginBottom: "var(--sp-24)",
        }}
      >
        Precedence per row: <strong>denylist</strong> (false) →{" "}
        <strong>allowlist</strong> (true) → <strong>rollout %</strong>{" "}
        (deterministic per-tenant bucket) → <strong>global toggle</strong> →{" "}
        default off. Mutations audit-log as{" "}
        <code>feature_flag.&#123;created,updated,deleted&#125;</code> and
        propagate within 60 seconds.
      </p>

      <div className="adm-table__scroll">
        <table className="adm-table">
          <caption className="sz-sr-only">
            Feature flags · sorted by key (ascending). Each row is editable
            inline.
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.id}
                  id={`th-${col.id}`}
                  scope="col"
                  style={{ width: col.width, textAlign: "left" }}
                  aria-sort={col.id === "key" ? "ascending" : "none"}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flags.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="adm-empty"
                  style={{ textAlign: "center" }}
                >
                  No flags yet. Click <strong>+ Create flag</strong> to add
                  one.
                </td>
              </tr>
            ) : (
              flags.map((flag) => (
                <FlagRow
                  key={flag.key}
                  flagKey={flag.key}
                  description={flag.description}
                  enabledGlobally={flag.enabled_globally}
                  rolloutPercentage={flag.rollout_percentage}
                  enabledForTenants={flag.enabled_for_tenants}
                  disabledForTenants={flag.disabled_for_tenants}
                  updatedAt={flag.updated_at}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
