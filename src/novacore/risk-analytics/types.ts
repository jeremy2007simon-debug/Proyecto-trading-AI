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
        cagrPct: number | undefined;
        maxDrawdownPct: number;
        excessReturnVsSpyPct: number | undefined;
        disclaimer: string;
      }
    | {
        available: false;
        monthsObserved: number;
        reason: string;
      };

  costRobustness: {
    referenceRebalanceCostBps: number;
    breakEvenCostBps: number;
    sourceDoc: string;
  };

  sourceOfTruth: Record<string, string>;
}
