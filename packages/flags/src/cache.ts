/**
 * packages/flags/src/cache.ts
 *
 * In-process TTL cache for `feature_flags` rows.
 *
 * Why in-process: middleware + every Server Component for every request
 * would otherwise hit the DB once per flag check. With this cache the DB
 * sees one batched read every `FLAG_CACHE_TTL_MS` (default 60s) per
 * runtime instance. Cluster-wide invalidation lands when we move to
 * Upstash (Phase 1.1+); for now mutations call `invalidate()` locally
 * and propagate to peer instances on the next TTL expiry — acceptable
 * for an admin-cpanel-driven write path where ops know rollouts take up
 * to 60s to fully propagate.
 *
 * Owner: [Lens + Forge]
 */

import type { FeatureFlag } from "./types.js";

interface CacheEntry {
  /** Snapshot keyed by flag key. */
  flags: ReadonlyMap<string, FeatureFlag>;
  /** Monotonic timestamp when the entry was inserted. */
  insertedAt: number;
}

function readTtlMs(): number {
  const raw = process.env.FLAG_CACHE_TTL_MS;
  if (raw === undefined || raw === "") return 60_000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 60_000;
  // Clamp to 1h to avoid forever-cache footguns.
  return Math.min(parsed, 3_600_000);
}

/**
 * Singleton snapshot. The whole flag table is small (target < 200 rows
 * forever) so we always cache it whole, not per-key. This makes
 * `evaluateAllFlags()` a memory read.
 */
const TTL_MS = readTtlMs();

let snapshot: CacheEntry | null = null;
const subscribers = new Set<() => void>();

export interface FlagCache {
  /** Returns the snapshot if still fresh, otherwise null. */
  read(): ReadonlyMap<string, FeatureFlag> | null;
  /** Insert a fresh snapshot. Clears stale state. */
  write(flags: Iterable<FeatureFlag>): ReadonlyMap<string, FeatureFlag>;
  /** Force-evict; called from server actions after a mutation. */
  invalidate(_key?: string): void;
  /**
   * Subscribe to invalidations. Used by the GrowthBook adapter (Phase 1.5+)
   * to bridge into its own SDK; no-op for current users.
   */
  subscribe(listener: () => void): () => void;
  /** Inspect the configured TTL (test + debug). */
  ttlMs(): number;
}

export const flagCache: FlagCache = {
  read(): ReadonlyMap<string, FeatureFlag> | null {
    if (snapshot === null) return null;
    if (Date.now() - snapshot.insertedAt > TTL_MS) {
      snapshot = null;
      return null;
    }
    return snapshot.flags;
  },

  write(flags: Iterable<FeatureFlag>): ReadonlyMap<string, FeatureFlag> {
    const map = new Map<string, FeatureFlag>();
    for (const flag of flags) {
      map.set(flag.key, flag);
    }
    snapshot = { flags: map, insertedAt: Date.now() };
    return map;
  },

  invalidate(_key?: string): void {
    // We cache the whole table, so any mutation evicts everything.
    // The unused `_key` parameter stays in the signature so the
    // GrowthBook adapter (which caches per-key) is a drop-in.
    snapshot = null;
    for (const listener of subscribers) {
      try {
        listener();
      } catch {
        // Subscriber errors must not break the write path.
      }
    }
  },

  subscribe(listener: () => void): () => void {
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  },

  ttlMs(): number {
    return TTL_MS;
  },
};
