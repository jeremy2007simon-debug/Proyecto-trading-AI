import "server-only";

import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { computeForwardPerformance } from "@/core/paper-trading/rs3m/forward-performance";
import { RS3M_COST_ROBUSTNESS, RS3M_FULL_HISTORY_METRICS, RS3M_OOS_LAST_25_MONTHS_METRICS } from "@/novacore/risk-analytics/adapters/rs3m-historical-metrics";
import type { RiskAnalyticsSnapshot } from "@/novacore/risk-analytics/types";
import { readForwardEvidenceLedger } from "../../../../scripts/block6/paper/forward-evidence-store";

/**
 * Block 7 — RS3M Risk & Analytics adapter. Historical/OOS figures are
 * transcribed constants (see `rs3m-historical-metrics.ts`'s doc comment).
 * Forward figures are computed with the EXISTING, unmodified
 * `computeForwardPerformance` (Block 6) applied to the real forward
 * evidence ledger — never a new metrics implementation. With fewer than 2
 * EXECUTED months of forward evidence (the current state of this
 * environment: 0), a CAGR/drawdown/Sharpe series is not meaningful, so
 * this adapter reports `available: false` with an honest reason instead
 * of computing a number from an empty or single-point series.
 */

const MIN_MONTHS_FOR_FORWARD_METRICS = 2;

export function getRs3mRiskSnapshot(): RiskAnalyticsSnapshot {
  const ledger = readForwardEvidenceLedger();
  const executedRows = ledger.filter((row) => row.finalState === "EXECUTED" && row.decisionMonth && row.accountEquityAfterUsd !== undefined);
  const monthsObserved = new Set(executedRows.map((row) => row.decisionMonth)).size;

  const executionErrors = ledger.filter((row) => row.finalState === "BLOCKED" && row.guardViolations.some((v) => ["BROKER_ERROR", "SCHEDULER_ERROR", "DATA_ERROR"].includes(v.guard))).length;

  let forwardMetrics: RiskAnalyticsSnapshot["forwardMetrics"];
  if (monthsObserved < MIN_MONTHS_FOR_FORWARD_METRICS) {
    forwardMetrics = {
      available: false,
      monthsObserved,
      reason:
        monthsObserved === 0
          ? "No EXECUTED rows in results/block6/forward/ledger.jsonl — forward paper trading has not started in this environment (see docs/RS3M_FORWARD_PAPER_TRACKING.md)."
          : `Only ${monthsObserved} month(s) of forward evidence recorded — at least ${MIN_MONTHS_FOR_FORWARD_METRICS} are needed for a meaningful CAGR/drawdown series.`,
    };
  } else {
    const equityCurve = executedRows
      .filter((row) => row.decisionMonth !== undefined && row.accountEquityAfterUsd !== undefined)
      .map((row) => ({ month: row.decisionMonth as string, equity: row.accountEquityAfterUsd as number }));
    // No live benchmark equity curve is fetched here (no market-data calls
    // on page load, per Block 7 performance principle) — benchmark/excess
    // figures are left undefined until a dedicated reconciliation job
    // (`backtest-vs-paper.ts`, already built in Block 6) supplies them.
    const result = computeForwardPerformance({
      strategyEquityCurve: equityCurve,
      benchmarkEquityCurve: [],
      equalWeightEquityCurve: [],
      realizedTurnoverPct: [],
      realizedSlippageBps: [],
      executionFailureCount: executionErrors,
      missedRebalanceCount: 0,
    });
    forwardMetrics = {
      available: true,
      monthsObserved: result.monthsObserved,
      cagrPct: result.cagrPct,
      maxDrawdownPct: result.maxDrawdownPct,
      excessReturnVsSpyPct: result.excessReturnVsSpyPct,
      disclaimer: result.disclaimer,
    };
  }

  return {
    strategyId: RS3M_CANDIDATE_V1.candidateId,
    strategyMetrics: {
      totalReturnPct: RS3M_FULL_HISTORY_METRICS.totalReturnPct,
      cagrPct: RS3M_FULL_HISTORY_METRICS.cagrPct,
      volatilityPct: RS3M_FULL_HISTORY_METRICS.volatilityPct,
      maxDrawdownPct: RS3M_FULL_HISTORY_METRICS.maxDrawdownPct,
      sharpe: RS3M_FULL_HISTORY_METRICS.sharpe,
      sortino: RS3M_FULL_HISTORY_METRICS.sortino,
      calmar: RS3M_FULL_HISTORY_METRICS.calmar,
      benchmarkReturnPct: RS3M_FULL_HISTORY_METRICS.benchmarkSpyCagrPct,
      excessReturnPct: RS3M_FULL_HISTORY_METRICS.excessReturnVsSpyCagrPct,
      sourceDoc: RS3M_FULL_HISTORY_METRICS.sourceDoc,
    },
    oosMetrics: {
      periodLabel: RS3M_OOS_LAST_25_MONTHS_METRICS.periodLabel,
      excessReturnVsSpyPct: RS3M_OOS_LAST_25_MONTHS_METRICS.excessReturnVsSpyPct,
      alphaAnnualizedPct: RS3M_OOS_LAST_25_MONTHS_METRICS.alphaAnnualizedPct,
      informationRatio: RS3M_OOS_LAST_25_MONTHS_METRICS.informationRatio,
      downsideCapturePct: RS3M_OOS_LAST_25_MONTHS_METRICS.downsideCapturePct,
      upsideCapturePct: RS3M_OOS_LAST_25_MONTHS_METRICS.upsideCapturePct,
      note: RS3M_OOS_LAST_25_MONTHS_METRICS.note,
      sourceDoc: RS3M_OOS_LAST_25_MONTHS_METRICS.sourceDoc,
    },
    executionMetrics: {
      ordersSubmitted: executedRows.reduce((sum, row) => sum + row.submittedOrders.length, 0),
      ordersRejected: 0,
      ordersPartialFill: ledger.filter((row) => row.anyOrderStillInFlight).length,
      executionErrors,
    },
    forwardMetrics,
    costRobustness: {
      referenceRebalanceCostBps: RS3M_COST_ROBUSTNESS.referenceRebalanceCostBps,
      breakEvenCostBps: RS3M_COST_ROBUSTNESS.breakEvenCostBps,
      sourceDoc: RS3M_COST_ROBUSTNESS.sourceDoc,
    },
    sourceOfTruth: {
      "historical metrics": RS3M_FULL_HISTORY_METRICS.sourceDoc,
      "OOS metrics": RS3M_OOS_LAST_25_MONTHS_METRICS.sourceDoc,
      "cost robustness": RS3M_COST_ROBUSTNESS.sourceDoc,
      "forward metrics": "results/block6/forward/ledger.jsonl via src/core/paper-trading/rs3m/forward-performance.ts (unmodified, Block 6)",
    },
  };
}
