import { computeAnnualizedVolatilityPct } from "@/core/backtesting/research/portfolio-metrics";
import { pearsonCorrelation } from "@/core/backtesting/research/strategy-similarity";
import type { RelativeStrengthPeriod } from "@/core/backtesting/research/relative-strength";

/**
 * Block 6, Fase 7 & 11 — relative-performance decomposition (alpha,
 * beta, tracking error, information ratio, capture ratios) and holding
 * behavior (time-in-asset, rotation frequency, streaks) for a monthly
 * rotation strategy. Pulled out of the Fase 5-11 analysis script into a
 * pure, tested module — this arithmetic (especially beta/alpha/capture)
 * is exactly the kind of thing worth a dedicated regression test rather
 * than trusting a one-off script by eye.
 */

function mean(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

const MIN_MEANINGFUL_VARIANCE = 1e-9;

export interface RelativePerformanceResult {
  monthsCompared: number;
  /** OLS slope of strategy monthly returns on benchmark monthly returns. `undefined` if the benchmark has ~zero variance. */
  beta: number | undefined;
  /** Descriptive single-factor alpha: mean(strategy) - beta*mean(benchmark) — NOT a full CAPM regression with a risk-free rate (documented simplification, consistent with this codebase's "interpretable over academic" convention). `undefined` when beta is undefined. */
  alphaMonthlyPct: number | undefined;
  alphaAnnualizedPct: number | undefined;
  trackingErrorAnnualizedPct: number;
  /** Annualized mean(excess)/stdev(excess). `undefined` with fewer than 2 months or ~zero excess-return variance. */
  informationRatio: number | undefined;
  /** Mean strategy return over benchmark-positive months, as % of mean benchmark return over those same months. `undefined` if there are no benchmark-positive months or their mean is ~zero. */
  upsideCapturePct: number | undefined;
  /** Same, over benchmark-negative months. `undefined` if there are no benchmark-negative months or their mean is ~zero. */
  downsideCapturePct: number | undefined;
  correlation: number | undefined;
  meanExcessMonthlyPct: number;
}

/**
 * Computes alpha/beta/tracking-error/information-ratio/capture-ratios of
 * `strategyMonthlyReturnsPct` against `benchmarkMonthlyReturnsPct`. Both
 * arrays must already be aligned to the SAME months in the SAME order —
 * this function does no month-matching itself (that's the caller's job,
 * since it depends on which benchmark series was built how). Uses only
 * `Math.min(a.length, b.length)` months if lengths differ, rather than
 * throwing, so a caller can pass slightly-mismatched trailing windows
 * without special-casing.
 */
export function computeRelativePerformance(strategyMonthlyReturnsPct: readonly number[], benchmarkMonthlyReturnsPct: readonly number[]): RelativePerformanceResult {
  const n = Math.min(strategyMonthlyReturnsPct.length, benchmarkMonthlyReturnsPct.length);
  const s = strategyMonthlyReturnsPct.slice(0, n);
  const b = benchmarkMonthlyReturnsPct.slice(0, n);
  const excess = s.map((r, i) => r - b[i]);

  const meanS = mean(s);
  const meanB = mean(b);
  const varB = n > 1 ? b.reduce((acc, r) => acc + (r - meanB) ** 2, 0) / (n - 1) : 0;
  const covSB = n > 1 ? s.reduce((acc, r, i) => acc + (r - meanS) * (b[i] - meanB), 0) / (n - 1) : 0;
  const beta = varB > MIN_MEANINGFUL_VARIANCE ? covSB / varB : undefined;
  const alphaMonthlyPct = beta !== undefined ? meanS - beta * meanB : undefined;

  const trackingErrorAnnualizedPct = computeAnnualizedVolatilityPct(excess);
  const meanExcessMonthly = mean(excess);
  const excessStdev = excess.length > 1 ? Math.sqrt(excess.reduce((acc, e) => acc + (e - meanExcessMonthly) ** 2, 0) / (excess.length - 1)) : 0;
  const informationRatio = excessStdev > MIN_MEANINGFUL_VARIANCE ? (meanExcessMonthly * 12) / (excessStdev * Math.sqrt(12)) : undefined;

  const upMonths = b.map((r, i) => (r > 0 ? { s: s[i], b: r } : undefined)).filter((x): x is { s: number; b: number } => x !== undefined);
  const downMonths = b.map((r, i) => (r < 0 ? { s: s[i], b: r } : undefined)).filter((x): x is { s: number; b: number } => x !== undefined);
  const meanUpB = mean(upMonths.map((m) => m.b));
  const meanDownB = mean(downMonths.map((m) => m.b));
  const upsideCapturePct = upMonths.length > 0 && Math.abs(meanUpB) > MIN_MEANINGFUL_VARIANCE ? (mean(upMonths.map((m) => m.s)) / meanUpB) * 100 : undefined;
  const downsideCapturePct = downMonths.length > 0 && Math.abs(meanDownB) > MIN_MEANINGFUL_VARIANCE ? (mean(downMonths.map((m) => m.s)) / meanDownB) * 100 : undefined;

  return {
    monthsCompared: n,
    beta,
    alphaMonthlyPct,
    alphaAnnualizedPct: alphaMonthlyPct !== undefined ? alphaMonthlyPct * 12 : undefined,
    trackingErrorAnnualizedPct,
    informationRatio,
    upsideCapturePct,
    downsideCapturePct,
    correlation: pearsonCorrelation(s, b),
    meanExcessMonthlyPct: meanExcessMonthly,
  };
}

export interface HoldingStreak {
  asset: string;
  lengthMonths: number;
}

export interface HoldingBehaviorResult {
  /** % of realized periods spent holding each asset (or "CASH" for periods with no eligible selection). */
  timeInAssetPct: Record<string, number>;
  totalSwitches: number;
  rotationFrequencyPctOfMonths: number;
  averageStreakLengthMonths: number;
  medianStreakLengthMonths: number;
  streaks: HoldingStreak[];
  /** Asset switches per calendar year (keyed by the switch's HOLD month's year), sorted ascending. */
  switchesByYear: Record<string, number>;
}

/** Analyzes which asset was held each period, how often the selection rotated, and the distribution of consecutive-month holding streaks. */
export function computeHoldingBehavior(periods: readonly RelativeStrengthPeriod[]): HoldingBehaviorResult {
  const timeInAsset = new Map<string, number>();
  const streaks: HoldingStreak[] = [];
  let currentAsset: string | undefined;
  let currentStreak = 0;
  let switches = 0;
  const byYear = new Map<string, number>();

  periods.forEach((p, i) => {
    const asset = p.selectedMarket ?? "CASH";
    timeInAsset.set(asset, (timeInAsset.get(asset) ?? 0) + 1);
    const isSwitch = i > 0 && p.selectedMarket !== periods[i - 1].selectedMarket;
    if (isSwitch) {
      switches += 1;
      const year = p.holdMonth.slice(0, 4);
      byYear.set(year, (byYear.get(year) ?? 0) + 1);
    }

    if (asset === currentAsset) {
      currentStreak += 1;
    } else {
      if (currentAsset !== undefined) streaks.push({ asset: currentAsset, lengthMonths: currentStreak });
      currentAsset = asset;
      currentStreak = 1;
    }
  });
  if (currentAsset !== undefined) streaks.push({ asset: currentAsset, lengthMonths: currentStreak });

  const streakLengths = streaks.map((s) => s.lengthMonths).sort((a, b) => a - b);
  const median = streakLengths.length > 0 ? streakLengths[Math.floor(streakLengths.length / 2)] : 0;

  return {
    timeInAssetPct: Object.fromEntries([...timeInAsset.entries()].map(([asset, count]) => [asset, periods.length > 0 ? (count / periods.length) * 100 : 0])),
    totalSwitches: switches,
    rotationFrequencyPctOfMonths: periods.length > 0 ? (switches / periods.length) * 100 : 0,
    averageStreakLengthMonths: mean(streakLengths),
    medianStreakLengthMonths: median,
    streaks,
    switchesByYear: Object.fromEntries([...byYear.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}
