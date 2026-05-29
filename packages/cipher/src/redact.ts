/**
 * PII redaction for logs.
 *
 * Threat model defended:
 *   - Accidental PII leak into Axiom / Sentry / stdout. The pino logger uses
 *     `pinoRedactPaths` as its `redact.paths` config. Engineers who forget to
 *     scrub a field manually still get redaction at the logger layer.
 *
 * Threat model NOT defended:
 *   - Free-text PII in `msg` strings (e.g. `log.info("user signed up: a@b.c")`).
 *     Engineers must use structured logging (`{ email }`) for redaction to fire.
 *   - PII in unrecognized field names. The list below is conservative; add new
 *     paths as new domains land. Better to false-positive (over-redact) than
 *     leak.
 *   - PII already in a Sentry event title or breadcrumb. Sentry has its own
 *     `beforeSend` hook that must call `redactPii` as well.
 */

/** Sentinel that replaces every redacted value. Chosen to be loud in dashboards. */
export const REDACTED = "[REDACTED]" as const;

/**
 * Case-insensitive field names that ALWAYS get redacted, regardless of depth.
 * Order doesn't matter; matching is exact on lowercased key name.
 */
export const PII_FIELD_NAMES: readonly string[] = Object.freeze([
  // identity
  "email",
  "email_address",
  "emailaddress",
  "phone",
  "phone_number",
  "phonenumber",
  "ssn",
  "social_security_number",
  "dob",
  "date_of_birth",
  "address",
  "street_address",
  "first_name",
  "firstname",
  "last_name",
  "lastname",
  "full_name",
  "fullname",
  "name",
  // financial
  "credit_card",
  "creditcard",
  "card_number",
  "cardnumber",
  "cvv",
  "cvc",
  "bank_account",
  "bankaccount",
  "account_number",
  "accountnumber",
  "routing_number",
  "routingnumber",
  "iban",
  "swift",
  // secrets
  "api_key",
  "apikey",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "authorization",
  "auth",
  "cookie",
  "session",
  "session_id",
  "sessionid",
  "private_key",
  "privatekey",
  // platform-specific
  "plaid_access_token",
  "plaidaccesstoken",
  "composio_token",
  "composiotoken",
  "stripe_secret",
  "stripesecret",
  // crypto envelope internals — never log even at debug
  "dek_ciphertext",
  "dek_aad",
  "ct",
  "nonce",
  "aad",
]);

const PII_FIELD_SET = new Set(PII_FIELD_NAMES.map((s) => s.toLowerCase()));

/** Detect well-formed Bearer / JWT-ish tokens embedded in strings. */
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-+/=]+/gi;
/** Detect JWT shape (three base64url segments). */
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
/** Detect AWS-shaped access key IDs. */
const AWS_KEY_RE = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g;
/** Detect generic credit-card-like 13–19 digit runs (Luhn not enforced — log layer should be loud). */
const CC_LIKE_RE = /\b(?:\d[ -]?){13,19}\b/g;
/** Detect US SSN-shaped strings. */
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

/**
 * Scrub PII-looking patterns inside a free-text string. Conservative — when in
 * doubt, redact. Idempotent.
 */
export function redactString(s: string): string {
  return s
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(JWT_RE, REDACTED)
    .replace(AWS_KEY_RE, REDACTED)
    .replace(SSN_RE, REDACTED)
    .replace(CC_LIKE_RE, REDACTED);
}

/**
 * Recursively redact PII from an arbitrary value. Returns a NEW object (does
 * not mutate the input). Safe to call on log payloads.
 *
 * Behavior:
 *   - Primitives: strings get string-pattern redaction; others pass through.
 *   - Arrays: each element recursively redacted.
 *   - Objects: each entry; if key matches PII_FIELD_SET, value → `[REDACTED]`.
 *   - Cycles: handled via a WeakSet — cyclic refs return `[Circular]`.
 *   - Class instances (Date, Error, etc.): preserved as-is (we don't deep-walk
 *     non-plain objects to avoid breaking pino's serializers).
 */
export function redactPii<T>(input: T): T {
  return redactInternal(input, new WeakSet()) as T;
}

function redactInternal(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;

  // Don't deep-walk Errors, Dates, Buffers, Maps, Sets, etc. — preserve them.
  if (
    value instanceof Date ||
    value instanceof Error ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    (typeof Buffer !== "undefined" && value instanceof Buffer) ||
    ArrayBuffer.isView(value)
  ) {
    return value;
  }

  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redactInternal(v, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (PII_FIELD_SET.has(k.toLowerCase())) {
      out[k] = REDACTED;
    } else {
      out[k] = redactInternal(v, seen);
    }
  }
  return out;
}

/**
 * Pino-compatible redact paths. Pass to `pino({ redact: { paths: pinoRedactPaths } })`.
 *
 * Path syntax: `<key>` matches at any depth via `*.<key>`. We generate both
 * the top-level path AND a deep wildcard for every PII field so logs with
 * nested objects (e.g. `{ user: { email } }`) are caught.
 */
export const pinoRedactPaths: readonly string[] = Object.freeze(
  PII_FIELD_NAMES.flatMap((name) => [name, `*.${name}`, `*.*.${name}`]),
);

/**
 * Pino redact config block. Drop into pino options:
 *
 *   pino({ redact: pinoRedactConfig })
 */
export const pinoRedactConfig = Object.freeze({
  paths: pinoRedactPaths as string[],
  censor: REDACTED,
  remove: false,
});
