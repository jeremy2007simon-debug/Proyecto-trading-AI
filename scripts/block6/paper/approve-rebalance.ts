/**
 * Block 6, forward-testing — HUMAN-RUN ONLY. Records an explicit approval
 * for one decision month's rebalance plan, pinned to the candidate hash
 * computed FRESH at approval time (never a cached/stored value, so an
 * in-place edit of `RS3M_CANDIDATE_V1` between now and execution would
 * still be caught by `assertCandidateHashNotTampered` at execution time,
 * since the approval's own hash would no longer match).
 *
 * This script is NEVER invoked by the automated Routine — it exists
 * purely for a human to run deliberately (directly, or by asking Claude
 * to run it) after reviewing the "awaiting approval" notification.
 * Writing this file does NOT submit any order by itself: every safety
 * guard (staleness, idempotency, paper-only endpoint, symbol whitelist,
 * no-shorts, no-leverage, candidate hash) is re-evaluated FRESH the
 * moment `run-rebalance.ts` is later run with `PAPER_TRADING=true` — see
 * `rs3m-engine.ts#execute()`, which always calls `computePlan()` first.
 *
 * Run with:
 *   npx tsx scripts/block6/paper/approve-rebalance.ts <decisionMonth> ["approver note"]
 *
 * Example:
 *   npx tsx scripts/block6/paper/approve-rebalance.ts 2026-08 "approved via chat with Jeremy"
 */
import { computeCandidateHash, RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { readAwaitingApprovalMarker, writeApproval } from "./approval-store";

function main() {
  const decisionMonth = process.argv[2];
  const note = process.argv[3] ?? "approved via approve-rebalance.ts (no note provided)";

  if (!decisionMonth || !/^\d{4}-\d{2}$/.test(decisionMonth)) {
    console.error('[approve-rebalance] Usage: npx tsx scripts/block6/paper/approve-rebalance.ts <YYYY-MM> ["note"]');
    process.exitCode = 1;
    return;
  }

  const marker = readAwaitingApprovalMarker(decisionMonth);
  if (!marker) {
    console.warn(`[approve-rebalance] WARNING: no "awaiting approval" record found for ${decisionMonth} — the Routine may not have flagged this month yet, or it's already past. Proceeding to record the approval anyway, but double-check this is the month you intend.`);
  } else {
    console.log(`[approve-rebalance] Plan snapshot recorded ${marker.recordedAt} for ${decisionMonth}:`);
    console.log(JSON.stringify(marker.snapshot, null, 2));
  }

  const candidateHash = computeCandidateHash(RS3M_CANDIDATE_V1);
  const approval = { decisionMonth, candidateHash, approvedAt: new Date().toISOString(), approvedBy: note };
  writeApproval(approval);

  console.log(`\n=== Approval recorded for ${decisionMonth} (candidate hash ${candidateHash}) ===`);
  console.log("This does NOT submit any order by itself. Every safety guard (freshness, idempotency, paper-only endpoint, symbol whitelist, no-shorts, no-leverage, candidate hash) is re-verified fresh the moment the rebalance actually runs with PAPER_TRADING=true — if the signal has gone stale or anything else has changed since this approval, it will still be blocked.");
}

main();
