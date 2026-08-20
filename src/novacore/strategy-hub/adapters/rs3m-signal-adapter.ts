import "server-only";

import { computeCandidateHash, RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { getEasternWallClockParts } from "@/core/market-hours/nyse-calendar";
import { getInstrumentConfig } from "@/core/market-data/instruments";
import type { Market } from "@/core/shared/types";
import type { DataProvenance } from "@/novacore/shared/types";
import { readForwardEvidenceLedger } from "../../../../scripts/block6/paper/forward-evidence-store";
import { determineRebalanceTarget } from "../../../../scripts/block6/paper/scheduling";

/**
 * Block 7 / Observability Upgrade — "Current RS3M Signal" panel data.
 *
 * READ-ONLY: the single source is `results/block6/forward/ledger.jsonl`
 * (via `readForwardEvidenceLedger`, already used elsewhere in NovaCore),
 * which `run-rebalance.ts` appends to on EVERY attempt — executed,
 * blocked, or a no-op — so it already carries everything this panel
 * needs (ranking, winner, target ticker, proposed orders, estimated
 * turnover, guard violations) without a second file or a live compute.
 * Never computes a signal itself: no market-data fetch, no call into
 * `signal-calculator.ts`. If the ledger has no row for the current (or
 * any) decision month, this returns `status: "UNAVAILABLE"` — it never
 * fabricates a ranking or a winner.
 */

export type Rs3mSignalStatus = "EXECUTED" | "AWAITING_APPROVAL" | "BLOCKED" | "NO_REBALANCE_NEEDED" | "UNAVAILABLE";

export interface Rs3mSignalRankingEntry {
  market: string;
  ticker: string;
  trailingReturnPct: number;
}

export interface Rs3mSignalProposedOrder {
  symbol: string;
  side: "buy" | "sell";
  notionalUsd: number;
  reason: string;
}

export interface Rs3mCurrentSignal {
  status: Rs3mSignalStatus;
  currentDecisionMonth: string;
  decisionMonth?: string;
  dataCutoff?: string;
  /** Days between dataCutoff and now — undefined if dataCutoff is unknown. */
  signalAgeDays?: number;
  ranking: Rs3mSignalRankingEntry[];
  winner?: string;
  winnerTicker?: string;
  candidateId: string;
  candidateHash: string;
  estimatedTurnoverPct?: number;
  proposedOrders: Rs3mSignalProposedOrder[];
  guardViolations: { guard: string; reason: string }[];
  skipReason?: string;
  provenance: DataProvenance;
  source: string;
  recordedAt?: string;
}

function tickerFor(market: string): string {
  const config = getInstrumentConfig(market as Market);
  return config.ok ? config.value.ticker : market;
}

export function getRs3mCurrentSignal(): Rs3mCurrentSignal {
  const candidateHash = computeCandidateHash(RS3M_CANDIDATE_V1);
  const target = determineRebalanceTarget(getEasternWallClockParts(new Date()));
  const currentDecisionMonth = target.decisionMonthKey;

  const ledger = readForwardEvidenceLedger();
  const rowForCurrentMonth = ledger.filter((r) => r.decisionMonth === currentDecisionMonth).at(-1);
  const chosen = rowForCurrentMonth ?? ledger.at(-1);

  if (!chosen) {
    return {
      status: "UNAVAILABLE",
      currentDecisionMonth,
      ranking: [],
      candidateId: RS3M_CANDIDATE_V1.candidateId,
      candidateHash,
      proposedOrders: [],
      guardViolations: [],
      provenance: "UNAVAILABLE",
      source: "results/block6/forward/ledger.jsonl — no rows recorded in this environment (forward evidence not started; see docs/RS3M_FORWARD_PAPER_TRACKING.md).",
    };
  }

  const onlyApprovalMissing = chosen.guardViolations.length === 1 && chosen.guardViolations[0].guard === "APPROVAL_REQUIRED";
  const status: Rs3mSignalStatus =
    chosen.finalState === "EXECUTED"
      ? "EXECUTED"
      : chosen.finalState === "NO_REBALANCE_NEEDED"
        ? "NO_REBALANCE_NEEDED"
        : onlyApprovalMissing
          ? "AWAITING_APPROVAL"
          : "BLOCKED";

  const dataCutoffMs = chosen.dataCutoff ? new Date(chosen.dataCutoff).getTime() : undefined;
  const signalAgeDays = dataCutoffMs !== undefined ? Math.floor((Date.now() - dataCutoffMs) / (24 * 60 * 60 * 1000)) : undefined;

  return {
    status,
    currentDecisionMonth,
    decisionMonth: chosen.decisionMonth,
    dataCutoff: chosen.dataCutoff,
    signalAgeDays,
    ranking: chosen.ranking.map((r) => ({ market: r.market, ticker: tickerFor(r.market), trailingReturnPct: r.trailingReturnPct })),
    winner: chosen.winner,
    winnerTicker: chosen.winner ? tickerFor(chosen.winner) : undefined,
    candidateId: RS3M_CANDIDATE_V1.candidateId,
    candidateHash,
    estimatedTurnoverPct: chosen.estimatedTurnoverPct,
    proposedOrders: chosen.proposedOrders,
    guardViolations: chosen.guardViolations,
    skipReason: chosen.skipReason,
    provenance: "FORWARD_EVIDENCE",
    source: "results/block6/forward/ledger.jsonl (read-only)",
    recordedAt: chosen.timestamp,
  };
}
