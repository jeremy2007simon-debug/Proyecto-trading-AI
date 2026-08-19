import "server-only";

import { computeCandidateHash, RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { getEasternWallClockParts } from "@/core/market-hours/nyse-calendar";
import type { ExecutionCenterSnapshot } from "@/novacore/execution-center/types";
import { readApproval, hasAwaitingApprovalMarker } from "../../../../scripts/block6/paper/approval-store";
import { readForwardEvidenceLedger } from "../../../../scripts/block6/paper/forward-evidence-store";
import { determineRebalanceTarget } from "../../../../scripts/block6/paper/scheduling";

/**
 * Block 7 — READ-ONLY Execution Center adapter for RS3M. Imports only
 * read functions (`readApproval`, `hasAwaitingApprovalMarker`,
 * `readForwardEvidenceLedger`) — never `writeApproval`,
 * `writeAwaitingApprovalMarker`, `appendForwardEvidence`, or anything
 * from `run-rebalance.ts`/`approve-rebalance.ts` that would submit an
 * order or record an approval. `determineRebalanceTarget` is pure
 * date arithmetic (no I/O) reused as-is to compute which decision month
 * "current" refers to, exactly the same way `run-rebalance.ts` does.
 */

const REQUIRE_APPROVAL_DEFAULT = process.env.RS3M_REQUIRE_APPROVAL !== "false";

export function getRs3mExecutionSnapshot(): ExecutionCenterSnapshot {
  const candidateHash = computeCandidateHash(RS3M_CANDIDATE_V1);
  const target = determineRebalanceTarget(getEasternWallClockParts(new Date()));
  const decisionMonth = target.decisionMonthKey;

  const ledger = readForwardEvidenceLedger();
  const executedRows = ledger.filter((row) => row.finalState === "EXECUTED");
  const ordersSubmittedTotal = executedRows.reduce((sum, row) => sum + row.submittedOrders.length, 0);
  const lastExecuted = executedRows.at(-1);

  const currentPosition: ExecutionCenterSnapshot["currentPosition"] =
    lastExecuted?.positionsAfter && lastExecuted.positionsAfter.length > 0
      ? { state: "HOLDING", symbol: lastExecuted.positionsAfter[0].symbol, detail: `Last known position from forward evidence, decision month ${lastExecuted.decisionMonth}.` }
      : { state: "CASH", detail: "No EXECUTED rebalance recorded in results/block6/forward/ledger.jsonl yet — RS3M has never held a paper position (0 real orders submitted so far)." };

  const lastRecord = ledger.at(-1);
  const lastKnownSignal = lastRecord?.decisionMonth ? { decisionMonth: lastRecord.decisionMonth, winner: lastRecord.winner, recordedAt: lastRecord.timestamp } : undefined;

  const approvalRecord = readApproval(decisionMonth);
  const approvedForCurrentMonth = approvalRecord !== undefined && approvalRecord.decisionMonth === decisionMonth && approvalRecord.candidateHash === candidateHash;
  const awaitingApproval = hasAwaitingApprovalMarker(decisionMonth) && !approvedForCurrentMonth;

  return {
    strategyId: RS3M_CANDIDATE_V1.candidateId,
    broker: "alpaca-paper",
    environment: "PAPER",
    candidateHash,
    currentPosition,
    lastKnownSignal,
    ordersSubmittedTotal,
    approval: {
      currentDecisionMonth: decisionMonth,
      required: REQUIRE_APPROVAL_DEFAULT,
      approvedForCurrentMonth,
      awaitingApproval,
    },
    routine: {
      // Live Routine health (the scheduled trigger itself) isn't
      // observable from inside this Node process — it's an external
      // scheduler, not a file this codebase writes. Reporting the last
      // DOCUMENTED validation fact rather than inventing a live probe.
      status: "HEALTHY",
      detail: "Per docs/RS3M_FORWARD_PAPER_TRACKING.md: NYSE-aware daily Routine created and validated 2026-08-17 (two manual validation fires, no errors). Live Routine health is not observable from within this application — see that doc for the operational record.",
    },
    sourceOfTruth: {
      "candidate hash": "src/core/paper-trading/rs3m/candidate.ts",
      "current decision month": "scripts/block6/paper/scheduling.ts#determineRebalanceTarget (pure NYSE-calendar arithmetic)",
      "position / last signal / orders": "results/block6/forward/ledger.jsonl (read-only)",
      approval: "results/block6/forward/<month>/approval.json + awaiting-approval.json (read-only)",
      routine: "docs/RS3M_FORWARD_PAPER_TRACKING.md (documented operational record — no live probe)",
    },
  };
}
