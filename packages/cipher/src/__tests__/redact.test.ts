import { describe, expect, it } from "vitest";

import {
  pinoRedactConfig,
  pinoRedactPaths,
  REDACTED,
  redactPii,
  redactString,
} from "../redact.js";

describe("redactPii: field-name matching", () => {
  it("redacts known PII field at top level", () => {
    const out = redactPii({ email: "user@example.com", id: 1 });
    expect(out).toEqual({ email: REDACTED, id: 1 });
  });

  it("redacts case-insensitively", () => {
    const out = redactPii({ Email: "x@y.z", PHONE: "555-555-5555" });
    expect((out as Record<string, string>)["Email"]).toBe(REDACTED);
    expect((out as Record<string, string>)["PHONE"]).toBe(REDACTED);
  });

  it("redacts nested PII", () => {
    const out = redactPii({
      user: { email: "a@b.c", id: 1 },
      meta: { request_id: "r1" },
    }) as Record<string, Record<string, unknown>>;
    expect(out["user"]?.["email"]).toBe(REDACTED);
    expect(out["user"]?.["id"]).toBe(1);
    expect(out["meta"]?.["request_id"]).toBe("r1");
  });

  it("redacts inside arrays", () => {
    const out = redactPii([{ email: "a@b.c" }, { email: "d@e.f" }]) as Array<
      Record<string, unknown>
    >;
    expect(out[0]?.["email"]).toBe(REDACTED);
    expect(out[1]?.["email"]).toBe(REDACTED);
  });

  it("redacts tokens, passwords, api_keys, authorization", () => {
    const out = redactPii({
      api_key: "sk_live_xxx",
      password: "hunter2",
      access_token: "eyJ.foo.bar",
      authorization: "Bearer abc.def.ghi",
    });
    expect(out).toEqual({
      api_key: REDACTED,
      password: REDACTED,
      access_token: REDACTED,
      authorization: REDACTED,
    });
  });

  it("redacts envelope internals (DEK, ct, nonce, aad)", () => {
    const out = redactPii({
      v: 1,
      dek_ciphertext: "AAAA",
      dek_aad: "BBBB",
      ct: "CCCC",
      nonce: "DDDD",
      aad: "EEEE",
    });
    expect(out).toEqual({
      v: 1,
      dek_ciphertext: REDACTED,
      dek_aad: REDACTED,
      ct: REDACTED,
      nonce: REDACTED,
      aad: REDACTED,
    });
  });

  it("preserves non-PII fields untouched", () => {
    const input = { request_id: "r1", duration_ms: 42, ok: true };
    expect(redactPii(input)).toEqual(input);
  });

  it("handles null and undefined", () => {
    expect(redactPii(null)).toBeNull();
    expect(redactPii(undefined)).toBeUndefined();
  });

  it("does not mutate the input", () => {
    const input = { email: "a@b.c", nested: { phone: "1" } };
    redactPii(input);
    expect(input.email).toBe("a@b.c");
    expect(input.nested.phone).toBe("1");
  });

  it("handles circular references without crashing", () => {
    const obj: Record<string, unknown> = { email: "a@b.c" };
    obj["self"] = obj;
    const out = redactPii(obj) as Record<string, unknown>;
    expect(out["email"]).toBe(REDACTED);
    expect(out["self"]).toBe("[Circular]");
  });

  it("preserves Errors as-is", () => {
    const err = new Error("boom");
    const out = redactPii({ err }) as Record<string, unknown>;
    expect(out["err"]).toBe(err);
  });

  it("preserves Dates as-is", () => {
    const d = new Date(0);
    const out = redactPii({ at: d }) as Record<string, unknown>;
    expect(out["at"]).toBe(d);
  });
});

describe("redactString: pattern matching", () => {
  it("redacts Bearer tokens", () => {
    expect(redactString("Authorization: Bearer eyJabc.def.ghi")).toContain(
      "Bearer [REDACTED]",
    );
  });

  it("redacts JWTs", () => {
    expect(
      redactString("token=eyJhbGci.eyJzdWIi.signature_here"),
    ).toContain(REDACTED);
  });

  it("redacts AWS access key IDs", () => {
    expect(redactString("key AKIAIOSFODNN7EXAMPLE in logs")).toContain(REDACTED);
    expect(redactString("key ASIAIOSFODNN7EXAMPLE in logs")).toContain(REDACTED);
  });

  it("redacts SSN patterns", () => {
    expect(redactString("ssn 123-45-6789 found")).toContain(REDACTED);
  });

  it("redacts credit-card-like sequences", () => {
    expect(redactString("card 4111 1111 1111 1111 used")).toContain(REDACTED);
    expect(redactString("card 4111-1111-1111-1111 used")).toContain(REDACTED);
  });

  it("is idempotent", () => {
    const once = redactString("Bearer abc.def.ghi");
    expect(redactString(once)).toBe(once);
  });
});

describe("pinoRedactConfig", () => {
  it("exports paths covering core PII names", () => {
    expect(pinoRedactPaths).toContain("email");
    expect(pinoRedactPaths).toContain("password");
    expect(pinoRedactPaths).toContain("api_key");
    expect(pinoRedactPaths).toContain("authorization");
  });

  it("includes wildcard paths for nested objects", () => {
    expect(pinoRedactPaths.some((p) => p.startsWith("*."))).toBe(true);
  });

  it("uses [REDACTED] as the censor value", () => {
    expect(pinoRedactConfig.censor).toBe(REDACTED);
  });

  it("does not remove fields (preserves shape for debugging)", () => {
    expect(pinoRedactConfig.remove).toBe(false);
  });
});
