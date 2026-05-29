import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { decrypt, decryptToString, encrypt } from "../envelope.js";
import { __setKmsClientForTest } from "../kms.js";
import { sodiumReady } from "../sodium.js";
import { ENVELOPE_VERSION, type EncryptedEnvelope } from "../types.js";
import { fromBase64, toBase64 } from "../utils.js";

import { makeFakeKmsClient, type FakeKmsStats } from "./_fakeKms.js";

const TENANT_A = "tenant_aaaa";
const TENANT_B = "tenant_bbbb";
const PURPOSE_OAUTH = "oauth_token";
const PURPOSE_EMAIL = "pii_email";

let stats: FakeKmsStats;

beforeAll(async () => {
  // KMS env is required by `getKmsClient()` if our setter is ever cleared.
  process.env["AWS_REGION"] = "us-east-1";
  process.env["AWS_KMS_KEY_ID"] = "alias/fake-cipher-test";
  await sodiumReady();
});

beforeEach(() => {
  const fake = makeFakeKmsClient();
  __setKmsClientForTest(fake.client);
  stats = fake.stats;
});

describe("envelope: round-trip", () => {
  it("encrypts and decrypts a UTF-8 string", async () => {
    const plaintext = "hello@example.com";
    const env = await encrypt(plaintext, TENANT_A, PURPOSE_EMAIL);

    expect(env.v).toBe(ENVELOPE_VERSION);
    expect(env.dek_ciphertext.length).toBeGreaterThan(0);
    expect(env.ct.length).toBeGreaterThan(0);

    const out = await decryptToString(env, TENANT_A, PURPOSE_EMAIL);
    expect(out).toBe(plaintext);
  });

  it("encrypts and decrypts raw bytes", async () => {
    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252]);
    const env = await encrypt(plaintext, TENANT_A, PURPOSE_OAUTH);
    const out = await decrypt(env, TENANT_A, PURPOSE_OAUTH);
    expect(Array.from(out)).toEqual(Array.from(plaintext));
  });

  it("preserves empty-string plaintext", async () => {
    const env = await encrypt("", TENANT_A, PURPOSE_EMAIL);
    const out = await decryptToString(env, TENANT_A, PURPOSE_EMAIL);
    expect(out).toBe("");
  });
});

describe("envelope: context binding", () => {
  it("rejects decrypt with wrong tenantId", async () => {
    const env = await encrypt("secret", TENANT_A, PURPOSE_EMAIL);
    await expect(decrypt(env, TENANT_B, PURPOSE_EMAIL)).rejects.toThrow();
  });

  it("rejects decrypt with wrong purpose", async () => {
    const env = await encrypt("secret", TENANT_A, PURPOSE_EMAIL);
    await expect(decrypt(env, TENANT_A, PURPOSE_OAUTH)).rejects.toThrow();
  });

  it("rejects decrypt with both wrong", async () => {
    const env = await encrypt("secret", TENANT_A, PURPOSE_EMAIL);
    await expect(decrypt(env, TENANT_B, PURPOSE_OAUTH)).rejects.toThrow();
  });

  it("rejects empty tenantId", async () => {
    await expect(encrypt("x", "", PURPOSE_EMAIL)).rejects.toThrow();
  });

  it("rejects empty purpose", async () => {
    await expect(encrypt("x", TENANT_A, "")).rejects.toThrow();
  });
});

describe("envelope: tamper detection", () => {
  it("rejects tampered ciphertext", async () => {
    const env = await encrypt("secret", TENANT_A, PURPOSE_EMAIL);
    const ctBytes = fromBase64(env.ct);
    // Flip a bit in the middle.
    ctBytes[Math.floor(ctBytes.length / 2)] ^= 0x01;
    const tampered: EncryptedEnvelope = { ...env, ct: toBase64(ctBytes) };
    await expect(decrypt(tampered, TENANT_A, PURPOSE_EMAIL)).rejects.toThrow();
  });

  it("rejects tampered nonce", async () => {
    const env = await encrypt("secret", TENANT_A, PURPOSE_EMAIL);
    const nonceBytes = fromBase64(env.nonce);
    nonceBytes[0] ^= 0xff;
    const tampered: EncryptedEnvelope = { ...env, nonce: toBase64(nonceBytes) };
    await expect(decrypt(tampered, TENANT_A, PURPOSE_EMAIL)).rejects.toThrow();
  });

  it("rejects tampered aad", async () => {
    const env = await encrypt("secret", TENANT_A, PURPOSE_EMAIL);
    const fakeAad = toBase64(new Uint8Array([99, 99, 99, 99]));
    const tampered: EncryptedEnvelope = { ...env, aad: fakeAad };
    await expect(decrypt(tampered, TENANT_A, PURPOSE_EMAIL)).rejects.toThrow();
  });

  it("rejects tampered dek_ciphertext", async () => {
    const env = await encrypt("secret", TENANT_A, PURPOSE_EMAIL);
    const fakeDek = toBase64(new Uint8Array([1, 2, 3, 4]));
    const tampered: EncryptedEnvelope = { ...env, dek_ciphertext: fakeDek };
    await expect(decrypt(tampered, TENANT_A, PURPOSE_EMAIL)).rejects.toThrow();
  });

  it("rejects unknown envelope version", async () => {
    const env = await encrypt("secret", TENANT_A, PURPOSE_EMAIL);
    const future: EncryptedEnvelope = { ...env, v: 99 };
    await expect(decrypt(future, TENANT_A, PURPOSE_EMAIL)).rejects.toThrow(
      /version/i,
    );
  });

  it("rejects malformed envelope (missing field)", async () => {
    const bad = {
      v: 1,
      dek_ciphertext: "abc",
      // dek_aad missing
      ct: "abc",
      nonce: "abc",
      aad: "abc",
    } as unknown as EncryptedEnvelope;
    await expect(decrypt(bad, TENANT_A, PURPOSE_EMAIL)).rejects.toThrow();
  });
});

describe("envelope: key hygiene", () => {
  it("generates a unique DEK on every encrypt call", async () => {
    await encrypt("a", TENANT_A, PURPOSE_EMAIL);
    await encrypt("b", TENANT_A, PURPOSE_EMAIL);
    await encrypt("c", TENANT_A, PURPOSE_EMAIL);
    // Three calls → three distinct wrapped plaintexts captured by the fake.
    expect(stats.wrappedPlaintexts.length).toBe(3);
    const unique = new Set(stats.wrappedPlaintexts);
    expect(unique.size).toBe(3);
  });

  it("uses a fresh nonce per encrypt call (same plaintext, same context)", async () => {
    const a = await encrypt("same", TENANT_A, PURPOSE_EMAIL);
    const b = await encrypt("same", TENANT_A, PURPOSE_EMAIL);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ct).not.toBe(b.ct);
    expect(a.dek_ciphertext).not.toBe(b.dek_ciphertext);
  });

  it("does not leak the plaintext via the envelope fields", async () => {
    const plaintext = "MARKER_STRING_DO_NOT_LEAK_42";
    const env = await encrypt(plaintext, TENANT_A, PURPOSE_EMAIL);
    const serialized = JSON.stringify(env);
    expect(serialized).not.toContain(plaintext);
    // base64 of the marker must also not appear in plain form
    expect(serialized).not.toContain(
      Buffer.from(plaintext, "utf8").toString("base64"),
    );
  });

  it("calls KMS once per encrypt and once per decrypt", async () => {
    const env = await encrypt("x", TENANT_A, PURPOSE_EMAIL);
    expect(stats.encryptCount).toBe(1);
    expect(stats.decryptCount).toBe(0);
    await decrypt(env, TENANT_A, PURPOSE_EMAIL);
    expect(stats.encryptCount).toBe(1);
    expect(stats.decryptCount).toBe(1);
  });

  it("aborts before any KMS call if the local AAD check fails", async () => {
    const env = await encrypt("x", TENANT_A, PURPOSE_EMAIL);
    expect(stats.decryptCount).toBe(0);
    await expect(decrypt(env, TENANT_B, PURPOSE_EMAIL)).rejects.toThrow();
    // Local AAD mismatch → no KMS Decrypt call burned.
    expect(stats.decryptCount).toBe(0);
  });
});

describe("envelope: cross-tenant isolation under simulated DB leak", () => {
  it("DEK wrapped for tenant A cannot be reused for tenant B", async () => {
    const envA = await encrypt("alice secret", TENANT_A, PURPOSE_EMAIL);
    const envB = await encrypt("bob secret", TENANT_B, PURPOSE_EMAIL);

    // Splice: an attacker who controls storage replaces tenant B's wrapped DEK
    // with tenant A's. KMS must refuse to unwrap it on B's behalf.
    const spliced: EncryptedEnvelope = {
      ...envB,
      dek_ciphertext: envA.dek_ciphertext,
    };
    await expect(decrypt(spliced, TENANT_B, PURPOSE_EMAIL)).rejects.toThrow();
  });
});
