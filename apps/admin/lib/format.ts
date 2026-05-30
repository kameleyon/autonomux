/**
 * Display formatters for cpanel surfaces.
 *
 * Centralized so every counter / table cell renders the same way and the
 * preflight banned-word checks have a single chokepoint.
 *
 * Owner: [Forge]
 */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const intFormatter = new Intl.NumberFormat("en-US");

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatUsdFromCents(cents: number): string {
  return usdFormatter.format(cents / 100);
}

export function formatInt(value: number): string {
  return intFormatter.format(value);
}

export function formatDate(iso: string | null): string {
  if (iso === null) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter.format(d);
}

export function formatTimestamp(iso: string | null): string {
  if (iso === null) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return timestampFormatter.format(d);
}

export function truncateId(id: string | null, length = 8): string {
  if (id === null || id.length === 0) return "—";
  return id.length > length ? id.slice(0, length) : id;
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
