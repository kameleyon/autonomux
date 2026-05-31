/**
 * apps/worker/src/lib/phi-redactor.ts
 *
 * HIPAA-leaning PHI redactor per PRD §10.3.
 *
 * Purpose: before any text leaves the worker process and is shipped to the
 * LLM (Haiku for Mailroom triage today, others later), sweep it for the
 * canonical PHI patterns and replace each match with a stable token. The
 * caller writes an `activity_log` row per incident with `action_kind =
 * 'phi.redacted'` so the audit chain shows the redaction happened.
 *
 * Scope of v1.0 patterns (intentional small, high-precision set —
 * PRD §10.3):
 *   - SSN                  XXX-XX-XXXX (with optional surrounding whitespace).
 *   - MRN-like             3+ contiguous digits adjacent (within ~16 chars,
 *                          either direction) to MRN / patient / chart context
 *                          words.
 *   - Credit card numbers  13-19 digits, optionally separated by spaces or
 *                          hyphens, Luhn-validated to cut false positives on
 *                          ID-like numerics.
 *
 * What we deliberately DO NOT do here:
 *   - PII names (false-positive-rich; covered separately by the Cipher
 *     namespace + RLS).
 *   - Phone numbers / addresses (Mailroom triage frequently needs sender
 *     context).
 *   - Free-form date-of-birth detection (too lossy at v1.0; gated to
 *     future work in PRD §10.3.b).
 *
 * Contract:
 *   - Pure function. No DB writes, no fetch, no logging.
 *   - Replaces every match with the single literal `[REDACTED:PHI]`.
 *   - Returns `{ redacted, incidents }`. Caller writes the activity_log
 *     row when `incidents > 0`.
 *
 * Owner: [Comply + Forge]
 */

/** Stable replacement marker — surfaced verbatim to the LLM. */
export const PHI_REDACTION_MARKER = "[REDACTED:PHI]" as const;

export interface RedactResult {
  readonly redacted: string;
  readonly incidents: number;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

// SSN — strict XXX-XX-XXXX with hyphen separators. Avoids matching arbitrary
// 9-digit runs (which would otherwise hit invoice numbers).
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

// MRN-like — at least 3 contiguous digits within ~16 chars of any of the
// trigger words: MRN, patient, chart. The trigger word may appear on either
// side of the number.
//
// Examples that match:
//   "MRN: 12345"          — digits within 6 chars after the trigger
//   "patient ID 9876541"  — same direction, slightly further
//   "12345 (patient)"     — digits then trigger
// Examples that do NOT match:
//   "Order 12345 confirmed" — no trigger word nearby
//
// We use two single-direction patterns and merge incident counts so each
// distinct match site is counted once (no double-count for symmetric proximity).
const MRN_CONTEXT_AHEAD = /(?:\bMRN\b|\bpatient\b|\bchart\b)[^\d\n\r]{0,16}\d{3,}/gi;
const MRN_CONTEXT_BEHIND = /\d{3,}[^\d\n\r]{0,16}(?:\bMRN\b|\bpatient\b|\bchart\b)/gi;

// Credit card — sequences of 13-19 digits with optional `-` or space
// separators. Final Luhn check inside replaceWithLuhn to filter random
// long digit runs.
const CC_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/g;

// ---------------------------------------------------------------------------
// Luhn check (used to validate credit-card matches)
// ---------------------------------------------------------------------------

function luhnValid(raw: string): boolean {
  const digits: number[] = [];
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      digits.push(ch.charCodeAt(0) - 48);
    }
  }
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits[i] as number;
    if (alternate) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sweep `text` for known PHI patterns. Returns the redacted text and the
 * number of replacements performed.
 *
 * Caller responsibility (engine.ts): when `incidents > 0`, write one
 * `activity_log` row with `action_kind = 'phi.redacted'` and a metadata
 * blob that contains ONLY non-PII counts (never the original snippet).
 *
 * Performance: O(n) over the input; safe for typical email bodies (≤32kB).
 * For multi-MB payloads consider streaming, but Mailroom triage caps at
 * ~snippets + first 2kB of body per message.
 */
export function redactForLlm(text: string): RedactResult {
  if (typeof text !== "string" || text.length === 0) {
    return { redacted: text ?? "", incidents: 0 };
  }

  let incidents = 0;
  let working = text;

  // 1. SSN — straight string replace.
  working = working.replace(SSN_PATTERN, () => {
    incidents += 1;
    return PHI_REDACTION_MARKER;
  });

  // 2. MRN-like — context-aware. We redact ONLY the digit run inside the
  //    match so we don't also blot out the trigger word (which the engine
  //    may still want for routing decisions).
  const digitRunRe = /\d{3,}/g;
  working = working.replace(MRN_CONTEXT_AHEAD, (match) => {
    incidents += 1;
    return match.replace(digitRunRe, PHI_REDACTION_MARKER);
  });
  working = working.replace(MRN_CONTEXT_BEHIND, (match) => {
    incidents += 1;
    return match.replace(digitRunRe, PHI_REDACTION_MARKER);
  });

  // 3. Credit card — Luhn-validated. Skip the replacement if Luhn fails so
  //    we don't blank out invoice / tracking numbers that happen to be long.
  working = working.replace(CC_PATTERN, (match) => {
    if (!luhnValid(match)) return match;
    incidents += 1;
    return PHI_REDACTION_MARKER;
  });

  return { redacted: working, incidents };
}

/**
 * Convenience: sweep an arbitrary structured payload (object / array /
 * string) and return a structurally-identical copy with every string field
 * redacted in place. Used by the engine to scrub the LLM input batch.
 *
 * Counts every replacement across the whole tree. Non-string leaves are
 * left untouched (numbers, booleans, null).
 */
export function redactPayloadForLlm<T>(value: T): { value: T; incidents: number } {
  let incidents = 0;

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      const { redacted, incidents: inc } = redactForLlm(node);
      incidents += inc;
      return redacted;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node !== null && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };

  return { value: walk(value) as T, incidents };
}
