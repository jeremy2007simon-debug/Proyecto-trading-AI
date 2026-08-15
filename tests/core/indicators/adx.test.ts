import { describe, expect, it } from "vitest";
import { createAdx } from "@/core/indicators/adx";
import { buildCandles } from "./fixtures";
import { assertPrefixStability } from "./prefix-stability.helper";

describe("createAdx", () => {
  // A clean, uninterrupted uptrend: high/low shift up by 2 every bar,
  // giving a constant +DM=2, -DM=0 -> DX=100 throughout, so ADX
  // converges to (and stays at) exactly 100. Hand-verifiable and free
  // of noisy edge cases.
  const candles = buildCandles([
    { high: 10, low: 8, close: 9 },
    { high: 12, low: 10, close: 11 },
    { high: 14, low: 12, close: 13 },
    { high: 16, low: 14, close: 15 },
    { high: 18, low: 16, close: 17 },
    { high: 20, low: 18, close: 19 },
  ]);
  const adx2 = createAdx(2);

  it("produces no value before the warmup period (2 * period)", () => {
    expect(adx2.compute(candles.slice(0, 3))).toEqual([]);
  });

  it("matches a hand-computed ADX(2) series for a pure, noise-free uptrend", () => {
    const values = adx2.compute(candles);
    expect(values).toHaveLength(3);
    for (const v of values) {
      expect(v.adx).toBeCloseTo(100, 4);
      expect(v.plusDI).toBeCloseTo(200 / 3, 4);
      expect(v.minusDI).toBeCloseTo(0, 6);
    }
  });

  it("is prefix-stable (no look-ahead)", () => {
    assertPrefixStability(adx2, candles);
  });
});
