/**
 * Block 6, Fase 17/21 — file-based idempotency marker for RS3M's monthly
 * rebalance. Implements the `hasExecutedThisMonth`/`markExecuted` I/O
 * `rs3m-engine.ts` expects as injected dependencies (that module itself
 * has zero direct I/O — see its own doc comment).
 *
 * One marker file per decision month:
 * `results/block6/forward/<YYYY-MM>/executed.json`. Its mere existence is
 * the idempotency signal — `safety-guards.ts`'s `assertNotAlreadyExecutedThisMonth`
 * is what actually enforces "refuse a duplicate," this module only reads
 * and writes the marker.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AlpacaOrder } from "@/core/execution/alpaca-paper-client";

const FORWARD_DIR = join(process.cwd(), "results", "block6", "forward");

function markerPath(decisionMonth: string): string {
  return join(FORWARD_DIR, decisionMonth, "executed.json");
}

export async function hasExecutedThisMonth(decisionMonth: string): Promise<boolean> {
  return existsSync(markerPath(decisionMonth));
}

export async function markExecuted(decisionMonth: string, orders: readonly AlpacaOrder[]): Promise<void> {
  const dir = join(FORWARD_DIR, decisionMonth);
  mkdirSync(dir, { recursive: true });
  writeFileSync(markerPath(decisionMonth), JSON.stringify({ decisionMonth, executedAt: new Date().toISOString(), orders }, null, 2));
}

/** Reads back a previously-written marker — used by reconciliation/status tooling, never by the engine itself (which only needs the boolean above). */
export function readExecutedMarker(decisionMonth: string): { decisionMonth: string; executedAt: string; orders: AlpacaOrder[] } | undefined {
  const path = markerPath(decisionMonth);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as { decisionMonth: string; executedAt: string; orders: AlpacaOrder[] };
}
