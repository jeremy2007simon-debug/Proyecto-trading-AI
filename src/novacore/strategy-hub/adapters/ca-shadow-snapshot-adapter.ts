import "server-only";

import { CA_FORWARD_START_TIMESTAMP } from "@/core/ca-shadow/forward-start";
import { evaluateCaPromotionBar, type CaPromotionBarResult } from "@/core/ca-shadow/promotion-bar";
import { CA_FULL_HISTORY_METRICS, CA_OOS_METRICS, CA_COST_ROBUSTNESS, CA_RS3M_CORRELATION } from "@/novacore/risk-analytics/adapters/ca-historical-metrics";
import { readCaForwardLedger, readLastShadowState } from "../../../../scripts/block10/ca-shadow/evidence-store";

/**
 * Block 10 §5 — read-only snapshot backing the C-A detail page's SIGNAL,
 * SHADOW, and RISK tabs. Same discipline as `ca-adapter.ts`: reads ONLY
 * from the append-only evidence ledger (`evidence-store.ts`), never
 * fabricates a number when there is no evidence yet (`available: false`
 * states throughout), never annualizes a short sample (§16).
 */

export interface CaLatestSignal {
  evaluatedDate: string;
  percentileRank: number;
  percentileThreshold: number;
  decisionReturn: number;
  triggered: boolean;
  dataCutoff: string;
  dataSource: string;
}

export interface CaShadowSummary {
  forwardStartTimestamp: string;
  daysProcessed: number;
  trades: number;
  blockedDays: number;
  currentPosition: "FLAT" | "LONG";
  hypotheticalEquity: number;
  realizedShadowPnlPct: number;
  lastEventDate: string | undefined;
  lastFill?: { date: string; price: number; decision: "ENTER" | "EXIT"; costBps: number };
  spyBenchmarkReturnPct: number | undefined;
}

export interface CaRiskSummary {
  currentDrawdownPct: number | undefined;
  historicalMaxDrawdownPct: number;
  rollingOosPositivePct: number;
  walkForwardPositivePct: number;
  correlationVsRs3m: number;
  drawdownCorrelationVsRs3m: number;
}

export interface CaShadowSnapshot {
  hasForwardEvidence: boolean;
  latestSignal: CaLatestSignal | undefined;
  shadow: CaShadowSummary;
  risk: CaRiskSummary;
  promotionBar: CaPromotionBarResult;
}

export function getCaShadowSnapshot(): CaShadowSnapshot {
  const dailyEquityRows = readCaForwardLedger("daily-equity");
  const positionRows = readCaForwardLedger("positions");
  const lastState = readLastShadowState();
  const hasForwardEvidence = dailyEquityRows.length > 0;

  const lastRow = dailyEquityRows.at(-1);
  const latestSignal: CaLatestSignal | undefined =
    lastRow?.signal && lastRow.signal.sufficientHistory
      ? { evaluatedDate: lastRow.signal.decisionDate, percentileRank: lastRow.signal.percentileRank, percentileThreshold: lastRow.signal.percentileThreshold, decisionReturn: lastRow.signal.decisionReturn, triggered: lastRow.signal.triggered, dataCutoff: lastRow.dataCutoff, dataSource: lastRow.dataSource }
      : undefined;

  const lastFillRow = positionRows.at(-1);
  const lastFill = lastFillRow ? { date: lastFillRow.date, price: lastFillRow.hypotheticalFillPrice ?? 0, decision: lastFillRow.decision as "ENTER" | "EXIT", costBps: lastFillRow.costBps } : undefined;

  // Current drawdown: running peak of shadowEquityAfter across every processed (non-blocked) day.
  let peak = 1;
  let currentDrawdownPct: number | undefined;
  for (const row of dailyEquityRows) {
    if (row.decision === "BLOCKED") continue;
    peak = Math.max(peak, row.shadowEquityAfter);
    currentDrawdownPct = peak > 0 ? ((peak - row.shadowEquityAfter) / peak) * 100 : 0;
  }

  const firstBenchmarkClose = dailyEquityRows.find((r) => r.spyBenchmarkClose !== undefined)?.spyBenchmarkClose;
  const lastBenchmarkClose = [...dailyEquityRows].reverse().find((r) => r.spyBenchmarkClose !== undefined)?.spyBenchmarkClose;
  const spyBenchmarkReturnPct = firstBenchmarkClose && lastBenchmarkClose && firstBenchmarkClose > 0 ? ((lastBenchmarkClose - firstBenchmarkClose) / firstBenchmarkClose) * 100 : undefined;

  const promotionBar = evaluateCaPromotionBar({ dailyEquityRows, forwardStartTimestamp: CA_FORWARD_START_TIMESTAMP, nowIso: new Date().toISOString() });

  return {
    hasForwardEvidence,
    latestSignal,
    promotionBar,
    shadow: {
      forwardStartTimestamp: CA_FORWARD_START_TIMESTAMP,
      daysProcessed: dailyEquityRows.length,
      trades: dailyEquityRows.filter((r) => r.decision === "ENTER").length,
      blockedDays: dailyEquityRows.filter((r) => r.decision === "BLOCKED").length,
      currentPosition: lastState.position,
      hypotheticalEquity: lastState.shadowEquity,
      realizedShadowPnlPct: (lastState.shadowEquity - 1) * 100,
      lastEventDate: lastRow?.date,
      lastFill,
      spyBenchmarkReturnPct,
    },
    risk: {
      currentDrawdownPct,
      historicalMaxDrawdownPct: CA_FULL_HISTORY_METRICS.maxDrawdownPct,
      rollingOosPositivePct: CA_OOS_METRICS.rollingOosPositivePct,
      walkForwardPositivePct: CA_OOS_METRICS.walkForwardPositivePct,
      correlationVsRs3m: CA_RS3M_CORRELATION.returnCorrelation,
      drawdownCorrelationVsRs3m: CA_RS3M_CORRELATION.drawdownCorrelation,
    },
  };
}

export { CA_OOS_METRICS, CA_COST_ROBUSTNESS, CA_RS3M_CORRELATION };
