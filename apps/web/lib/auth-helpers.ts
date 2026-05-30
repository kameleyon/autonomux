/**
 * apps/web/lib/auth-helpers.ts
 *
 * Server-side guards for Server Actions, Route Handlers, RSCs.
 *
 *   requireAuth(supabase)        — returns the authenticated user or throws
 *   requireTenantId(supabase)    — returns the user's tenant_id or throws
 *   requireRole(supabase, role)  — admin-only routes
 *
 * These are NOT React hooks — they're called from server code that has a
 * tenant-scoped Supabase client (see ./supabase/server.ts).
 *
 * Owner: [Forge + Shield]
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@autonomux/db/types";
import { tryExtractJwtClaims } from "@autonomux/db/jwt";

export class AuthRequiredError extends Error {
  readonly code = "AUTH_REQUIRED" as const;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class TenantMissingError extends Error {
  readonly code = "TENANT_MISSING" as const;
  constructor(message = "Tenant claim missing from session") {
    super(message);
    this.name = "TenantMissingError";
  }
}

export class EmailUnverifiedError extends Error {
  readonly code = "EMAIL_UNVERIFIED" as const;
  constructor(message = "Email verification required") {
    super(message);
    this.name = "EmailUnverifiedError";
  }
}

export class RoleForbiddenError extends Error {
  readonly code = "ROLE_FORBIDDEN" as const;
  constructor(
    public readonly required: string,
    public readonly actual: string,
  ) {
    super(`Role '${required}' required (have '${actual}')`);
    this.name = "RoleForbiddenError";
  }
}

/**
 * Resolve the current user via getUser() — this round-trips to Supabase Auth
 * and validates the JWT server-side, which is the only safe way to trust a
 * session in Server Code (per Supabase SSR security note).
 */
export async function requireAuth(
  supabase: SupabaseClient<Database>,
): Promise<User> {
  const { data, error } = await supabase.auth.getUser();
  if (error !== null) {
    throw new AuthRequiredError(error.message);
  }
  const user = data.user;
  if (user === null) {
    throw new AuthRequiredError();
  }
  if (user.email_confirmed_at === null || user.email_confirmed_at === undefined) {
    // Email verification is mandatory before app access (PRD §7.1).
    throw new EmailUnverifiedError();
  }
  return user;
}

/**
 * Pull tenant_id off the live session.
 *
 * Resolution order:
 *   1. JWT claim (`tenant_id` top-level, or in `app_metadata`). This is
 *      the hot path — set by `public.custom_access_token_hook` and
 *      available on every request without a DB roundtrip.
 *   2. Fallback: SELECT from `tenant_members` for this user. Used when
 *      the JWT was issued BEFORE the access-token hook was wired (the
 *      old session is still valid; we just don't have the claim yet).
 *      Self-heals: the next auto-refresh of the token will re-run the
 *      hook and pick up the claim, eliminating the fallback for that
 *      user from then on.
 *
 * Throws only if the user has no `tenant_members` row at all (signup
 * truly failed — operator must reconcile).
 */
export async function requireTenantId(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  // Ensure session is real (server-validated).
  const user = await requireAuth(supabase);

  const { data, error } = await supabase.auth.getSession();
  if (error !== null) {
    throw new AuthRequiredError(error.message);
  }
  const accessToken = data.session?.access_token;
  if (accessToken !== undefined && accessToken.length > 0) {
    const claims = tryExtractJwtClaims(accessToken);
    if (claims !== null) return claims.tenant_id;
  }

  // Fallback — claim not in JWT (likely stale session from before the
  // access-token hook went live). Look it up via tenant_members.
  const { data: membership, error: lookupError } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError !== null || membership === null) {
    throw new TenantMissingError();
  }
  return membership.tenant_id;
}

/**
 * Membership-role gate. Reads `tenant_members.role` for the current user
 * against the tenant pinned in their JWT. Throws RoleForbiddenError on miss.
 */
export async function requireRole(
  supabase: SupabaseClient<Database>,
  required: "owner" | "member" | "viewer",
): Promise<{ userId: string; tenantId: string; role: "owner" | "member" | "viewer" }> {
  const user = await requireAuth(supabase);
  const tenantId = await requireTenantId(supabase);

  const { data, error } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error !== null) {
    throw new RoleForbiddenError(required, "unknown");
  }
  const role = data?.role;
  if (role === undefined || role === null) {
    throw new RoleForbiddenError(required, "none");
  }

  // Owner > member > viewer; require equals-or-greater.
  const rank: Record<typeof required, number> = {
    viewer: 0,
    member: 1,
    owner: 2,
  };
  if (rank[role] < rank[required]) {
    throw new RoleForbiddenError(required, role);
  }
  return { userId: user.id, tenantId, role };
}
