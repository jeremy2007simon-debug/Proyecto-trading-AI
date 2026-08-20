import "server-only";

import { computeCandidateHash, RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { getEasternWallClockParts } from "@/core/market-hours/nyse-calendar";
import { createAlpacaPaperBrokerAdapter } from "@/novacore/broker/alpaca-paper-broker-adapter";
import type { ExecutionCenterSnapshot } from "@/novacore/execution-center/types";
import { readApproval, hasAwaitingApprovalMarker } from "../../../../scripts/block6/paper/approval-store";
import { readForwardEvidenceLedger } from "../../../../scripts/block6/paper/forward-evidence-store";
import { determineRebalanceTarget } from "../../../../scripts/block6/paper/scheduling";

/**
 * Block 7 / Observability Upgrade — READ-ONLY Execution Center adapter for
 * RS3M. Imports only read functions (`readApproval`,
 * `hasAwaitingApprovalMarker`, `readForwardEvidenceLedger`,
 * `BrokerAdapter#getPositions`) — never `writeApproval`,
 * `writeAwaitingApprovalMarker`, `appendForwardEvidence`, or
 * `submitNotionalOrder`. `determineRebalanceTarget` is pure date
 * arithmetic (no I/O) reused as-is to compute which decision month
 * "current" refers to, exactly the same way `run-rebalance.ts` does.
 *
 * `currentPosition` prefers a LIVE broker read (the ground truth, when
 * credentials are configured) and only falls back to reasoning from the
 * forward-evidence ledger — "no EXECUTED row exists, so RS3M must still be
 * in CASH" — when live data isn't available. Every path is labeled with
 * its `DataProvenance` so the UI never implies a live number when it's
 * actually a fallback inference.
 */

const REQUIRE_APPROVAL_DEFAULT = process.env.RS3M_REQUIRE_APPROVAL !== "false";

export async function getRs3mExecutionSnapshot(): Promise<ExecutionCenterSnapshot> {
  const candidateHash = computeCandidateHash(RS3M_CANDIDATE_V1);
  const target = determineRebalanceTarget(getEasternWallClockParts(new Date()));
  const decisionMonth = target.decisionMonthKey;

  const ledger = readForwardEvidenceLedger();
  const executedRows = ledger.filter((row) => row.finalState === "EXECUTED");
  const ordersSubmittedTotal = executedRows.reduce((sum, row) => sum + row.submittedOrders.length, 0);
  const lastExecuted = executedRows.at(-1);

  const MARKET_TO_TICKER: Record<string, string> = { SP500: "SPY", NASDAQ100: "QQQ", RUSSELL2000: "IWM", DOWJONES: "DIA" };
  const rs3mTickers = new Set(RS3M_CANDIDATE_V1.universe.map((m) => MARKET_TO_TICKER[m] ?? m));

  let currentPosition: ExecutionCenterSnapshot["currentPosition"];
  const livePositions = await createAlpacaPaperBrokerAdapter().getPositions();
  if (livePositions.ok) {
    const rs3mPosition = livePositions.value.find((p) => rs3mTickers.has(p.symbol) && p.qty !== 0);
    currentPosition = rs3mPosition
      ? {
          state: "HOLDING",
          symbol: rs3mPosition.symbol,
          marketValue: rs3mPosition.marketValue,
          unrealizedPl: rs3mPosition.unrealizedPl,
          unrealizedPlPct: rs3mPosition.unrealizedPlPct,
          detail: "Live position read from the Alpaca PAPER account.",
          provenance: "LIVE",
        }
      : { state: "CASH", detail: "Live read of the Alpaca PAPER account shows no RS3M-universe position currently held.", provenance: "LIVE" };
  } else if (lastExecuted?.positionsAfter && lastExecuted.positionsAfter.length > 0) {
    currentPosition = {
      state: "HOLDING",
      symbol: lastExecuted.positionsAfter[0].symbol,
      marketValue: lastExecuted.positionsAfter[0].marketValue,
      detail: `Broker read unavailable (${livePositions.error.message}) — falling back to the last known position from forward evidence, decision month ${lastExecuted.decisionMonth}.`,
      provenance: "FORWARD_EVIDENCE",
    };
  } else {
    currentPosition = {
      state: "CASH",
      detail: `Broker read unavailable (${livePositions.error.message}). No EXECUTED rebalance recorded in results/block6/forward/ledger.jsonl either — RS3M has never held a paper position (0 real orders submitted so far), so CASH is the only consistent inference.`,
      provenance: ordersSubmittedTotal === 0 ? "FORWARD_EVIDENCE" : "UNAVAILABLE",
    };
  }

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
    executionMode: "PAPER",
    liveStatus: "STRUCTURALLY_DISABLED",
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
      detail: "Per docs/RS3M_FORWARD_PAPER_TRACKING.md: NYSE-aware daily Routine created and validated 2026-08-17 (two manual validation fires, no errors). Live Routine health is not observable from within this application.",
    },
    sourceOfTruth: {
      "candidate hash": "src/core/paper-trading/rs3m/candidate.ts",
      "current decision month": "scripts/block6/paper/scheduling.ts#determineRebalanceTarget (pure NYSE-calendar arithmetic)",
      "current position": currentPosition.provenance === "LIVE" ? "Alpaca PAPER API (live read)" : "results/block6/forward/ledger.jsonl (fallback — live broker read unavailable)",
      "last signal": "results/block6/forward/ledger.jsonl (read-only)",
      "orders submitted": "results/block6/forward/ledger.jsonl (read-only)",
      approval: "results/block6/forward/<month>/approval.json + awaiting-approval.json (read-only)",
      routine: "docs/RS3M_FORWARD_PAPER_TRACKING.md (documented operational record — no live probe)",
    },
  };
}
