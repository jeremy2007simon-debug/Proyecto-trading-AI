/**
 * Block 6 — reusable portfolio-level statistics over a MONTHLY return
 * series (fractions expressed as percentages, e.g. `2.5` for +2.5%).
 * Used across Fase 5-11 (benchmark audit, OOS analysis, relative
 * performance, regime analysis) — one tested implementation instead of
 * repeating these formulas in every analysis script.
 *
 * IMPORTANT — distinct convention from `relative-strength.ts`'s own
 * `sharpeRatio` field: that one is deliberately monthly and UNANNUALIZED
 * (documented there as the same simplified-ratio convention `metrics.ts`
 * uses for per-trade Sharpe). The Sharpe/Sortino computed HERE are
 * ANNUALIZED (multiplied through by the standard sqrt(12)/12 monthly
 * scaling), because Block 6 Fase 6/7 explicitly need standard,
 * benchmark-comparable annualized figures. Never mix the two without
 * saying which convention a number uses.
 */

function mean(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

/** Downside deviation against a 0% monthly minimum acceptable return — population of BELOW-MAR observations only, same convention `metrics.ts` uses for Sortino. */
function downsideDeviation(monthlyReturnsPct: readonly number[]): number {
  const downside = monthlyReturnsPct.filter((r) => r < 0);
  return stdev(downside);
}

/** Compounds a monthly return series (%) into a max-drawdown %, starting from equity=1. */
export function computeMaxDrawdownFromMonthlyReturns(monthlyReturnsPct: readonly number[]): number {
  let equity = 1;
  let peak = 1;
  let maxDrawdownPct = 0;
  for (const r of monthlyReturnsPct) {
    equity *= 1 + r / 100;
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
  }
  return maxDrawdownPct;
}

export function computeTotalReturnPct(monthlyReturnsPct: readonly number[]): number {
  const terminalEquity = monthlyReturnsPct.reduce((equity, r) => equity * (1 + r / 100), 1);
  return (terminalEquity - 1) * 100;
}

/** CAGR from a monthly return series — `undefined` (never fabricated) with zero months. */
export function computeCagrFromMonthlyReturns(monthlyReturnsPct: readonly number[]): number | undefined {
  if (monthlyReturnsPct.length === 0) return undefined;
  const terminalEquity = monthlyReturnsPct.reduce((equity, r) => equity * (1 + r / 100), 1);
  return (terminalEquity ** (12 / monthlyReturnsPct.length) - 1) * 100;
}

/** Annualized volatility: monthly stdev scaled by sqrt(12) — the standard convention. */
export function computeAnnualizedVolatilityPct(monthlyReturnsPct: readonly number[]): number {
  return stdev(monthlyReturnsPct) * Math.sqrt(12);
}

const MIN_MEANINGFUL_STDEV = 1e-9;

/** Annualized Sharpe (rf=0). `undefined` with fewer than 2 months or ~zero variance — never a fabricated extreme value (same guard convention as `metrics.ts`'s Sortino fix). */
export function computeAnnualizedSharpeRatio(monthlyReturnsPct: readonly number[]): number | undefined {
  if (monthlyReturnsPct.length < 2) return undefined;
  const monthlyStdev = stdev(monthlyReturnsPct);
  if (monthlyStdev <= MIN_MEANINGFUL_STDEV) return undefined;
  return (mean(monthlyReturnsPct) * 12) / (monthlyStdev * Math.sqrt(12));
}

/** Annualized Sortino (rf=0, MAR=0). `undefined` with fewer than 2 months, no downside months, or ~zero downside variance. */
export function computeAnnualizedSortinoRatio(monthlyReturnsPct: readonly number[]): number | undefined {
  if (monthlyReturnsPct.length < 2) return undefined;
  const downsideStdev = downsideDeviation(monthlyReturnsPct);
  if (!(downsideStdev > MIN_MEANINGFUL_STDEV)) return undefined;
  return (mean(monthlyReturnsPct) * 12) / (downsideStdev * Math.sqrt(12));
}

/** CAGR / |MaxDD|. `undefined` when CAGR is unavailable or MaxDD is ~zero (division would be meaningless, not "infinitely good"). */
export function computeCalmarRatio(cagrPct: number | undefined, maxDrawdownPct: number): number | undefined {
  if (cagrPct === undefined || maxDrawdownPct <= MIN_MEANINGFUL_STDEV) return undefined;
  return cagrPct / maxDrawdownPct;
}

export interface MonthlyReturnMetrics {
  monthsCount: number;
  totalReturnPct: number;
  cagrPct: number | undefined;
  annualizedVolatilityPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | undefined;
  sortinoRatio: number | undefined;
  calmarRatio: number | undefined;
}

export function computeMonthlyReturnMetrics(monthlyReturnsPct: readonly number[]): MonthlyReturnMetrics {
  const cagrPct = computeCagrFromMonthlyReturns(monthlyReturnsPct);
  const maxDrawdownPct = computeMaxDrawdownFromMonthlyReturns(monthlyReturnsPct);
  return {
    monthsCount: monthlyReturnsPct.length,
    totalReturnPct: computeTotalReturnPct(monthlyReturnsPct),
    cagrPct,
    annualizedVolatilityPct: computeAnnualizedVolatilityPct(monthlyReturnsPct),
    maxDrawdownPct,
    sharpeRatio: computeAnnualizedSharpeRatio(monthlyReturnsPct),
    sortinoRatio: computeAnnualizedSortinoRatio(monthlyReturnsPct),
    calmarRatio: computeCalmarRatio(cagrPct, maxDrawdownPct),
  };
}
