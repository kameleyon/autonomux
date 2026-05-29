/**
 * apps/web/app/api/rate-limited-example/route.ts
 *
 * Reference pattern for applying the `api` rate-limit bucket on a JSON
 * route. 100 req/min per session — when exceeded, return 429 with
 * Retry-After so a well-behaved client can back off.
 *
 * Owner: [Forge + Shield]
 */

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Key by session if available, else by IP — anonymous traffic is still
  // bucketed so noisy public callers can't drown the route.
  const key = user !== null ? `u:${user.id}` : `ip:${extractClientIp(request.headers)}`;

  const rl = await checkRateLimit("api", key);
  if (!rl.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "RATE_LIMITED",
        message: "Too many requests — slow down.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.reset),
        },
      },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message: "request within budget",
      user_id: user?.id ?? null,
    },
    {
      headers: {
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.reset),
      },
    },
  );
}
