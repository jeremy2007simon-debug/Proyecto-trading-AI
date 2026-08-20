import "server-only";

import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { computeForwardPerformance } from "@/core/paper-trading/rs3m/forward-performance";
import { normalizeToBase100 } from "@/novacore/risk-analytics/normalize-curve";
import { RS3M_COST_ROBUSTNESS, RS3M_FULL_HISTORY_METRICS, RS3M_OOS_LAST_25_MONTHS_METRICS } from "@/novacore/risk-analytics/adapters/rs3m-historical-metrics";
import type { RiskAnalyticsSnapshot } from "@/novacore/risk-analytics/types";
import { readForwardEvidenceLedger } from "../../../../scripts/block6/paper/forward-evidence-store";

/**
 * Block 7 / Observability Upgrade — RS3M Risk & Analytics adapter.
 * Historical/OOS figures are transcribed constants (see
 * `rs3m-historical-metrics.ts`'s doc comment). Forward figures are
 * computed with the EXISTING, unmodified `computeForwardPerformance`
 * (Block 6) applied to the real forward evidence ledger — never a new
 * metrics implementation.
 *
 * With fewer than `MIN_MONTHS_FOR_FORWARD_METRICS` EXECUTED months, this
 * reports `available: false` with an explicit `emptyStateMessage`
 * ("Forward comparison will begin after the first completed Paper
 * rebalance period.") rather than fabricating a curve. When forward data
 * DOES exist, the RS3M-vs-SPY normalized curve additionally needs SPY
 * closes aligned to each ledger row's date — fetched via the existing
 * Block 1-2 market-data provider (`createMarketDataProvider`, Market Data
 * API credentials, entirely separate from RS3M's Trading API
 * credentials). That fetch only ever runs when there's real forward
 * equity to compare against — never on an empty ledger.
 */

const MIN_MONTHS_FOR_FORWARD_METRICS = 1;
const EMPTY_STATE_MESSAGE = "Forward comparison will begin after the first completed Paper rebalance period.";

async function fetchSpyClosesForDates(dates: readonly string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (dates.length === 0) return result;

  const provider = createMarketDataProvider();
  if (!provider.ok) return result;

  const sorted = [...dates].sort();
  const from = new Date(sorted[0]);
  from.setUTCDate(from.getUTCDate() - 5); // small buffer so the earliest date has a candle on/before it
  const to = new Date(sorted[sorted.length - 1]);
  to.setUTCDate(to.getUTCDate() + 1);

  const candlesResult = await provider.value.getHistoricalCandles({ market: "SP500", timeframe: "1d", from: from.toISOString(), to: to.toISOString() });
  if (!candlesResult.ok) return result;

  const candles = [...candlesResult.value].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const dateStr of dates) {
    const targetMs = new Date(dateStr).getTime();
    // Nearest candle at or before the target date.
    let closest: number | undefined;
    for (const candle of candles) {
      if (new Date(candle.timestamp).getTime() <= targetMs) closest = candle.close;
      else break;
    }
    if (closest !== undefined) result.set(dateStr, closest);
  }
  return result;
}

export async function getRs3mRiskSnapshot(): Promise<RiskAnalyticsSnapshot> {
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
          : `Only ${monthsObserved} month(s) of forward evidence recorded — at least ${MIN_MONTHS_FOR_FORWARD_METRICS} are needed.`,
      emptyStateMessage: EMPTY_STATE_MESSAGE,
    };
  } else {
    const equityCurve = executedRows
      .filter((row) => row.decisionMonth !== undefined && row.accountEquityAfterUsd !== undefined)
      .map((row) => ({ month: row.decisionMonth as string, equity: row.accountEquityAfterUsd as number, timestamp: row.timestamp }));

    const spyCloses = await fetchSpyClosesForDates(equityCurve.map((p) => p.timestamp));
    const spyPoints = equityCurve.map((p) => spyCloses.get(p.timestamp)).filter((v): v is number => v !== undefined);
    const spyAligned = spyPoints.length === equityCurve.length ? equityCurve.map((p, i) => ({ month: p.month, equity: spyPoints[i] })) : [];

    const result = computeForwardPerformance({
      strategyEquityCurve: equityCurve.map((p) => ({ month: p.month, equity: p.equity })),
      benchmarkEquityCurve: spyAligned,
      equalWeightEquityCurve: [],
      realizedTurnoverPct: [],
      realizedSlippageBps: [],
      executionFailureCount: executionErrors,
      missedRebalanceCount: 0,
    });

    const monthlyReturns: { month: string; returnPct: number }[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const prev = equityCurve[i - 1].equity;
      if (prev > 0) monthlyReturns.push({ month: equityCurve[i].month, returnPct: ((equityCurve[i].equity - prev) / prev) * 100 });
    }
    const winningMonths = monthlyReturns.filter((m) => m.returnPct > 0).length;
    const losingMonths = monthlyReturns.filter((m) => m.returnPct < 0).length;

    const startingEquityUsd = equityCurve[0]?.equity;
    const currentEquityUsd = equityCurve.at(-1)?.equity;
    const totalReturnPct = startingEquityUsd !== undefined && currentEquityUsd !== undefined && startingEquityUsd > 0 ? ((currentEquityUsd - startingEquityUsd) / startingEquityUsd) * 100 : undefined;

    let peak = equityCurve[0]?.equity ?? 0;
    let currentDrawdownPct: number | undefined;
    for (const point of equityCurve) {
      peak = Math.max(peak, point.equity);
    }
    if (peak > 0 && currentEquityUsd !== undefined) currentDrawdownPct = ((peak - currentEquityUsd) / peak) * 100;

    forwardMetrics = {
      available: true,
      monthsObserved: result.monthsObserved,
      startingEquityUsd,
      currentEquityUsd,
      totalReturnPct,
      cagrPct: result.cagrPct,
      maxDrawdownPct: result.maxDrawdownPct,
      currentDrawdownPct,
      monthlyReturns,
      winningMonths,
      losingMonths,
      excessReturnVsSpyPct: spyAligned.length > 0 ? result.excessReturnVsSpyPct : undefined,
      normalizedCurve: {
        rs3m: normalizeToBase100(equityCurve.map((p) => ({ label: p.month, value: p.equity }))).map((p) => ({ label: p.label, value: p.value })),
        spy: spyAligned.length > 0 ? normalizeToBase100(spyAligned.map((p) => ({ label: p.month, value: p.equity }))).map((p) => ({ label: p.label, value: p.value })) : [],
      },
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
      "SPY forward benchmark": "Alpaca Market Data API (live, fetched only when forward evidence exists)",
    },
  };
}
