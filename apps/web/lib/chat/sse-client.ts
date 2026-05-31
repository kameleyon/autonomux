/**
 * apps/web/lib/chat/sse-client.ts
 *
 * Typed POST-and-stream SSE client. Browser `EventSource` is GET-only, so
 * we use `fetch` + a manual `ReadableStream` reader and parse `data:` frames
 * ourselves. Returns an AsyncIterable of fully-typed OrchestratorEvent so
 * callers can `for await (const ev of openChatStream(...))`.
 *
 * Cancellation: pass an `AbortSignal`. When aborted, the underlying fetch
 * is torn down — that triggers `request.signal.aborted` on the server side,
 * which the SSE route uses to abort the orchestrator + mark the run
 * `cancelled` (no orphan charge).
 *
 * Wire format (text/event-stream):
 *
 *   event: orchestrator
 *   data: {"type":"text_delta","delta":"hello"}
 *
 *   data: {"type":"text_delta","delta":" world"}
 *
 *   event: done
 *   data: {}
 *
 * We accept either `event: <name>` framing or plain `data:` lines; only the
 * JSON payload matters. Empty-line is the frame separator per spec.
 *
 * Owner: [Cluster C · Forge + Vega]
 */

import type { OrchestratorEvent } from "./types";

export interface ChatStreamRequest {
  threadId: string;
  userMessage: string;
}

export interface OpenChatStreamOptions {
  signal?: AbortSignal;
  /** Override for tests / dev. Defaults to `/api/chat/stream`. */
  endpoint?: string;
}

export class ChatStreamHttpError extends Error {
  readonly code = "CHAT_STREAM_HTTP" as const;
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
  ) {
    super(`Chat stream request failed: HTTP ${status}`);
    this.name = "ChatStreamHttpError";
  }
}

/**
 * Open a POST stream to the orchestrator SSE endpoint and yield typed
 * events as they arrive. The returned AsyncIterable terminates when the
 * server closes the stream, when `signal` aborts, or when the response
 * status is non-2xx (throws `ChatStreamHttpError`).
 */
export async function* openChatStream(
  request: ChatStreamRequest,
  options: OpenChatStreamOptions = {},
): AsyncGenerator<OrchestratorEvent, void, void> {
  const endpoint = options.endpoint ?? "/api/chat/stream";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify(request),
    signal: options.signal,
    // Required for streaming responses on Chromium-based browsers.
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    // Drain the body so we get a usable error message — at most ~4kB.
    let bodyText = "";
    try {
      bodyText = (await response.text()).slice(0, 4000);
    } catch {
      bodyText = "<unreadable error body>";
    }
    throw new ChatStreamHttpError(response.status, bodyText);
  }

  const body = response.body;
  if (body === null) {
    // No body at all (rare) — treat as a clean close, no events.
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    // Buffer bytes and split on `\n\n` (the SSE frame separator).
    // CRLF normalisation is handled because we only look for "\n\n".
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIdx = buffer.indexOf("\n\n");
      while (separatorIdx !== -1) {
        const rawFrame = buffer.slice(0, separatorIdx);
        buffer = buffer.slice(separatorIdx + 2);

        const event = parseSseFrame(rawFrame);
        if (event !== null) {
          yield event;
        }
        separatorIdx = buffer.indexOf("\n\n");
      }
    }

    // Flush trailing frame (server forgot the final blank line).
    if (buffer.trim().length > 0) {
      const event = parseSseFrame(buffer);
      if (event !== null) yield event;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader already released by abort — fine.
    }
  }
}

/**
 * Parse one `\n\n`-terminated SSE frame. Concatenates all `data:` lines
 * (per RFC), JSON-parses the result, and returns `null` on malformed or
 * non-orchestrator frames (e.g. keepalive comments starting with `:`).
 */
function parseSseFrame(frame: string): OrchestratorEvent | null {
  const lines = frame.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    // SSE comment / keepalive — ignore.
    if (line.startsWith(":")) continue;
    if (!line.startsWith("data:")) continue;
    // Spec: a single leading space after `data:` is stripped, others preserved.
    const payload = line.slice(5).replace(/^ /, "");
    dataLines.push(payload);
  }
  if (dataLines.length === 0) return null;

  const joined = dataLines.join("\n");
  // Special-cased terminal frame the server may send as `data: [DONE]`.
  if (joined === "[DONE]") return null;

  try {
    const parsed = JSON.parse(joined) as unknown;
    if (!isOrchestratorEvent(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isOrchestratorEvent(value: unknown): value is OrchestratorEvent {
  if (typeof value !== "object" || value === null) return false;
  const t = (value as { type?: unknown }).type;
  return (
    t === "text_delta" ||
    t === "sub_agent_start" ||
    t === "sub_agent_progress" ||
    t === "sub_agent_result" ||
    t === "final_usage" ||
    t === "error"
  );
}
