import type { Candle } from "@/core/market-data/types";
import type { Indicator } from "@/core/indicators/types";

export interface RollingPercentileValue {
  timestamp: string;
  /** 0-100 rank of the current bar's value within the trailing window. */
  percentile: number;
  /** The underlying source value at this point (for debugging/display). */
  sourceValue: number;
}

/**
 * Two values are treated as tied if they differ by less than this
 * fraction of their own magnitude (floored at a magnitude of 1). A
 * literal `===` comparison would treat two values that are equal "in
 * every way that matters" (e.g. a genuinely flat market's realized
 * volatility, which floating-point arithmetic can perturb by ~1e-16)
 * as strictly ordered, turning meaningless rounding noise into an
 * arbitrary, unstable percentile rank.
 */
const RELATIVE_TIE_EPSILON = 1e-9;

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= RELATIVE_TIE_EPSILON * Math.max(Math.abs(a), Math.abs(b), 1);
}

/**
 * Wraps any numeric `Indicator<T>` and produces, for each bar, the
 * percentile rank (0-100) of that bar's value within a trailing window
 * of `window` values ending at — and including — the current bar. This
 * is the same trailing-inclusive-of-current convention every other
 * indicator in this codebase uses (SMA/EMA/ATR/RSI all include the
 * current bar in their window), so it never reads a future index and
 * needs no new convention.
 *
 * This exists specifically to replace a whole-series `median()` baseline
 * (which made a classification depend on how much history the caller
 * happened to request) with a proper rolling baseline: the percentile at
 * bar `i` only ever depends on `source[i-window+1..i]`, so requesting
 * more history than the warmup + window requires never changes the
 * classification of the most recent bar.
 *
 * `warmupPeriod = source.warmupPeriod + window - 1`: the source series
 * itself must be warmed up, and then `window` source values must exist
 * before the first percentile can be computed.
 */
export function createRollingPercentile<TValue extends { timestamp: string }>(
  source: Indicator<TValue>,
  extractValue: (value: TValue) => number,
  window: number,
): Indicator<RollingPercentileValue> {
  return {
    id: `${source.id}_pctile${window}`,
    name: `${source.name} Percentile(${window})`,
    warmupPeriod: source.warmupPeriod + window - 1,

    compute(candles: readonly Candle[]): RollingPercentileValue[] {
      const sourceSeries = source.compute(candles);
      if (sourceSeries.length < window) return [];

      const values: RollingPercentileValue[] = [];
      for (let i = window - 1; i < sourceSeries.length; i++) {
        const windowValues = sourceSeries.slice(i - window + 1, i + 1).map(extractValue);
        const current = extractValue(sourceSeries[i]);
        // Mid-rank convention: ties count as half a rank each, not a full
        // one. Without this, a window with many repeated/near-identical
        // values (e.g. a perfectly flat market) would push every value to
        // the 100th percentile purely from counting ties as "<=" — a
        // degenerate result for a genuinely flat/unremarkable series.
        const countBelow = windowValues.filter(
          (v) => v < current && !approximatelyEqual(v, current),
        ).length;
        const countEqual = windowValues.filter((v) => approximatelyEqual(v, current)).length;
        const percentile = ((countBelow + countEqual / 2) / windowValues.length) * 100;
        values.push({
          timestamp: sourceSeries[i].timestamp,
          percentile,
          sourceValue: current,
        });
      }
      return values;
    },
  };
}
