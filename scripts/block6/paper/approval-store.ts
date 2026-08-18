/**
 * Block 6, forward-testing — file-based I/O backing the manual approval
 * gate (`src/core/paper-trading/rs3m/approval.ts`,
 * `safety-guards.ts#assertApprovalGranted`). Two markers per decision
 * month, both under `results/block6/forward/<month>/`, deliberately
 * separate from the idempotency marker in `idempotency-store.ts`
 * (`results/block6/forward/<month>/executed.json`) — approval and
 * execution are different facts and must never be conflated:
 *
 * - `awaiting-approval.json` — written ONCE by `run-rebalance.ts` the
 *   first time a decision month's dry-run plan has every guard passing
 *   except approval. Its only purpose is to avoid re-notifying the human
 *   every single day of the freshness window, and to give
 *   `approve-rebalance.ts` a snapshot to display. It is NEVER read by any
 *   safety guard.
 * - `approval.json` — written ONLY by a human running
 *   `approve-rebalance.ts` directly (never by the automated Routine, never
 *   by `run-rebalance.ts` itself). `hasValidApproval` requires an EXACT
 *   match on both `decisionMonth` and `candidateHash` — an approval for a
 *   different month, or recorded against a stale/tampered hash, never
 *   counts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RebalanceApproval } from "@/core/paper-trading/rs3m/approval";

const FORWARD_DIR = join(process.cwd(), "results", "block6", "forward");

function monthDir(decisionMonth: string): string {
  return join(FORWARD_DIR, decisionMonth);
}

function approvalPath(decisionMonth: string): string {
  return join(monthDir(decisionMonth), "approval.json");
}

function awaitingApprovalPath(decisionMonth: string): string {
  return join(monthDir(decisionMonth), "awaiting-approval.json");
}

/** The ONLY function any safety-relevant code path may call. Requires an EXACT match on decisionMonth AND candidateHash — see the module doc comment. */
export async function hasValidApproval(decisionMonth: string, candidateHash: string): Promise<boolean> {
  const path = approvalPath(decisionMonth);
  if (!existsSync(path)) return false;
  const approval = JSON.parse(readFileSync(path, "utf8")) as RebalanceApproval;
  return approval.decisionMonth === decisionMonth && approval.candidateHash === candidateHash;
}

export function readApproval(decisionMonth: string): RebalanceApproval | undefined {
  const path = approvalPath(decisionMonth);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as RebalanceApproval;
}

/** Called ONLY by `approve-rebalance.ts` (a script a human runs directly) — never by the Routine or `run-rebalance.ts`. */
export function writeApproval(approval: RebalanceApproval): void {
  mkdirSync(monthDir(approval.decisionMonth), { recursive: true });
  writeFileSync(approvalPath(approval.decisionMonth), JSON.stringify(approval, null, 2));
}

export function hasAwaitingApprovalMarker(decisionMonth: string): boolean {
  return existsSync(awaitingApprovalPath(decisionMonth));
}

/** Persists the full plan snapshot the first time a month enters the "awaiting approval" state — `run-rebalance.ts` checks `hasAwaitingApprovalMarker` first so this (and the accompanying notification) only ever fires once per month, not once per daily Routine run. */
export function writeAwaitingApprovalMarker(decisionMonth: string, snapshot: Record<string, unknown>): void {
  mkdirSync(monthDir(decisionMonth), { recursive: true });
  writeFileSync(awaitingApprovalPath(decisionMonth), JSON.stringify({ decisionMonth, recordedAt: new Date().toISOString(), snapshot }, null, 2));
}

export function readAwaitingApprovalMarker(decisionMonth: string): { decisionMonth: string; recordedAt: string; snapshot: Record<string, unknown> } | undefined {
  const path = awaitingApprovalPath(decisionMonth);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as { decisionMonth: string; recordedAt: string; snapshot: Record<string, unknown> };
}
