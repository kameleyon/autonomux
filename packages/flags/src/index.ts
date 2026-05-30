/**
 * packages/flags/src/index.ts
 *
 * Barrel export. Pick one of:
 *   import { evaluateFlag } from "@autonomux/flags";          // server
 *   import { useFeatureFlag } from "@autonomux/flags/client"; // browser
 *
 * Owner: [Lens + Forge]
 */

export type {
  FeatureFlag,
  FlagEvaluation,
  FlagEvaluationReason,
  FlagEvaluator,
  EvaluateFlagArgs,
} from "./types.js";

export {
  flagEvaluator,
  evaluateFlag,
  evaluateFlagWithReason,
  evaluateAllFlags,
  rolloutBucket,
} from "./server.js";

export { flagCache } from "./cache.js";
