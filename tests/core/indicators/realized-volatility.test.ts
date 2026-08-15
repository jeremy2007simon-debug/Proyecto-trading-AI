import { describe, expect, it } from "vitest";
import { createRealizedVolatility } from "@/core/indicators/realized-volatility";
import { buildCandles } from "./fixtures";
import { assertPrefixStability } from "./prefix-stability.helper";

describe("createRealizedVolatility", () => {
  const candles = buildCandles([{ close: 100 }, { close: 110 }, { close: 100 }, { close: 110 }]);
  const rvol2 = createRealizedVolatility(2);

  it("produces no value before the warmup period (period + 1)", () => {
    expect(rvol2.compute(candles.slice(0, 2))).toEqual([]);
  });

  it("matches a hand-computed stdev-of-log-returns series", () => {
    // logReturns = [ln(1.1), ln(1/1.1), ln(1.1)] ≈ [0.09531, -0.09531, 0.09531]
    // Each trailing 2-window has mean 0 and both values of equal magnitude,
    // so stdev = |value| ≈ 0.09531 -> 9.531%.
    const values = rvol2.compute(candles);
    expect(values).toHaveLength(2);
    for (const v of values) {
      expect(v.value).toBeCloseTo(9.531, 2);
    }
  });

  it("is prefix-stable (no look-ahead)", () => {
    assertPrefixStability(rvol2, candles);
  });
});
