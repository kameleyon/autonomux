/**
 * packages/flags/src/client.ts
 *
 * Client-side flag hook. Reads from a server-passed dictionary — NEVER
 * hits the DB directly. The pattern:
 *
 *   // app/layout.tsx (Server Component)
 *   const flags = await evaluateAllFlags({ tenantId });
 *   return <FlagProvider value={flags}>{children}</FlagProvider>;
 *
 *   // app/some-client-component.tsx
 *   "use client";
 *   const enabled = useFeatureFlag("experimental_oracle_v2");
 *
 * This keeps the read path on the server (where it belongs) and gives
 * the client deterministic, JS-bundle-free flag access. The future
 * GrowthBook swap replaces the provider's implementation while leaving
 * `useFeatureFlag()` callers untouched.
 *
 * Owner: [Lens + Forge]
 */

"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";

export type FlagDictionary = Readonly<Record<string, boolean>>;

const FlagContext = createContext<FlagDictionary>({});

export interface FlagProviderProps {
  value: FlagDictionary;
  children: ReactNode;
}

export function FlagProvider(props: FlagProviderProps): ReactNode {
  return createElement(
    FlagContext.Provider,
    { value: props.value },
    props.children,
  );
}

/**
 * Read a flag value previously batched in via `<FlagProvider>`. Defaults
 * to false (the same default the server evaluator uses for unknown
 * flags) so a typo never enables a feature.
 */
export function useFeatureFlag(key: string): boolean {
  const dict = useContext(FlagContext);
  return dict[key] === true;
}

/**
 * Escape hatch for client code that needs the whole dictionary
 * (e.g. a debug panel).
 */
export function useAllFeatureFlags(): FlagDictionary {
  return useContext(FlagContext);
}
