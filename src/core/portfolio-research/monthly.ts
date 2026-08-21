import type { DailyBar, FxInstrument, MonthlyPricePoint, MonthlySeries } from "@/core/portfolio-research/types";

const TRADING_DAYS_PER_YEAR = 252;

function monthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

/**
 * Resamples daily bars to one point per calendar month: the LAST daily
 * bar strictly within that month (never a bar from the following
 * month) — this is what makes every downstream monthly signal causal.
 * Also attaches each month-end's trailing annualized volatility,
 * computed from daily log-returns over the `lookbackDays` window ending
 * at (and including) that month-end bar — never using any bar after it.
 */
export function resampleToMonthly(instrument: FxInstrument, bars: readonly DailyBar[], lookbackDays = 63): MonthlySeries {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const points: MonthlyPricePoint[] = [];

  let currentMonth: string | undefined;
  let lastIndexOfMonth = -1;
  for (let i = 0; i < sorted.length; i++) {
    const mk = monthKey(sorted[i].date);
    if (mk !== currentMonth) {
      if (currentMonth !== undefined) {
        points.push(buildPoint(sorted, lastIndexOfMonth, lookbackDays));
      }
      currentMonth = mk;
    }
    lastIndexOfMonth = i;
  }
  if (currentMonth !== undefined && lastIndexOfMonth >= 0) {
    points.push(buildPoint(sorted, lastIndexOfMonth, lookbackDays));
  }

  return { instrument, points };
}

function buildPoint(sorted: readonly DailyBar[], monthEndIndex: number, lookbackDays: number): MonthlyPricePoint {
  const bar = sorted[monthEndIndex];
  const windowStart = Math.max(0, monthEndIndex - lookbackDays);
  const window = sorted.slice(windowStart, monthEndIndex + 1);
  const trailingAnnualizedVol = window.length >= 10 ? computeAnnualizedVol(window) : undefined;
  return { monthEnd: bar.date, close: bar.close, trailingAnnualizedVol };
}

function computeAnnualizedVol(window: readonly DailyBar[]): number {
  const logReturns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1].close > 0 && window[i].close > 0) {
      logReturns.push(Math.log(window[i].close / window[i - 1].close));
    }
  }
  if (logReturns.length < 2) return 0;
  const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
  const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Simple monthly log-return between two consecutive (or any two) MonthlyPricePoints. */
export function monthlyReturn(from: MonthlyPricePoint, to: MonthlyPricePoint): number {
  return from.close > 0 ? to.close / from.close - 1 : 0;
}

/**
 * Causal rolling percentile: the rank (0-100) of `values[i]` within
 * `values[max(0,i-window+1) .. i]` — only ever looks backward from `i`,
 * same convention as `src/core/indicators/rolling-percentile.ts` (Block
 * 4.5/5), reimplemented here rather than imported to keep this module's
 * zero-dependency-on-the-intraday-engine property (see this module's
 * own top-level docstring in `types.ts`).
 */
export function causalRollingPercentile(values: readonly number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const current = values[i];
    const countBelow = slice.filter((v) => v < current).length;
    const countEqual = slice.filter((v) => v === current).length;
    result.push(((countBelow + countEqual / 2) / slice.length) * 100);
  }
  return result;
}
