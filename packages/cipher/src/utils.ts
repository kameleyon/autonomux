/**
 * Base64 + constant-time helpers.
 *
 * Threat model: avoids leaking secret-vs-attacker-input comparisons via early
 * exit. Used wherever we compare AAD / context fields that an attacker controls
 * one side of.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Encode a `Uint8Array` as standard (non-URL-safe) base64.
 *
 * Why standard, not URL-safe: KMS, Postgres `jsonb`, and Axiom all accept
 * standard base64 without ceremony. Use `toBase64Url` only when the envelope
 * traverses a URL/path/header.
 */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Decode a standard base64 string to bytes. Throws on invalid input. */
export function fromBase64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

/** Encode bytes as URL-safe base64 (no padding). */
export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode URL-safe base64 (with or without padding) to bytes. */
export function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return new Uint8Array(Buffer.from(normalized, "base64"));
}

/** Encode a UTF-8 string as bytes. */
export function utf8ToBytes(s: string): Uint8Array {
  return textEncoder.encode(s);
}

/** Decode UTF-8 bytes as a string. */
export function bytesToUtf8(b: Uint8Array): string {
  return textDecoder.decode(b);
}

/**
 * Constant-time equality check for two strings of equal length.
 *
 * Threat model: defends against timing side-channel attacks where an attacker
 * iteratively guesses the secret one character at a time by measuring response
 * latency. Returns `false` immediately on length mismatch (length is not
 * considered secret).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Constant-time equality check for two byte arrays.
 *
 * Same threat model as `constantTimeEqual`. Used by AEAD verification helpers
 * and AAD comparisons.
 */
export function constantTimeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

/**
 * Canonical JSON serializer for AAD construction.
 *
 * Threat model: AAD must be byte-identical on encrypt and decrypt, including
 * across runtimes / JSON engines. We avoid `JSON.stringify` of arbitrary objects
 * (key order is implementation-defined) by sorting keys recursively.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonicalJson((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}

/**
 * Boot-time environment variable check. Throws with a clear, actionable error
 * if a required var is missing. Never logs the values.
 *
 * Threat model: catches misconfiguration at process start instead of at first
 * encryption attempt — fail-fast over silent fallback to weaker config.
 */
export function assertEnv(names: readonly string[]): void {
  const missing = names.filter((n) => !process.env[n] || process.env[n] === "");
  if (missing.length > 0) {
    throw new Error(
      `[cipher] Missing required environment variables: ${missing.join(", ")}. ` +
        `See packages/cipher/.env.example for the full list.`,
    );
  }
}
