import { buildRegimeSeries } from "@/core/us-index-research/regime";
import { toAdjustedCandles } from "@/core/us-index-research/daily-series";
import { computeCagrFromMonthlyReturns } from "@/core/backtesting/research/portfolio-metrics";
import type { UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";

/**
 * Block 8.3, Stage 9 (regime robustness), §24 of the brief. Reuses
 * `regime.ts`'s SAME causal LONG_TERM_TREND/VOL_REGIME classification
 * (built from SPY, the round's reference index) — never a second,
 * divergent regime definition. Buckets each MONTH by the regime reading
 * at that month's LAST trading day (the same causal, decided-at-close
 * convention every other module here uses) and reports annualized
 * return within each bucket.
 *
 * Rate-hiking/cutting and risk-on/risk-off regimes (also listed in §24)
 * are NOT computed here — no Fed funds rate or credit-spread/risk
 * sentiment data source was fetched this round (out of scope, disclosed
 * as a limitation in the report, never fabricated from price data
 * alone, which would not honestly represent "rate regime").
 */
export interface RegimeBucketBreakdown {
  regime: string;
  months: number;
  annualizedReturnPct: number | undefined;
}

export function buildMonthlyRegimeLabels(referenceBars: readonly UsIndexDailyBar[], referenceTicker: UsIndexMarket): Map<string, { bull: boolean; volRegime: "LOW_VOL" | "HIGH_VOL" }> {
  const candles = toAdjustedCandles(referenceBars, referenceTicker);
  const regime = buildRegimeSeries(candles);
  const byMonth = new Map<string, { bull: boolean; volRegime: "LOW_VOL" | "HIGH_VOL" }>();
  // candles are chronological — the LAST candle seen for a given month overwrites earlier ones, leaving month-end.
  for (const candle of candles) {
    const date = candle.timestamp.slice(0, 10);
    const reading = regime.byDate.get(date);
    if (!reading) continue;
    byMonth.set(date.slice(0, 7), { bull: reading.longTermTrendBullish, volRegime: reading.volRegime });
  }
  return byMonth;
}

export function computeRegimeBucketBreakdown(months: readonly string[], monthlyReturnsPct: readonly number[], monthlyRegimeLabels: ReadonlyMap<string, { bull: boolean; volRegime: "LOW_VOL" | "HIGH_VOL" }>): RegimeBucketBreakdown[] {
  const buckets: Record<string, number[]> = { BULL: [], BEAR: [], LOW_VOL: [], HIGH_VOL: [] };
  for (let i = 0; i < months.length; i++) {
    const label = monthlyRegimeLabels.get(months[i]);
    if (!label) continue;
    buckets[label.bull ? "BULL" : "BEAR"].push(monthlyReturnsPct[i]);
    buckets[label.volRegime].push(monthlyReturnsPct[i]);
  }
  return Object.entries(buckets).map(([regime, returns]) => ({
    regime,
    months: returns.length,
    annualizedReturnPct: returns.length > 0 ? computeCagrFromMonthlyReturns(returns) : undefined,
  }));
}

export function countPositiveUsIndexRegimes(breakdown: readonly RegimeBucketBreakdown[], minMonths = 6): number {
  return breakdown.filter((b) => b.months >= minMonths && (b.annualizedReturnPct ?? -1) > 0).length;
}
