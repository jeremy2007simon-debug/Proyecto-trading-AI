import { causalRollingPercentile } from "@/core/portfolio-research/monthly";
import type { InstrumentReturnSeries } from "@/core/portfolio-research/leg-returns";

/**
 * Block 8.2, Family 3 — the RiskRegimeFilter. Two independent,
 * pre-registered definitions (never chosen after seeing which one
 * "worked" — see the two separate experimentIds F3-B/C/D vs F3-F in
 * the funnel runner):
 *
 *  1. BASKET_VOL: trailing realized volatility of an equal-weight
 *     basket of the 7 majors, ranked against its own trailing 36-month
 *     history (causal rolling percentile). High percentile = stress.
 *  2. AUDJPY_MOMENTUM: AUD/JPY's own trailing 3-month return — a
 *     classic risk-sentiment proxy (AUD/JPY selling off is a canonical
 *     risk-off signal) requiring no extra data beyond what's already
 *     fetched.
 *
 * Both are computed ENTIRELY from trailing (already-realized) price
 * data — no external VIX/credit-spread series was fetched for this,
 * consistent with the data audit (§3) not claiming access to data this
 * environment cannot verify.
 */

export interface RegimeSeries {
  /**
   * Keyed by the calendar-month (YYYY-MM) of `signalMonthEnd` — the
   * SAME key convention `alignReturnsByMonth` (`alignment.ts`) uses for
   * `AlignedReturns.monthKeys`, which is what every caller looks this
   * map up by. Keying by `monthEnd` (the return's REALIZATION date,
   * ~1 month later) here was a real bug caught during Block 8.2's own
   * review: it silently made every regime lookup miss, so the
   * HARD_EXIT/SOFT_SCALE filters had zero effect versus the unfiltered
   * baseline — see the funnel's F3-A vs F3-B/C/D results before this
   * fix (identical to 3 decimals) for the symptom this caused.
   */
  byMonth: Map<string, { value: number; percentile: number }>;
}

const REGIME_BASELINE_WINDOW_MONTHS = 36;

function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function buildBasketVolRegime(majorSeries: readonly InstrumentReturnSeries[]): RegimeSeries {
  const signalMonths = majorSeries[0]?.returns.map((r) => r.signalMonthEnd) ?? [];
  const basketVolByMonth: number[] = signalMonths.map((_, i) => {
    const vols = majorSeries.map((s) => s.returns[i]?.trailingAnnualizedVol).filter((v): v is number => v !== undefined);
    return vols.length > 0 ? vols.reduce((s, v) => s + v, 0) / vols.length : 0;
  });
  const percentiles = causalRollingPercentile(basketVolByMonth, REGIME_BASELINE_WINDOW_MONTHS);

  const byMonth = new Map<string, { value: number; percentile: number }>();
  signalMonths.forEach((m, i) => byMonth.set(monthKey(m), { value: basketVolByMonth[i], percentile: percentiles[i] }));
  return { byMonth };
}

export function buildAudJpyMomentumRegime(audJpySeries: InstrumentReturnSeries, trailingMonths = 3): RegimeSeries {
  const values: number[] = [];
  const signalMonths: string[] = [];
  for (let i = 0; i < audJpySeries.returns.length; i++) {
    // STRICTLY BEFORE index i: `returns[i].value` is the return realized
    // FROM `returns[i].signalMonthEnd` (this exact signal date) TO
    // `returns[i].monthEnd` (one month later) — including it here would
    // mean "the regime as of this signal date" secretly depends on a
    // return that hasn't happened yet as of that date. This exact
    // off-by-one was caught during Block 8.2's own review (F3-F showed
    // an implausibly large jump vs the BASKET_VOL-filtered variants
    // before this fix — see git history for the before/after numbers).
    const window = audJpySeries.returns.slice(Math.max(0, i - trailingMonths), i);
    const cumulative = window.reduce((acc, r) => acc * (1 + r.value), 1) - 1;
    values.push(cumulative);
    signalMonths.push(audJpySeries.returns[i].signalMonthEnd);
  }
  // A NEGATIVE AUD/JPY trend is the stress signal — invert so higher
  // percentile always means "more stressed," matching BASKET_VOL's
  // convention (both filters expose the same interpretation to the
  // strategy code that consumes them).
  const inverted = values.map((v) => -v);
  const percentiles = causalRollingPercentile(inverted, REGIME_BASELINE_WINDOW_MONTHS);

  const byMonth = new Map<string, { value: number; percentile: number }>();
  signalMonths.forEach((m, i) => byMonth.set(monthKey(m), { value: values[i], percentile: percentiles[i] }));
  return { byMonth };
}

export type RegimeFilterMode = "NONE" | "HARD_EXIT" | "SOFT_SCALE";

/** Position scaling factor [0,1] given the current regime percentile and the filter's configuration. */
export function regimeScaleFactor(percentile: number, mode: RegimeFilterMode, exitThresholdPercentile: number): number {
  if (mode === "NONE") return 1;
  if (percentile < exitThresholdPercentile) return 1;
  if (mode === "HARD_EXIT") return 0;
  // SOFT_SCALE: linearly de-risk from 1x at the threshold to 0.5x at 100th percentile — a de-risk, not a full unwind, so the carry premium is only partially forfeited during stress, per this family's own hypothesis (§8: crash risk exists, but hard-exiting is not assumed to be free either).
  const span = 100 - exitThresholdPercentile;
  const excess = percentile - exitThresholdPercentile;
  return span > 0 ? 1 - 0.5 * (excess / span) : 0.5;
}
