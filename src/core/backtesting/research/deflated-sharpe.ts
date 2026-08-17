/**
 * Block 5 — Data snooping control (Fase 11): Probabilistic Sharpe Ratio
 * (PSR) and Deflated Sharpe Ratio (DSR), per Bailey & López de Prado
 * (2014), "The Deflated Sharpe Ratio: Correcting for Selection Bias,
 * Backtest Overfitting and Non-Normality".
 *
 * IMPORTANT documented approximation: this system computes Sharpe/Sortino
 * per-trade (mean(R) / stdev(R) over the realized trade sequence, see
 * `metrics.ts`), not from a daily-return series — so `skewness`/`kurtosis`
 * here should be computed over the SAME per-trade R-multiple sequence for
 * internal consistency, not over daily returns. This is an approximation
 * of the classical (daily-return) PSR/DSR, disclosed explicitly wherever
 * these functions are used — never presented as the textbook figure.
 *
 * Applied ONLY to strategies that reach the deep-validation stages of the
 * funnel (Stage 6+), never to all 24 base configurations — computing it
 * for a strategy nobody would seriously consider a candidate is
 * decorative, not evidence.
 */

/** Abramowitz & Stegun 7.1.26 approximation, max absolute error ~1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF, Φ(x). */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * Inverse standard normal CDF (probit), Φ⁻¹(p) — Peter Acklam's rational
 * approximation, relative error < 1.15e-9 across (0,1). Needed for the
 * "expected maximum Sharpe ratio across N trials" term of the DSR.
 */
export function inverseNormalCdf(p: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -((((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1));
}

function mean(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** Population skewness (γ3). 0 for a degenerate (zero-variance) series rather than NaN. */
export function computeSkewness(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  if (stdev === 0) return 0;
  const m3 = values.reduce((s, v) => s + (v - m) ** 3, 0) / n;
  return m3 / stdev ** 3;
}

/** Population (non-excess) kurtosis (γ4) — a normal distribution has γ4=3, matching the PSR formula's convention. 3 for a degenerate (zero-variance) series rather than NaN. */
export function computeKurtosis(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 3;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / n;
  if (variance === 0) return 3;
  const m4 = values.reduce((s, v) => s + (v - m) ** 4, 0) / n;
  return m4 / variance ** 2;
}

export interface ProbabilisticSharpeInput {
  sharpe: number;
  /** Population skewness of the SAME return series the Sharpe was computed from. */
  skewness: number;
  /** Population (non-excess) kurtosis of the same series; 3 for a normal distribution. */
  kurtosis: number;
  numObservations: number;
  /** The Sharpe ratio being tested against (0 = "is the Sharpe distinguishable from zero"). For the Deflated Sharpe Ratio, pass the expected maximum Sharpe across N trials instead — see `expectedMaxSharpeUnderTrials`. */
  benchmarkSharpe?: number;
}

/**
 * Probability that the true Sharpe ratio exceeds `benchmarkSharpe`, given
 * the observed Sharpe, its higher moments, and the sample size. Returns
 * `undefined` (never a fabricated number) when there are fewer than 2
 * observations or the denominator is non-positive/non-finite (can happen
 * with extreme skew/kurtosis combinations at small sample sizes).
 */
export function probabilisticSharpeRatio(input: ProbabilisticSharpeInput): number | undefined {
  const { sharpe, skewness, kurtosis, numObservations, benchmarkSharpe = 0 } = input;
  if (numObservations < 2) return undefined;
  const denominator = Math.sqrt(1 - skewness * sharpe + ((kurtosis - 1) / 4) * sharpe ** 2);
  if (!(denominator > 0) || !Number.isFinite(denominator)) return undefined;
  const z = ((sharpe - benchmarkSharpe) * Math.sqrt(numObservations - 1)) / denominator;
  return normalCdf(z);
}

const EULER_MASCHERONI = 0.5772156649015329;

/**
 * Expected maximum Sharpe ratio one would observe across `numTrials`
 * independent configurations purely by chance, given the standard
 * deviation of Sharpe ratios actually observed across those trials
 * (Bailey & López de Prado's extreme-value-theory approximation). This is
 * the benchmark the Deflated Sharpe Ratio tests the best observed Sharpe
 * against — NOT a claim about the "true" number of independent strategies
 * ever conceivable, only about the configurations actually run (disclosed
 * as a limitation wherever DSR is reported).
 */
export function expectedMaxSharpeUnderTrials(numTrials: number, sharpeStdDevAcrossTrials: number): number {
  if (numTrials <= 1 || !(sharpeStdDevAcrossTrials > 0)) return 0;
  return (
    sharpeStdDevAcrossTrials *
    ((1 - EULER_MASCHERONI) * inverseNormalCdf(1 - 1 / numTrials) + EULER_MASCHERONI * inverseNormalCdf(1 - 1 / (numTrials * Math.E)))
  );
}

export interface DeflatedSharpeInput {
  sharpe: number;
  skewness: number;
  kurtosis: number;
  numObservations: number;
  /** Number of configurations actually tested for this strategy (across the funnel), NOT the universe of all possible strategies. */
  numTrials: number;
  /** Standard deviation of the Sharpe ratios observed across those `numTrials` configurations. */
  sharpeStdDevAcrossTrials: number;
}

/** DSR = PSR benchmarked against the expected maximum Sharpe across `numTrials` configurations instead of against 0 — the multiple-testing correction. */
export function deflatedSharpeRatio(input: DeflatedSharpeInput): number | undefined {
  const benchmarkSharpe = expectedMaxSharpeUnderTrials(input.numTrials, input.sharpeStdDevAcrossTrials);
  return probabilisticSharpeRatio({ ...input, benchmarkSharpe });
}
