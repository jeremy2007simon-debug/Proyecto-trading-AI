import "server-only";

import { getRs3mStrategy } from "@/novacore/strategy-hub/adapters/rs3m-adapter";
import { getCaStrategy } from "@/novacore/strategy-hub/adapters/ca-adapter";
import type { NovaCoreStrategy } from "@/novacore/shared/types";

/**
 * Block 7 — Strategy Hub registry. Block 10 adds the second entry
 * (`CA_CANDIDATE_V1`, SHADOW, via its own read-only adapter) exactly the
 * way this file's own doc comment anticipated — a flat list, one more
 * adapter, zero changes to the RS3M adapter or any Block 1-6/Block 6
 * code.
 */

export function listNovaCoreStrategies(): NovaCoreStrategy[] {
  return [getRs3mStrategy().strategy, getCaStrategy().strategy];
}

export function getNovaCoreStrategyById(id: string): NovaCoreStrategy | undefined {
  return listNovaCoreStrategies().find((s) => s.id === id);
}
