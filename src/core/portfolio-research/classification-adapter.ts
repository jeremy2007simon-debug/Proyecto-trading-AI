import type { SampleQualityLabel } from "@/core/backtesting/types";
import { buildBasketVolRegime } from "@/core/portfolio-research/regime";
import { computePortfolioMetrics } from "@/core/portfolio-research/portfolio-metrics";
import type { InstrumentReturnSeries } from "@/core/portfolio-research/leg-returns";
import type { PortfolioPeriodResult } from "@/core/portfolio-research/types";

/**
 * Sample-quality thresholds for a MONTHLY-rebalance portfolio strategy
 * — years of history, not trade count (Block 5/8's
 * `SampleQualityLabel` thresholds are trade-count-based, the wrong unit
 * here). A defensible research-phase convention, disclosed exactly like
 * the trade-count one it parallels: <3y INSUFFICIENT, 3-5.9y LOW,
 * 6-9.9y MEDIUM, 10y+ HIGH.
 */
export function monthlySampleQuality(numMonths: number): SampleQualityLabel {
  const years = numMonths / 12;
  if (years < 3) return "INSUFFICIENT";
  if (years < 6) return "LOW";
  if (years < 10) return "MEDIUM";
  return "HIGH";
}

/**
 * Stage 9 (regime robustness) — splits periods into HIGH/LOW realized-
 * volatility months (using the same `buildBasketVolRegime` the Family 3
 * risk filter itself uses) and reports NET annualized return within
 * each bucket, so "positiveRegimeCount" (fed into the reused
 * `classifyStrategy`) means something real: does the strategy make
 * money in BOTH calm and stressed regimes, one, or neither.
 */
export interface RegimeBreakdown {
  regime: "LOW_VOL" | "HIGH_VOL";
  months: number;
  annualizedReturn: number;
}

export function computeRegimeBreakdown(periods: readonly PortfolioPeriodResult[], majorReturnSeriesForRegime: readonly InstrumentReturnSeries[]): RegimeBreakdown[] {
  const regime = buildBasketVolRegime(majorReturnSeriesForRegime);
  const low: PortfolioPeriodResult[] = [];
  const high: PortfolioPeriodResult[] = [];
  for (const period of periods) {
    // Must key off `signalMonthEnd` (when the position was decided), NOT
    // `monthEnd` (when the return realized, ~1 month later) — using
    // `monthEnd` here was the same class of bug fixed in
    // `regime.ts`/`family-signals.ts` (see that file's `RegimeSeries`
    // docstring for the full story).
    const monthKey = period.signalMonthEnd.slice(0, 7);
    const entry = regime.byMonth.get(monthKey);
    const percentile = entry?.percentile ?? 50;
    (percentile >= 50 ? high : low).push(period);
  }
  return [
    { regime: "LOW_VOL", months: low.length, annualizedReturn: computePortfolioMetrics(low, "netReturn").annualizedReturn },
    { regime: "HIGH_VOL", months: high.length, annualizedReturn: computePortfolioMetrics(high, "netReturn").annualizedReturn },
  ];
}

export function countPositiveRegimes(breakdown: readonly RegimeBreakdown[], minMonths = 12): number {
  return breakdown.filter((b) => b.months >= minMonths && b.annualizedReturn > 0).length;
}
