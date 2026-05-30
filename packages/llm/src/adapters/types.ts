/**
 * Internal adapter contract.
 *
 * Both OpenRouter + Anthropic adapters implement `LlmAdapter`. The
 * public `LlmClient` (in client.ts) wraps the selected adapter and
 * delegates without translation.
 */

import type { Logger } from "pino";
import type {
  CompleteRequest,
  CompleteResponse,
  Provider,
  StreamChunk,
} from "../types";

export interface AdapterCtx {
  logger?: Logger | undefined;
}

export interface LlmAdapter {
  readonly provider: Provider;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
  stream(req: CompleteRequest): AsyncIterable<StreamChunk>;
}
