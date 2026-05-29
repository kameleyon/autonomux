# Trace — Flow + logic + security audit · Sprint B · 2026-05-29

Scope: every auth/2FA/session/audit/observability path in Sprint B. Reading for invariants, not just presence.

## Findings

- **F-TRC-01 · Blocker · `packages/db/src/audit.ts:62-68`** — `logAuditEvent` **throws** on insert failure (`throw new Error(...)`). PRD §10 contract: "Audit log writer NEVER throws on user-path failure — retries via BullMQ." Every caller wraps the call in try/catch, but the API itself is unsafe-by-default and one un-wrapped caller will break a user action. There is **also** a correct implementation at `packages/logger/src/audit.ts` (`writeAuditEvent` — never throws, logs structured `audit.write_failed`). The auth flows import from `@autonomux/db`, not `@autonomux/logger`. Either (a) make `logAuditEvent` non-throwing and converge on one writer, or (b) replace every caller with `writeAuditEvent`. **Pick one writer.** Current double-implementation is the dictionary definition of a footgun.

- **F-TRC-02 · Critical · `apps/web/app/api/webauthn/auth/options/route.ts:34-44`** — Endpoint is **not rate-limited**. An attacker who has a valid session can spin up unlimited WebAuthn challenges. Pair with the verify endpoint's rate-limit budget or add a separate `webauthn:options` bucket. Same applies to `apps/web/app/api/webauthn/register/options/route.ts:30-40`.

- **F-TRC-03 · Critical · `apps/web/app/sign-in/totp/page.tsx:36-46`** — TOTP factor existence check uses the tenant-scoped Supabase client. `user_2fa_factors_self_select` RLS policy exists in `0005_2fa.sql:140-142` ✓ so this works. **However**, the page bypasses 2FA enforcement entirely: there is no marker on the session that says "2FA still required". A user who signs in with email+password and never visits `/sign-in/totp` can simply navigate to `/app` and the middleware lets them through (it only checks `email_confirmed_at`). The `step-up` cookie is the only signal — and it's only set AFTER successful TOTP verify. Add a middleware guard: if user has a TOTP factor AND no fresh step-up cookie, redirect to `/sign-in/totp`. Without this, TOTP is functionally optional.

- **F-TRC-04 · Critical · `apps/web/app/sign-in/action.ts:144-163`** — On successful password sign-in, action redirects to `next || /app`. It does NOT route to `/sign-in/totp` even though TOTP is mandatory per PRD §7.1. Same defect as F-TRC-03 — flow is broken end-to-end. The action should: detect "user has TOTP enrolled" → redirect `/sign-in/totp`; "user has no factor + email verified" → redirect `/app/onboarding/totp`.

- **F-TRC-05 · Major · `apps/web/middleware.ts:113-125`** — Middleware calls `getUser()` ✓ THEN `getSession()` immediately after. The Supabase SSR security note says you must not insert code between createServerClient and getUser — `getSession()` is called for token extraction. This is fine, but the comment "Pull the access token… after getUser, so any refresh has already landed" is misleading: `getSession` reads the cookie store independently and may return the pre-refresh token if cookies are not yet written to the response. Verify with the SSR maintainers, or extract the token directly from `response.cookies` after `getUser`.

- **F-TRC-06 · Major · `apps/web/lib/supabase/server.ts:64-77`** — Server client `setAll` writes cookies with `sameSite: "lax"` ✓ HttpOnly ✓ Secure-in-prod ✓. But the `try/catch` swallows the read-only-cookie throw silently. In Server Components the catch is correct, but in **Server Actions / Route Handlers** the cookie write must succeed; silent swallow there masks the bug. Differentiate by inspecting `cookieStore` (read-only stores don't have `set` in App Router 14+, they throw).

- **F-TRC-07 · Major · `apps/web/app/auth/callback/route.ts:29`** — Callback always redirects to `/app/onboarding/totp` on success. If the user already has a TOTP factor (e.g. re-verifying email after a change), they'll be routed to enrollment that bounces them right back. Look up factor first; route to `/sign-in/totp` if factor exists, else enrollment.

- **F-TRC-08 · Major · `apps/web/app/sign-in/totp/action.ts:71-74`** — `looksLikeBackupCode(s)` matches `^[A-Z2-9]{4}-?[A-Z2-9]{4}$` case-insensitive. Comment says "Our codes never contain digits 0/1" but the regex includes `2-9` not `0-9` ✓. However, the alphabet in `totp.ts:129` is `"ABCDEFGHJKLMNPQRSTVWXYZ23456789"` (no 0/O/1/I/U) — the regex `[A-Z2-9]` is broader than the actual code alphabet (includes O, I, U). False positives in `looksLikeBackupCode` will route a TOTP-looking string to the backup-code path; the verify will fail. Tighten the regex to `[ABCDEFGHJKLMNPQRSTVWXYZ23456789]{4}-?[…]{4}`.

- **F-TRC-09 · Major · `apps/web/app/api/webauthn/auth/verify/route.ts:131-148`** — `verifyAuthentication` passes `credential.publicKey` as a string; `packages/auth/webauthn.ts:235` converts via `base64UrlToBuffer`. ✓ Counter regression check is delegated to SimpleWebAuthn ✓ (clone detection). The route does not currently set a "2FA-passed" session signal — only the TOTP path does (`STEP_UP_COOKIE`). WebAuthn verify success returns `{ok:true}` but the next middleware request will still demand re-TOTP for sensitive ops because the step-up cookie is not minted here. Add an `issueStepUpToken` call mirroring `sign-in/totp/action.ts:218-228`.

- **F-TRC-10 · Major · `apps/web/app/app/settings/security/action.ts:96-105`** — `LAST_FACTOR` check counts active factors and refuses to drop below 1 ✓. However, the `active.some((r) => r.id === parsed.data.factor_id)` is the **only** ownership check — RLS would also stop it, but the `getSupabaseServiceClient()` bypasses RLS. The `eq("user_id", user.id)` on the update at line 111 saves it. Order-of-operations is correct; consider adding an explicit ownership assert before the count check for clarity.

- **F-TRC-11 · Major · `apps/web/app/sign-up/action.ts:124-132`** — Site URL check: returns generic `PROVISIONING_FAILED` if `NEXT_PUBLIC_SITE_URL` is unset. That's a config error not a provisioning error. Make it a separate failure code so ops can grep distinctly.

- **F-TRC-12 · Major · `apps/web/lib/rate-limit.ts:82-93`** — Dev no-op is correct per PRD ✓. Prod throws on missing `REDIS_URL` ✓. But the module-level `noopMode` flag is set once; if Redis is later available, no rebuild. Acceptable for prod (deploy-time env), surprising for tests that toggle env. Document.

- **F-TRC-13 · Major · `packages/auth/src/totp.ts:98-108`** — `verifyTotp` mutates `authenticator.options` (global) and restores in finally. **Not concurrency-safe** — two concurrent verifies with different `window` overrides will race. Pass the window via `authenticator.check(...)` per-call instead.

- **F-TRC-14 · Major · `packages/auth/src/rate-limit.ts:86-101`** — `recordAttempt` swallows DB errors with `console.error`. PRD requires structured logging via the Pino logger (`@autonomux/logger`). Inject a logger and emit `recordAttempt.failed`.

- **F-TRC-15 · Major · `apps/web/middleware.ts:135`** — `isAppRoute` matches `pathname.startsWith(${APP_PREFIX}/)` which covers `/app/onboarding/totp`. So unverified-email users hitting `/app/onboarding/totp` get bounced to `/sign-in?check_email=1` — but `auth/callback` route just redirected them there. The user becomes "verified" only after exchange completes; verify the callback sets `email_confirmed_at` before redirecting. (Should be fine via Supabase; document.)

- **F-TRC-16 · Major · `apps/web/lib/twofa/cookie.ts:151-164`** — `twoFaCookieAttrs` returns `sameSite: "strict"` ✓ for these short-lived purpose cookies. The `STEP_UP_COOKIE` reuses the same posture ✓.

- **F-TRC-17 · Minor · `apps/web/lib/supabase/service.ts:23`** — `import "server-only"` ✓ correctly gates the service client.

- **F-TRC-18 · Minor · `packages/auth/src/step-up.ts:67-93`** — Step-up token verify uses `timingSafeEqual` ✓, binds purpose into the HMAC ✓, TTL check ✓, user match ✓. Well-built.

- **F-TRC-19 · Minor · `apps/web/app/api/webauthn/register/verify/route.ts:80-94`** — `payload.response as any` cast bypasses the SimpleWebAuthn type. Schema only verifies `z.unknown()`. Tighten the zod to validate at least the shape `{ id, rawId, response, type }`.

- **F-TRC-20 · Minor · `packages/telemetry/src/llm.ts:69-86`** — LLM span attribute hygiene ✓ — only numeric metadata, never raw prompts. Good.

## Summary

The crypto primitives are solid (TOTP verify constant-time, backup-code timing-safe matching, step-up HMAC-bound). The service-role client is gated. RLS migration is well-shaped. **But two end-to-end flow defects make TOTP effectively optional in this build**: `signInAction` doesn't route to `/sign-in/totp` for enrolled users (F-TRC-04), and middleware doesn't enforce a "2FA pending" state (F-TRC-03). Combined with the dual audit writers (F-TRC-01 — one throws, one doesn't), these three are blockers for the push gate. WebAuthn options endpoints lack rate limiting. Several smaller logic bugs (looksLikeBackupCode alphabet, otplib option mutation, missing step-up on WebAuthn verify) need cleanup before relying on this surface.

Score: **62 / 100**
