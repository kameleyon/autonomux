/**
 * In-memory fake KMS client for tests.
 *
 * Simulates the parts of AWS KMS we depend on:
 *   - Encrypt: returns a CiphertextBlob that opaquely wraps the plaintext +
 *     EncryptionContext.
 *   - Decrypt: verifies EncryptionContext byte-for-byte; throws on mismatch
 *     (mimics KMS's `InvalidCiphertextException`).
 *
 * The wrap format is intentionally simple: we serialize `{ pt: base64, ctx: {} }`
 * to JSON. This lets a test assert that the wrapped blob is NOT just the
 * plaintext, and that the AAD round-trips, without standing up actual crypto
 * for the fake.
 *
 * SECURITY: this fake provides ZERO real protection. Production must use the
 * real `@aws-sdk/client-kms`.
 */

import type { KMSClient } from "@aws-sdk/client-kms";

interface FakeBlob {
  pt: string; // base64 plaintext DEK
  ctx: Record<string, string>; // EncryptionContext at wrap time
}

function ctxEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const ak = Object.keys(a ?? {}).sort();
  const bk = Object.keys(b ?? {}).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    const key = ak[i] as string;
    if ((a as Record<string, string>)[key] !== (b as Record<string, string>)[key]) {
      return false;
    }
  }
  return true;
}

export interface FakeKmsStats {
  encryptCount: number;
  decryptCount: number;
  /** Every plaintext DEK ever wrapped (base64). Used to assert no-reuse. */
  wrappedPlaintexts: string[];
}

export function makeFakeKmsClient(): {
  client: KMSClient;
  stats: FakeKmsStats;
} {
  const stats: FakeKmsStats = {
    encryptCount: 0,
    decryptCount: 0,
    wrappedPlaintexts: [],
  };

  const send = async (command: unknown): Promise<unknown> => {
    const name = (command as { constructor: { name: string } }).constructor.name;
    const input = (command as { input: Record<string, unknown> }).input;

    if (name === "EncryptCommand") {
      stats.encryptCount++;
      const pt = input["Plaintext"] as Uint8Array;
      const ctx =
        (input["EncryptionContext"] as Record<string, string>) ?? {};
      const blob: FakeBlob = {
        pt: Buffer.from(pt).toString("base64"),
        ctx,
      };
      stats.wrappedPlaintexts.push(blob.pt);
      const blobBytes = new Uint8Array(Buffer.from(JSON.stringify(blob)));
      return { CiphertextBlob: blobBytes, KeyId: "fake-key" };
    }

    if (name === "DecryptCommand") {
      stats.decryptCount++;
      const blobBytes = input["CiphertextBlob"] as Uint8Array;
      const blobJson = Buffer.from(blobBytes).toString("utf8");
      let blob: FakeBlob;
      try {
        blob = JSON.parse(blobJson) as FakeBlob;
      } catch {
        throw new Error("InvalidCiphertextException");
      }
      const supplied =
        (input["EncryptionContext"] as Record<string, string>) ?? {};
      if (!ctxEqual(blob.ctx, supplied)) {
        throw new Error("InvalidCiphertextException");
      }
      const pt = new Uint8Array(Buffer.from(blob.pt, "base64"));
      return { Plaintext: pt, KeyId: "fake-key" };
    }

    throw new Error(`[fakeKms] Unsupported command: ${name}`);
  };

  // Cast: we only implement `.send`, which is the only method our code uses.
  const client = { send } as unknown as KMSClient;
  return { client, stats };
}
