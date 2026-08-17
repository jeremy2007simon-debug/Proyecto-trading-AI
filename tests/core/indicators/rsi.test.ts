import { describe, expect, it } from "vitest";
import { createRsi } from "@/core/indicators/rsi";
import { buildCandles } from "./fixtures";
import { assertPrefixStability } from "./prefix-stability.helper";

describe("createRsi", () => {
  const candles = buildCandles([
    { close: 10 },
    { close: 12 },
    { close: 11 },
    { close: 13 },
    { close: 12 },
    { close: 14 },
    { close: 16 },
  ]);
  const rsi3 = createRsi(3);

  it("produces no value before the warmup period (period + 1)", () => {
    expect(rsi3.compute(candles.slice(0, 3))).toEqual([]);
  });

  it("matches a hand-computed first RSI(3) value", () => {
    // Diffs: +2,-1,+2 -> gainSum=4, lossSum=1 -> avgGain=4/3, avgLoss=1/3
    // RS = 4 -> RSI = 100 - 100/5 = 80
    const values = rsi3.compute(candles);
    expect(values[0].value).toBeCloseTo(80, 6);
  });

  it("matches a hand-computed second, Wilder-smoothed RSI(3) value", () => {
    // avgGain = (4/3*2 + 0)/3 = 8/9; avgLoss = (1/3*2 + 1)/3 = 5/9
    // RS = 1.6 -> RSI = 100 - 100/2.6 = 61.538461...
    const values = rsi3.compute(candles);
    expect(values[1].value).toBeCloseTo(61.5385, 3);
  });

  it("never returns a value outside [0, 100]", () => {
    for (const v of rsi3.compute(candles)) {
      expect(v.value).toBeGreaterThanOrEqual(0);
      expect(v.value).toBeLessThanOrEqual(100);
    }
  });

  it("is prefix-stable (no look-ahead)", () => {
    assertPrefixStability(rsi3, candles);
  });
});
