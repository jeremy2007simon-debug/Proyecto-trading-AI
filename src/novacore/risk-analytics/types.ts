/**
 * Block 7, section 9 — Risk & Performance Engine aggregation shape.
 * Strategy / execution / forward metrics, each explicitly sourced.
 * NovaCore never recomputes a number a reliable source already publishes
 * (see each adapter's doc comment for exactly which report/store each
 * field is transcribed or derived from).
 */
export interface RiskAnalyticsSnapshot {
  strategyId: string;

  strategyMetrics: {
    totalReturnPct: number;
    cagrPct: number;
    volatilityPct: number;
    maxDrawdownPct: number;
    sharpe: number;
    sortino: number;
    calmar: number;
    benchmarkReturnPct: number;
    excessReturnPct: number;
    sourceDoc: string;
  };

  oosMetrics: {
    periodLabel: string;
    excessReturnVsSpyPct: number;
    alphaAnnualizedPct: number;
    informationRatio: number;
    downsideCapturePct: number;
    upsideCapturePct: number;
    note: string;
    sourceDoc: string;
  };

  executionMetrics: {
    ordersSubmitted: number;
    ordersRejected: number;
    ordersPartialFill: number;
    executionErrors: number;
  };

  forwardMetrics:
    | {
        available: true;
        monthsObserved: number;
        startingEquityUsd: number | undefined;
        currentEquityUsd: number | undefined;
        totalReturnPct: number | undefined;
        cagrPct: number | undefined;
        maxDrawdownPct: number;
        currentDrawdownPct: number | undefined;
        monthlyReturns: { month: string; returnPct: number }[];
        winningMonths: number;
        losingMonths: number;
        excessReturnVsSpyPct: number | undefined;
        /** Both normalized so the first observed point = 100 — comparable regardless of starting notional. Empty when the SPY benchmark leg couldn't be fetched (still shows the RS3M curve alone). */
        normalizedCurve: { rs3m: { label: string; value: number }[]; spy: { label: string; value: number }[] };
        disclaimer: string;
      }
    | {
        available: false;
        monthsObserved: number;
        reason: string;
        emptyStateMessage: string;
      };

  costRobustness: {
    referenceRebalanceCostBps: number;
    breakEvenCostBps: number;
    sourceDoc: string;
  };

  sourceOfTruth: Record<string, string>;
}
