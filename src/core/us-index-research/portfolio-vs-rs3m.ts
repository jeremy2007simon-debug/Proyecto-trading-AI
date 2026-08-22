import { pearsonCorrelation } from "@/core/backtesting/research/strategy-similarity";
import { computeMaxDrawdownFromMonthlyReturns, computeMonthlyReturnMetrics } from "@/core/backtesting/research/portfolio-metrics";

/**
 * Block 8.3, §21/§22 of the brief — correlation-vs-RS3M classification
 * and (only if >=1 candidate survives) an RS3M+candidate combined
 * portfolio simulation. Every function here is a pure function of two
 * ALREADY-COMPUTED monthly return series — never re-derives RS3M's
 * signal itself (that happens once, in `rs3m-benchmark.ts`, reusing
 * RS3M's own engine read-only).
 */
export type DiversificationValue = "HIGH" | "MEDIUM" | "LOW";

export interface CorrelationVsRs3mResult {
  monthsCompared: number;
  returnCorrelation: number | undefined;
  diversificationValue: DiversificationValue;
}

/** §21: HIGH diversification value = |correlation| < 0.3, MEDIUM = 0.3-0.6, LOW = >0.6 (or undefined, treated conservatively as LOW — "we can't confirm it's a diversifier" is not the same as "it is one"). Thresholds are a documented, disclosed convention, not derived from a formula. */
export function classifyCorrelationVsRs3m(candidateMonthlyReturnsPct: readonly number[], rs3mMonthlyReturnsPct: readonly number[]): CorrelationVsRs3mResult {
  const n = Math.min(candidateMonthlyReturnsPct.length, rs3mMonthlyReturnsPct.length);
  const correlation = pearsonCorrelation(candidateMonthlyReturnsPct.slice(0, n), rs3mMonthlyReturnsPct.slice(0, n));
  const absCorr = correlation !== undefined ? Math.abs(correlation) : undefined;
  const diversificationValue: DiversificationValue = absCorr === undefined ? "LOW" : absCorr < 0.3 ? "HIGH" : absCorr < 0.6 ? "MEDIUM" : "LOW";
  return { monthsCompared: n, returnCorrelation: correlation, diversificationValue };
}

export interface CombinedPortfolioResult {
  monthsCompared: number;
  rs3mOnly: ReturnType<typeof computeMonthlyReturnMetrics>;
  combined: ReturnType<typeof computeMonthlyReturnMetrics>;
  correlation: number | undefined;
  /** combined Sharpe - RS3M-alone Sharpe. Positive = the candidate improved the portfolio; `undefined` if either Sharpe is undefined. */
  sharpeImprovement: number | undefined;
}

/**
 * §22 — equal-risk-ish 50/50 monthly-rebalanced blend of RS3M's own
 * return series and a candidate's, over the months both have data for.
 * NO weight optimization — a fixed 50/50 split, decided before looking
 * at whether it helps, per the brief's explicit "NO optimizar pesos
 * retrospectivamente" instruction. Only ever called for a family that
 * has ALREADY reached CANDIDATE — never for a REJECTED/RESEARCH result.
 */
export function simulateRs3mPlusCandidatePortfolio(rs3mMonthlyReturnsPct: readonly number[], candidateMonthlyReturnsPct: readonly number[]): CombinedPortfolioResult {
  const n = Math.min(rs3mMonthlyReturnsPct.length, candidateMonthlyReturnsPct.length);
  const rs3m = rs3mMonthlyReturnsPct.slice(0, n);
  const candidate = candidateMonthlyReturnsPct.slice(0, n);
  const combinedReturns = rs3m.map((r, i) => 0.5 * r + 0.5 * candidate[i]);

  const rs3mMetrics = computeMonthlyReturnMetrics(rs3m);
  const combinedMetrics = computeMonthlyReturnMetrics(combinedReturns);

  return {
    monthsCompared: n,
    rs3mOnly: rs3mMetrics,
    combined: combinedMetrics,
    correlation: pearsonCorrelation(rs3m, candidate),
    sharpeImprovement: combinedMetrics.sharpeRatio !== undefined && rs3mMetrics.sharpeRatio !== undefined ? combinedMetrics.sharpeRatio - rs3mMetrics.sharpeRatio : undefined,
  };
}

export { computeMaxDrawdownFromMonthlyReturns };
