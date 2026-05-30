/**
 * apps/admin/lib/integration-health.ts
 *
 * Server-only helper for the Integrations health board (C5).
 *
 * Aggregates `connected_accounts` rows by `integration` kind, computing
 * health rates from oauth_status distribution + a median last_refresh
 * delta. The page maps the active-ratio to a warm-only health pill.
 *
 * Phase 1.0-C · C5
 */
import "server-only";

import {
  createServiceClient,
  type Database,
  type IntegrationKind,
  type OAuthStatus,
} from "@autonomux/db";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  healthLevelFromRatio,
  type AdminHealthLevel,
} from "../components/AdminHealthPill";

type Sb = SupabaseClient<Database>;

// Every integration the platform supports (matches CHECK constraint on
// connected_accounts.integration in 0001_init.sql).
export const ALL_INTEGRATIONS: ReadonlyArray<IntegrationKind> = [
  "gmail",
  "outlook",
  "google_calendar",
  "substack",
  "x",
  "linkedin",
  "youtube",
  "plaid",
  "astrology",
];

export interface IntegrationStatusBreakdown {
  pending: number;
  active: number;
  expired: number;
  revoked: number;
  error: number;
}

export interface IntegrationHealthRow {
  integration: IntegrationKind;
  total_accounts: number;
  status_breakdown: IntegrationStatusBreakdown;
  /** active / total (0..1). Returns 0 when total is 0. */
  active_ratio: number;
  /** Warm-only health level derived from active_ratio. */
  health: AdminHealthLevel;
  /** Median milliseconds since last_refresh_at, or null if no refresh ever. */
  median_refresh_delta_ms: number | null;
  /** ISO string of the most recent refresh across all accounts, if any. */
  latest_refresh_at: string | null;
}

export interface IntegrationsHealthSummary {
  total_accounts: number;
  rows: IntegrationHealthRow[];
}

function emptyBreakdown(): IntegrationStatusBreakdown {
  return { pending: 0, active: 0, expired: 0, revoked: 0, error: 0 };
}

function medianMs(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const lo = sorted[mid - 1] ?? 0;
    const hi = sorted[mid] ?? 0;
    return (lo + hi) / 2;
  }
  return sorted[mid] ?? null;
}

/**
 * Pull every connected_account row (small table — one row per
 * (tenant, integration), bounded by tenant count × 9 integrations).
 * For tens-of-thousands-of-tenants scale, this should be moved to a
 * SQL view / RPC that does the GROUP BY at the database — wired in
 * a follow-up slice when load demands it.
 */
export async function getIntegrationsHealth(
  sb: Sb = createServiceClient(),
): Promise<IntegrationsHealthSummary> {
  const { data, error } = await sb
    .from("connected_accounts")
    .select("integration, oauth_status, last_refresh_at");

  if (error) {
    throw new Error(`[integration-health] ${error.message}`);
  }

  const now = Date.now();

  // Initialize a slot per known integration so the dashboard renders
  // every integration even when zero accounts are connected.
  const slots = new Map<
    IntegrationKind,
    {
      total: number;
      breakdown: IntegrationStatusBreakdown;
      refreshDeltas: number[];
      latestRefreshMs: number | null;
    }
  >();
  for (const kind of ALL_INTEGRATIONS) {
    slots.set(kind, {
      total: 0,
      breakdown: emptyBreakdown(),
      refreshDeltas: [],
      latestRefreshMs: null,
    });
  }

  for (const row of data ?? []) {
    const slot = slots.get(row.integration);
    if (!slot) continue; // unknown enum value — skip defensively
    slot.total += 1;
    const status = row.oauth_status as OAuthStatus;
    slot.breakdown[status] += 1;
    if (row.last_refresh_at) {
      const t = Date.parse(row.last_refresh_at);
      if (Number.isFinite(t)) {
        slot.refreshDeltas.push(now - t);
        if (slot.latestRefreshMs === null || t > slot.latestRefreshMs) {
          slot.latestRefreshMs = t;
        }
      }
    }
  }

  const rows: IntegrationHealthRow[] = [];
  let totalAccounts = 0;

  for (const integration of ALL_INTEGRATIONS) {
    const slot = slots.get(integration);
    if (!slot) continue;
    totalAccounts += slot.total;
    const active_ratio =
      slot.total > 0 ? slot.breakdown.active / slot.total : 0;
    rows.push({
      integration,
      total_accounts: slot.total,
      status_breakdown: slot.breakdown,
      active_ratio,
      // Empty slots render as "healthy" with 0% — we override in the UI
      // to show a neutral "No accounts" instead of a green/healthy pill.
      health:
        slot.total === 0 ? "healthy" : healthLevelFromRatio(active_ratio),
      median_refresh_delta_ms: medianMs(slot.refreshDeltas),
      latest_refresh_at:
        slot.latestRefreshMs !== null
          ? new Date(slot.latestRefreshMs).toISOString()
          : null,
    });
  }

  return { total_accounts: totalAccounts, rows };
}

// ---------------------------------------------------------------------------
// Human-readable refresh delta — "12m ago" / "3d ago" / "—".
// ---------------------------------------------------------------------------
export function formatRefreshDelta(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

// ---------------------------------------------------------------------------
// INTEGRATION_DISPLAY — pretty-print labels.
// ---------------------------------------------------------------------------
export const INTEGRATION_DISPLAY: Record<IntegrationKind, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  google_calendar: "Google Calendar",
  substack: "Substack",
  x: "X / Twitter",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  plaid: "Plaid",
  astrology: "Astrology",
};
