/**
 * apps/web/lib/rate-limit.ts
 *
 * Upstash Redis rate limiter with three buckets.
 *
 *   auth:    5 attempts per 15min per (IP + email)  — defends sign-in / TOTP brute force
 *   api:     100 req/min per session                — generic abuse cap
 *   signup:  3 attempts per hour per IP             — sign-up spam cap
 *
 * Why these numbers:
 *   - auth=5/15min lines up with OWASP ASVS V11.1.1 ("≤ 10 attempts / 15min")
 *     while leaving room for legitimate typos.
 *   - signup=3/hour is tight on purpose — a real user signs up once. Anything
 *     beyond 3 is scraping the form or someone forgot which email they used.
 *   - api=100/min is the per-session ceiling; a real dashboard polls /api at
 *     ~0.5 req/sec including websocket reconnects.
 *
 * Production hard-fails if REDIS_URL is missing. Dev (NODE_ENV!=='production')
 * degrades to no-op so the founder can `next dev` without spinning Upstash.
 *
 * Owner: [Shield + Forge]
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitBucket = "auth" | "api" | "signup";

export interface RateLimitResult {
  /** True when the request is within budget. */
  success: boolean;
  /** Total budget for the window. */
  limit: number;
  /** Remaining budget after this call. */
  remaining: number;
  /** Epoch ms when the window resets. */
  reset: number;
  /** Seconds caller should wait before retrying — for the Retry-After header. */
  retryAfterSeconds: number;
}

interface RatelimiterSet {
  auth: Ratelimit;
  api: Ratelimit;
  signup: Ratelimit;
}

function parseUpstashUrl(raw: string): { url: string; token: string } {
  // Accept either:
  //   - https://<region>-<name>.upstash.io  (REST URL, paired with REDIS_REST_TOKEN)
  //   - redis://default:<token>@<host>:<port>  (Upstash connection string)
  if (raw.startsWith("https://")) {
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (token === undefined || token.length === 0) {
      throw new Error(
        "[rate-limit] REDIS_URL is REST URL but UPSTASH_REDIS_REST_TOKEN is missing",
      );
    }
    return { url: raw, token };
  }
  if (raw.startsWith("redis://") || raw.startsWith("rediss://")) {
    // Decompose redis://default:<token>@<host>:<port>
    const parsed = new URL(raw);
    const password = parsed.password;
    if (password.length === 0) {
      throw new Error(
        "[rate-limit] REDIS_URL connection string is missing the password segment",
      );
    }
    // Upstash REST endpoint per host convention.
    const host = parsed.hostname;
    return { url: `https://${host}`, token: password };
  }
  throw new Error(
    `[rate-limit] REDIS_URL must start with https://, redis://, or rediss://`,
  );
}

let limiters: RatelimiterSet | null = null;
let noopMode = false;

function buildLimiters(): RatelimiterSet | null {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl === undefined || redisUrl.length === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[rate-limit] REDIS_URL is required in production. Set it in Doppler.",
      );
    }
    // Dev no-op path.
    noopMode = true;
    return null;
  }

  const { url, token } = parseUpstashUrl(redisUrl);
  const redis = new Redis({ url, token });

  return {
    auth: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      analytics: true,
      prefix: "rl:auth",
    }),
    api: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      analytics: true,
      prefix: "rl:api",
    }),
    signup: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "1 h"),
      analytics: true,
      prefix: "rl:signup",
    }),
  };
}

function getLimiters(): RatelimiterSet | null {
  if (limiters !== null) return limiters;
  if (noopMode) return null;
  limiters = buildLimiters();
  return limiters;
}

function noopResult(): RateLimitResult {
  return {
    success: true,
    limit: Number.POSITIVE_INFINITY,
    remaining: Number.POSITIVE_INFINITY,
    reset: 0,
    retryAfterSeconds: 0,
  };
}

/**
 * Check a key against a bucket. Returns success=false when the caller is
 * over budget; calling code should respond 429 with Retry-After.
 *
 * `key` should be a stable identifier appropriate to the bucket:
 *   - auth:   `${ip}:${email_lowercased}`
 *   - api:    `${session_id}`
 *   - signup: `${ip}`
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  key: string,
): Promise<RateLimitResult> {
  const set = getLimiters();
  if (set === null) {
    if (process.env.NODE_ENV !== "production") return noopResult();
    // Should be unreachable — buildLimiters throws in prod when REDIS_URL missing.
    throw new Error("[rate-limit] limiter not initialized in production");
  }

  const limiter = set[bucket];
  const { success, limit, remaining, reset } = await limiter.limit(key);
  const retryAfterSeconds = success
    ? 0
    : Math.max(1, Math.ceil((reset - Date.now()) / 1000));

  return { success, limit, remaining, reset, retryAfterSeconds };
}

/**
 * Pull an IP address out of standard proxy headers. We avoid trusting
 * unproxied `request.ip` because Vercel terminates TLS at the edge.
 */
export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff !== null && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp !== null && realIp.length > 0) return realIp;
  return "unknown";
}
