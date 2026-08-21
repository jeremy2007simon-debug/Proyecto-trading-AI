import { computeKurtosis, computeSkewness } from "@/core/backtesting/research/deflated-sharpe";
import type { PortfolioPeriodResult } from "@/core/portfolio-research/types";

/**
 * Reuses `computeSkewness`/`computeKurtosis` from Block 5's
 * `deflated-sharpe.ts` UNCHANGED — both are pure functions of
 * `readonly number[]`, already asset/shape-agnostic, so no adaptation
 * was needed to apply them to a monthly portfolio-return series instead
 * of a per-trade R-multiple series.
 */

export interface PortfolioMetrics {
  numPeriods: number;
  numYears: number;
  meanMonthlyReturn: number;
  annualizedReturn: number;
  annualizedVol: number;
  sharpeRatio: number | undefined;
  sortinoRatio: number | undefined;
  maxDrawdownPct: number;
  worstMonth: number;
  bestMonth: number;
  skewness: number;
  kurtosis: number;
  positiveMonthsPct: number;
  averageTurnover: number;
  averageCostDragAnnualized: number;
}

export function computePortfolioMetrics(periods: readonly PortfolioPeriodResult[], returnField: "grossReturn" | "netReturn" = "netReturn"): PortfolioMetrics {
  const returns = periods.map((p) => p[returnField]);
  const n = returns.length;
  if (n === 0) {
    return {
      numPeriods: 0,
      numYears: 0,
      meanMonthlyReturn: 0,
      annualizedReturn: 0,
      annualizedVol: 0,
      sharpeRatio: undefined,
      sortinoRatio: undefined,
      maxDrawdownPct: 0,
      worstMonth: 0,
      bestMonth: 0,
      skewness: 0,
      kurtosis: 3,
      positiveMonthsPct: 0,
      averageTurnover: 0,
      averageCostDragAnnualized: 0,
    };
  }

  const mean = returns.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const monthlyVol = Math.sqrt(variance);
  const annualizedVol = monthlyVol * Math.sqrt(12);
  const annualizedReturn = (1 + mean) ** 12 - 1;
  const sharpeRatio = monthlyVol > 0 ? (mean / monthlyVol) * Math.sqrt(12) : undefined;

  const downside = returns.filter((r) => r < 0);
  const downsideVariance = downside.length > 0 ? downside.reduce((s, v) => s + v ** 2, 0) / downside.length : 0;
  const downsideVol = Math.sqrt(downsideVariance) * Math.sqrt(12);
  const sortinoRatio = downsideVol > 0 ? annualizedReturn / downsideVol : undefined;

  let equity = 1;
  let peak = 1;
  let maxDrawdownPct = 0;
  for (const r of returns) {
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
  }

  const turnovers = periods.map((p) => p.turnover);
  const costDrags = periods.map((p) => p.costDrag);

  return {
    numPeriods: n,
    numYears: n / 12,
    meanMonthlyReturn: mean,
    annualizedReturn,
    annualizedVol,
    sharpeRatio,
    sortinoRatio,
    maxDrawdownPct,
    worstMonth: Math.min(...returns),
    bestMonth: Math.max(...returns),
    skewness: computeSkewness(returns),
    kurtosis: computeKurtosis(returns),
    positiveMonthsPct: (returns.filter((r) => r > 0).length / n) * 100,
    averageTurnover: turnovers.reduce((s, v) => s + v, 0) / n,
    averageCostDragAnnualized: (costDrags.reduce((s, v) => s + v, 0) / n) * 12,
  };
}
