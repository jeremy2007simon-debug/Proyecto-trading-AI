import { expect } from "vitest";
import type { Indicator } from "@/core/indicators/types";
import type { Candle } from "@/core/market-data/types";

/**
 * Structural anti-look-ahead-bias check: `compute(candles.slice(0, n))`
 * must equal the corresponding prefix of `compute(candles)` for every
 * `n` from `warmupPeriod` to `candles.length`. If a future candle ever
 * leaked backward into an earlier computed value, some prefix would
 * disagree with the full-series computation and this fails — this is
 * the structural proof of causality, independent of any specific
 * hand-computed number.
 */
export function assertPrefixStability<TValue>(
  indicator: Indicator<TValue>,
  candles: readonly Candle[],
): void {
  const full = indicator.compute(candles);
  for (let n = indicator.warmupPeriod; n <= candles.length; n++) {
    const prefixValues = indicator.compute(candles.slice(0, n));
    const expectedLength = n - indicator.warmupPeriod + 1;
    expect(prefixValues.length).toBe(expectedLength);
    expect(prefixValues).toEqual(full.slice(0, expectedLength));
  }
}
