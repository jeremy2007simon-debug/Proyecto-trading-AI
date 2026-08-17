/**
 * Returns the value `offset` bars before the most recent one (offset=0
 * is the current/last bar). `series` comes from `Indicator.compute(candles)`
 * called with the SAME `candles` array a strategy received — an
 * indicator's warmup period only ever trims values off the FRONT of the
 * series, never the back, so `series[series.length - 1]` is always the
 * value for `candles[candles.length - 1]` regardless of how much warmup
 * was consumed. Counting the offset back from the end (not by
 * timestamp) is therefore both simpler and just as look-ahead-safe.
 */
export function seriesValueAtOffset<T>(series: readonly T[], offset: number): T | undefined {
  const index = series.length - 1 - offset;
  return index >= 0 ? series[index] : undefined;
}
