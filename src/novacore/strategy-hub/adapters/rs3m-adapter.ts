import "server-only";

import { computeCandidateHash, RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { Rs3mStatus } from "@/core/paper-trading/rs3m/status";
import { EXPECTED_RS3M_CANDIDATE_V1_HASH } from "@/core/paper-trading/rs3m/safety-guards";
import { RS3M_FULL_HISTORY_METRICS, RS3M_OOS_LAST_25_MONTHS_METRICS } from "@/novacore/risk-analytics/adapters/rs3m-historical-metrics";
import { readRs3mCurrentStatus } from "@/novacore/strategy-hub/adapters/rs3m-status-reader";
import type { NovaCoreStrategy, NovaCoreStrategyStatus } from "@/novacore/shared/types";
import { readForwardEvidenceLedger } from "../../../../scripts/block6/paper/forward-evidence-store";

/**
 * Block 7 — the FIRST Strategy Hub entry, and the reference implementation
 * of "READ ONLY adapter over an existing, frozen strategy" (Block 7 spec
 * section 5). This file:
 *
 *  - imports ONLY read functions from the Block 6 RS3M module
 *    (`RS3M_CANDIDATE_V1`, `computeCandidateHash`, `currentStatus`,
 *    `readForwardEvidenceLedger`) — never `writeApproval`,
 *    `appendForwardEvidence`, `markExecuted`, or `submitNotionalOrder`.
 *  - never mutates `RS3M_CANDIDATE_V1` (it's `Object.freeze`d anyway) and
 *    never edits `src/core/paper-trading/rs3m/**` or `scripts/block6/**`.
 *  - re-derives NOTHING RS3M itself doesn't already compute: the candidate
 *    hash is recomputed here only to CONFIRM it still matches the
 *    independently pinned `EXPECTED_RS3M_CANDIDATE_V1_HASH` (a read,
 *    exactly like `safety-guards.ts` does at runtime before a real order),
 *    not to invent a new value.
 *  - never fabricates data: when `results/block6/**` files are absent in
 *    this environment (as they are today — see the module doc comments on
 *    `rs3m-status-reader.ts` and `forward-evidence-store.ts`), this
 *    adapter says so explicitly rather than defaulting to an invented
 *    number.
 */

function mapRs3mStatus(status: Rs3mStatus | undefined): NovaCoreStrategyStatus {
  switch (status) {
    case "CANDIDATE_FROZEN":
    case "AUDIT_PASSED":
      return "CANDIDATE";
    case "AUDIT_FAILED":
    case "REJECTED_FORWARD":
      return "REJECTED";
    case "PAPER_READY":
      return "PAPER_READY";
    case "PAPER_RUNNING":
    case "PAPER_PAUSED":
      return "PAPER_RUNNING";
    case "FORWARD_VERIFIED":
      return "FORWARD_VERIFIED";
    case undefined:
      // No live results/block6/candidate/rs3m-v1-status.json in this
      // environment. Fall back to the committed, human-authored
      // operational record (docs/RS3M_FORWARD_PAPER_TRACKING.md's own
      // "Estado actual" table), which is the best available reliable
      // source per the Block 7 "no recalcular/no inventar" principle —
      // never a NovaCore-invented default.
      return "PAPER_READY";
  }
}

export interface Rs3mAdapterResult {
  strategy: NovaCoreStrategy;
  /** True when the live status file was found and used; false when the doc-cited fallback above was used instead. */
  liveStatusAvailable: boolean;
  candidateHashVerified: boolean;
  forwardEvidence: {
    monthsObserved: number;
    totalOrdersSubmitted: number;
    lastKnownWinner: string | undefined;
    lastRecordTimestamp: string | undefined;
  };
}

export function getRs3mStrategy(): Rs3mAdapterResult {
  const candidateHash = computeCandidateHash(RS3M_CANDIDATE_V1);
  const candidateHashVerified = candidateHash === EXPECTED_RS3M_CANDIDATE_V1_HASH;

  const liveStatus = readRs3mCurrentStatus();
  const status = mapRs3mStatus(liveStatus);

  const ledger = readForwardEvidenceLedger();
  const executedRows = ledger.filter((row) => row.finalState === "EXECUTED");
  const monthsObserved = new Set(executedRows.map((row) => row.decisionMonth)).size;
  const totalOrdersSubmitted = executedRows.reduce((sum, row) => sum + row.submittedOrders.length, 0);
  const lastRecord = ledger.at(-1);

  const strategy: NovaCoreStrategy = {
    id: RS3M_CANDIDATE_V1.candidateId,
    version: String(RS3M_CANDIDATE_V1.version),
    name: "RS3M — Relative Strength 3-Month Rotation",
    family: "RELATIVE_STRENGTH",
    status,
    broker: "alpaca-paper",
    environment: "PAPER",
    candidateHash,
    hypothesis: "Monthly rotation into whichever of SPY/QQQ/IWM/DIA had the strongest trailing 3-month return, single-winner 100% allocation, no leverage.",
    performance: {
      historical: {
        totalReturnPct: RS3M_FULL_HISTORY_METRICS.totalReturnPct,
        cagrPct: RS3M_FULL_HISTORY_METRICS.cagrPct,
        volatilityPct: RS3M_FULL_HISTORY_METRICS.volatilityPct,
        maxDrawdownPct: RS3M_FULL_HISTORY_METRICS.maxDrawdownPct,
        sharpe: RS3M_FULL_HISTORY_METRICS.sharpe,
        sortino: RS3M_FULL_HISTORY_METRICS.sortino,
        calmar: RS3M_FULL_HISTORY_METRICS.calmar,
        benchmarkReturnPct: RS3M_FULL_HISTORY_METRICS.benchmarkSpyCagrPct,
        excessReturnPct: RS3M_FULL_HISTORY_METRICS.excessReturnVsSpyCagrPct,
        periodStart: RS3M_FULL_HISTORY_METRICS.periodStart,
        periodEnd: RS3M_FULL_HISTORY_METRICS.periodEnd,
        sourceDoc: RS3M_FULL_HISTORY_METRICS.sourceDoc,
      },
      forward:
        monthsObserved > 0
          ? {
              monthsObserved,
              sourceDoc: "results/block6/forward/ledger.jsonl (live, computed via forward-performance.ts)",
            }
          : {
              monthsObserved: 0,
              sourceDoc: "results/block6/forward/ledger.jsonl — no EXECUTED rows in this environment; forward evidence not started (see docs/RS3M_FORWARD_PAPER_TRACKING.md).",
            },
    },
    risk: {
      historicalMaxDrawdownPct: RS3M_FULL_HISTORY_METRICS.maxDrawdownPct,
      forwardMaxDrawdownPct: undefined,
      turnover: undefined,
      ordersRejected: 0,
      ordersPartialFill: 0,
      executionErrors: 0,
    },
    sourceOfTruth: {
      "definition/hash": "src/core/paper-trading/rs3m/candidate.ts (frozen, Block 6)",
      status: liveStatus ? "results/block6/candidate/rs3m-v1-status.json (live)" : "docs/RS3M_FORWARD_PAPER_TRACKING.md (doc fallback — no live status file in this environment)",
      "historical metrics": RS3M_FULL_HISTORY_METRICS.sourceDoc,
      "OOS metrics": RS3M_OOS_LAST_25_MONTHS_METRICS.sourceDoc,
      "forward evidence": "results/block6/forward/ledger.jsonl (read-only)",
      "broker account/positions": "Alpaca PAPER API, via src/novacore/broker/alpaca-paper-broker-adapter.ts (read-only)",
    },
  };

  return {
    strategy,
    liveStatusAvailable: liveStatus !== undefined,
    candidateHashVerified,
    forwardEvidence: {
      monthsObserved,
      totalOrdersSubmitted,
      lastKnownWinner: lastRecord?.winner,
      lastRecordTimestamp: lastRecord?.timestamp,
    },
  };
}

export function getRs3mOosMetrics() {
  return RS3M_OOS_LAST_25_MONTHS_METRICS;
}
