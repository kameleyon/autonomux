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
 * Pull tenant_id off the live session. Throws if the user is not signed in,
 * or if the access token does not yet carry a tenant_id (signup happened
 * but tenants row failed — operator must reconcile).
 */
export async function requireTenantId(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  // Ensure session is real (server-validated).
  await requireAuth(supabase);

  const { data, error } = await supabase.auth.getSession();
  if (error !== null) {
    throw new AuthRequiredError(error.message);
  }
  const accessToken = data.session?.access_token;
  if (accessToken === undefined || accessToken.length === 0) {
    throw new AuthRequiredError();
  }
  const claims = tryExtractJwtClaims(accessToken);
  if (claims === null) {
    throw new TenantMissingError();
  }
  return claims.tenant_id;
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
