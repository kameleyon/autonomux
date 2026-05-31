/**
 * @autonomux/orchestrator — public barrel.
 *
 * Callers should import from here only. The sub-modules are an internal
 * implementation detail (though `package.json` exports them for narrow
 * imports the same way `@autonomux/llm` does).
 */

export {
  AlterEgoRuntime,
  createAlterEgo,
  DEFAULT_MODEL,
  type AlterEgoRuntimeOpts,
  type BullMqEnqueuer,
  type PersistenceLayer,
  type RunStreamArgs,
} from "./runtime";

export {
  SubAgentRegistry,
  type EnqueueAndAwaitArgs,
  type SubAgentEntry,
  type SubAgentInvoke,
  type SubAgentInvokeContext,
} from "./sub-agents/registry";

export {
  mailroomEntry,
  mailroomTool,
} from "./sub-agents/mailroom.tool";

export {
  schedulerEntry,
  schedulerTool,
} from "./sub-agents/scheduler.tool";

export {
  composeSystemPrompt,
  type SystemPromptInputs,
} from "./system-prompt";

export {
  recallEpisodes,
  writeEpisode,
  type RecallEpisodesOpts,
  type RecalledEpisode,
  type WriteEpisodeOpts,
} from "./memory/episodic";

export {
  publishJobEvent,
  subscribeToJob,
  type AgentBusMessage,
  type SubscribeOptions,
} from "./agent-bus";

export type {
  FinalUsage,
  OrchestratorErrorClass,
  OrchestratorEvent,
} from "./events";
