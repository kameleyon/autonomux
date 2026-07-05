/**
 * scripts/check-supabase-auth-drift.mjs
 *
 * B5 config-drift guard. GETs the live Supabase auth config via the Management
 * API and asserts the hardened baseline is still in place, so the Phase-0 auth
 * hardening (12-char complex passwords, email confirmation, TOTP, leaked-
 * password protection) cannot silently revert with nothing to catch it.
 *
 * CI usage (.github/workflows/ci.yml → auth-config-drift job):
 *   SUPABASE_ACCESS_TOKEN=<mgmt PAT>  SUPABASE_PROJECT_REF=<ref>  node scripts/check-supabase-auth-drift.mjs
 *
 * If SUPABASE_ACCESS_TOKEN is not set (e.g. a fork PR without secrets), the
 * check SKIPS with exit 0 and a clear message — it never blocks unrelated work.
 * When the token IS set, any drift from the baseline fails the job (exit 1).
 */
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!token || token.length === 0) {
  console.log("auth-drift: SKIPPED — SUPABASE_ACCESS_TOKEN not configured (add it as a repo secret to enforce).");
  process.exit(0);
}
if (!ref || ref.length === 0) {
  console.error("auth-drift: FAIL — SUPABASE_ACCESS_TOKEN is set but SUPABASE_PROJECT_REF is missing.");
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`auth-drift: FAIL — Management API GET returned HTTP ${res.status}.`);
  process.exit(1);
}
const cfg = await res.json();

/** Each check: [label, ok(cfg) => boolean, expected]. */
const checks = [
  ["mailer_autoconfirm (email confirmation required)", () => cfg.mailer_autoconfirm === false, "false"],
  ["password_min_length >= 12", () => Number(cfg.password_min_length) >= 12, ">=12"],
  [
    "password complexity (lower + upper + digit)",
    () => {
      const s = String(cfg.password_required_characters || "");
      return /abcdefghijklmnopqrstuvwxyz/.test(s) && /ABCDEFGHIJKLMNOPQRSTUVWXYZ/.test(s) && /0123456789/.test(s);
    },
    "lower:upper:digit",
  ],
  ["password_hibp_enabled (leaked-password protection)", () => cfg.password_hibp_enabled === true, "true"],
  ["mfa_totp_enroll_enabled", () => cfg.mfa_totp_enroll_enabled === true, "true"],
  ["mfa_totp_verify_enabled", () => cfg.mfa_totp_verify_enabled === true, "true"],
];

let failed = 0;
for (const [label, ok] of checks) {
  const pass = ok();
  console.log(`${pass ? "OK  " : "DRIFT"}  ${label}`);
  if (!pass) failed++;
}

if (failed > 0) {
  console.error(`\nauth-drift: FAIL — ${failed} setting(s) drifted from the hardened baseline. Re-apply via the Management API.`);
  process.exit(1);
}
console.log("\nauth-drift: PASS — auth config matches the hardened baseline.");
