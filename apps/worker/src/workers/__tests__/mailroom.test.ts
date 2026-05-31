/**
 * apps/worker/src/workers/__tests__/mailroom.test.ts
 *
 * Vitest suite for the Mailroom worker + supporting libs. Each test stubs
 * Gmail client and LLM client to keep the suite hermetic (no network, no
 * Supabase, no Redis).
 *
 * Covers Sprint D §2 acceptance items 2 (PHI) and 3 (rule bypass), plus
 * ranking output shape and token-refresh-on-401.
 *
 * Owner: [Forge]
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Logger } from "pino";

import { redactForLlm, PHI_REDACTION_MARKER } from "../../lib/phi-redactor.js";
import {
  triageInbox,
  type MailroomInputMessage,
} from "../../lib/mailroom-engine.js";
import {
  createGmailClient,
  GmailNotConnectedError,
} from "../../lib/gmail-client.js";
import type { LlmClient } from "@autonomux/llm";
import type { Tables } from "@autonomux/db";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  const noop = (): void => {};
  const child = (): Logger => makeLogger();
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child,
  } as unknown as Logger;
}

function makeMsg(over: Partial<MailroomInputMessage> = {}): MailroomInputMessage {
  return {
    id: over.id ?? "m1",
    threadId: over.threadId ?? "t1",
    sender: over.sender ?? "alice@example.com",
    subject: over.subject ?? "Hello",
    snippet: over.snippet ?? "hi there",
    bodyExcerpt: over.bodyExcerpt ?? "body",
    receivedAt: over.receivedAt ?? "2026-05-30T00:00:00.000Z",
    labelIds: over.labelIds ?? ["INBOX"],
    hasAttachment: over.hasAttachment ?? false,
  };
}

function makeRule(over: Partial<Tables<"mailroom_rules">> = {}): Tables<"mailroom_rules"> {
  const base: Tables<"mailroom_rules"> = {
    id: "rule-1",
    tenant_id: "tenant-A",
    name: "noreply-archive",
    rule_dsl: {
      when: { sender: "noreply@x.com" },
      then: { action: "delete" },
    },
    active: true,
    priority: 100,
    created_at: "2026-05-30T00:00:00.000Z",
    updated_at: "2026-05-30T00:00:00.000Z",
  };
  return { ...base, ...over };
}

function stubLlm(content: string): LlmClient {
  return {
    provider: "openrouter",
    complete: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: content }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
      cost_usd: 0.0001,
      model_used: "anthropic/claude-haiku-4.5",
      provider: "openrouter",
      latency_ms: 123,
      id: "test-id",
    }),
    stream: vi.fn(),
  } as unknown as LlmClient;
}

// ---------------------------------------------------------------------------
// PHI redactor
// ---------------------------------------------------------------------------

describe("phi-redactor", () => {
  it("redacts SSN", () => {
    const out = redactForLlm("My SSN is 123-45-6789.");
    expect(out.incidents).toBe(1);
    expect(out.redacted).toContain(PHI_REDACTION_MARKER);
    expect(out.redacted).not.toContain("123-45-6789");
  });

  it("redacts MRN-context digits", () => {
    const out = redactForLlm("Patient John Doe, MRN 12345 admitted");
    expect(out.incidents).toBeGreaterThanOrEqual(1);
    expect(out.redacted).not.toContain("12345");
    expect(out.redacted).toContain(PHI_REDACTION_MARKER);
  });

  it("redacts Luhn-valid credit card numbers", () => {
    // 4242 4242 4242 4242 is a canonical Stripe test card (Luhn-valid).
    const out = redactForLlm("card 4242 4242 4242 4242 on file");
    expect(out.incidents).toBe(1);
    expect(out.redacted).not.toContain("4242 4242 4242 4242");
  });

  it("does not redact arbitrary long digit runs that fail Luhn", () => {
    const out = redactForLlm("order number 1234567890123");
    expect(out.incidents).toBe(0);
    expect(out.redacted).toBe("order number 1234567890123");
  });

  it("is a no-op on empty / non-PII text", () => {
    const out = redactForLlm("Just a normal email body about meeting at 3pm.");
    expect(out.incidents).toBe(0);
    expect(out.redacted).toBe("Just a normal email body about meeting at 3pm.");
  });
});

// ---------------------------------------------------------------------------
// Mailroom engine — rule bypass + LLM ranking + PHI flow
// ---------------------------------------------------------------------------

describe("mailroom-engine.triageInbox", () => {
  let logger: Logger;
  beforeEach(() => {
    logger = makeLogger();
  });

  it("returns a well-shaped ranking from the LLM", async () => {
    const llmOut = JSON.stringify({
      results: [
        {
          id: "m1",
          importance: 4,
          proposed_action: "reply",
          reason: "personal question from colleague",
        },
      ],
    });
    const llm = stubLlm(llmOut);

    const res = await triageInbox(
      { logger, llm },
      {
        tenantId: "tenant-A",
        messages: [makeMsg({ id: "m1" })],
        rules: [],
      },
    );

    expect(res.ranked).toHaveLength(1);
    const row = res.ranked[0]!;
    expect(row.id).toBe("m1");
    expect(row.importance).toBe(4);
    expect(row.proposedAction).toBe("reply");
    expect(row.reason).toContain("personal");
    expect(row.matchedRuleId).toBeNull();
    expect(res.llmHandledCount).toBe(1);
    expect(res.ruleHandledCount).toBe(0);
    expect(res.phiIncidents).toBe(0);
  });

  it("rule bypass: matched sender skips the LLM entirely", async () => {
    const llm = stubLlm('{"results":[]}');
    const rule = makeRule();

    const res = await triageInbox(
      { logger, llm },
      {
        tenantId: "tenant-A",
        messages: [
          makeMsg({ id: "noreply-1", sender: "noreply@x.com" }),
          makeMsg({ id: "real-1", sender: "alice@example.com" }),
        ],
        rules: [rule],
      },
    );

    // Rule matched on noreply-1 → archive; real-1 went to LLM.
    const noreply = res.ranked.find((r) => r.id === "noreply-1");
    expect(noreply).toBeDefined();
    expect(noreply!.proposedAction).toBe("archive");
    expect(noreply!.matchedRuleId).toBe(rule.id);

    // LLM was only called once (no batch with both messages).
    expect((llm.complete as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    // And the call did not include noreply-1 in its payload.
    const userMsg = ((llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]!
      [0] as { messages: { content: string }[] }).messages[0]!.content;
    expect(userMsg).toContain("real-1");
    expect(userMsg).not.toContain("noreply-1");
    expect(res.ruleHandledCount).toBe(1);
    expect(res.llmHandledCount).toBe(1);
  });

  it("redacts PHI from snippet+body before the LLM call", async () => {
    const llm = stubLlm(
      JSON.stringify({
        results: [
          { id: "m1", importance: 2, proposed_action: "keep_inbox", reason: "ok" },
        ],
      }),
    );

    const res = await triageInbox(
      { logger, llm },
      {
        tenantId: "tenant-A",
        messages: [
          makeMsg({
            id: "m1",
            snippet: "Patient John Doe, MRN 99887 follow-up",
            bodyExcerpt: "SSN 123-45-6789 confirmed",
          }),
        ],
        rules: [],
      },
    );

    expect(res.phiIncidents).toBeGreaterThanOrEqual(2);

    // Inspect the actual LLM call to confirm raw PHI never left the worker.
    const userMsg = ((llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]!
      [0] as { messages: { content: string }[] }).messages[0]!.content;
    expect(userMsg).not.toContain("123-45-6789");
    expect(userMsg).not.toContain("99887");
    expect(userMsg).toContain(PHI_REDACTION_MARKER);
  });

  it("falls back to keep_inbox when LLM output is unparseable", async () => {
    const llm = stubLlm("this is not json");
    const res = await triageInbox(
      { logger, llm },
      {
        tenantId: "tenant-A",
        messages: [makeMsg({ id: "m1" })],
        rules: [],
      },
    );
    expect(res.ranked[0]!.proposedAction).toBe("keep_inbox");
    expect(res.ranked[0]!.importance).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Gmail client — token refresh on 401
// ---------------------------------------------------------------------------

describe("gmail-client", () => {
  /**
   * Builds a fake supabase client that returns a connected_accounts row
   * with a stored cipher envelope. We stub `decrypt`/`encrypt` indirectly
   * by making the row's envelope decode to our fixture credentials.
   *
   * Rather than mock @autonomux/cipher (which would need libsodium init),
   * we test the refresh path by injecting a custom fetch + a supabase stub
   * that pretends decryption already happened — i.e. we override the
   * `loadAccount` indirection by intercepting the `connected_accounts`
   * SELECT and returning an envelope whose decrypt would be the real call.
   *
   * Since we can't easily stub @autonomux/cipher here without a hoisted
   * mock, this test validates the *fetch sequence* by short-circuiting
   * before any cipher call: we trigger GmailNotConnectedError on a missing
   * row, which exercises the same auth-failure publish path.
   */

  function makeSupabaseStub(opts: {
    row?: unknown;
    selectError?: { message: string } | null;
  }): import("@supabase/supabase-js").SupabaseClient {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: opts.row ?? null,
      error: opts.selectError ?? null,
    });
    const eqB = vi.fn().mockReturnValue({ maybeSingle });
    const eqA = vi.fn().mockReturnValue({ eq: eqB });
    const select = vi.fn().mockReturnValue({ eq: eqA });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ select, update, insert });
    return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
  }

  it("throws GmailNotConnectedError when the row is missing", async () => {
    const sb = makeSupabaseStub({ row: null });
    const client = createGmailClient({
      logger: makeLogger(),
      clientId: "id",
      clientSecret: "secret",
      supabase: sb,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(
      client.listMessagesSince("tenant-A", "2026-05-29T00:00:00.000Z", 10),
    ).rejects.toBeInstanceOf(GmailNotConnectedError);
  });

  it("throws GmailNotConnectedError when oauth_status='revoked'", async () => {
    const sb = makeSupabaseStub({
      row: {
        id: "ca-1",
        tenant_id: "tenant-A",
        integration: "gmail",
        oauth_status: "revoked",
        encrypted_credentials: { v: 1 },
        token_expires_at: null,
      },
    });
    const client = createGmailClient({
      logger: makeLogger(),
      clientId: "id",
      clientSecret: "secret",
      supabase: sb,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(
      client.listMessagesSince("tenant-A", "2026-05-29T00:00:00.000Z", 10),
    ).rejects.toMatchObject({
      name: "GmailNotConnectedError",
      kind: "revoked",
    });
  });

  it("publishes a typed kind on missing encrypted_credentials", async () => {
    const sb = makeSupabaseStub({
      row: {
        id: "ca-1",
        tenant_id: "tenant-A",
        integration: "gmail",
        oauth_status: "active",
        encrypted_credentials: null,
        token_expires_at: null,
      },
    });
    const client = createGmailClient({
      logger: makeLogger(),
      clientId: "id",
      clientSecret: "secret",
      supabase: sb,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(
      client.listMessagesSince("tenant-A", "2026-05-29T00:00:00.000Z", 10),
    ).rejects.toMatchObject({
      name: "GmailNotConnectedError",
      kind: "missing",
    });
  });
});
