import "server-only";

import { getRs3mStrategy } from "@/novacore/strategy-hub/adapters/rs3m-adapter";
import type { NovaCoreStrategy } from "@/novacore/shared/types";

/**
 * Block 7 — Strategy Hub registry. Today this has exactly one entry
 * (`RS3M_CANDIDATE_V1`, via a read-only adapter). Adding "Strategy #2"
 * later (Block 8, Prop Firm Research) means adding one more adapter here
 * — this file's shape is deliberately a flat list so that addition never
 * requires touching the RS3M adapter or any Block 1-6 code.
 */

export function listNovaCoreStrategies(): NovaCoreStrategy[] {
  return [getRs3mStrategy().strategy];
}

export function getNovaCoreStrategyById(id: string): NovaCoreStrategy | undefined {
  return listNovaCoreStrategies().find((s) => s.id === id);
}
