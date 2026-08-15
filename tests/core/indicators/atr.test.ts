import { describe, expect, it } from "vitest";
import { createAtr } from "@/core/indicators/atr";
import { buildCandles } from "./fixtures";
import { assertPrefixStability } from "./prefix-stability.helper";

describe("createAtr", () => {
  // Bars 0-4 all have a true range of exactly 2; bar 5 has a true range
  // of 8, giving a clean, hand-verifiable Wilder smoothing step.
  const candles = buildCandles([
    { high: 10, low: 8, close: 10 },
    { high: 12, low: 10, close: 10.5 },
    { high: 12, low: 10, close: 11.5 },
    { high: 13, low: 11, close: 12.5 },
    { high: 14, low: 12, close: 13.5 },
    { high: 20, low: 12, close: 18 },
  ]);
  const atr3 = createAtr(3);

  it("produces no value before the warmup period (period + 1)", () => {
    expect(atr3.compute(candles.slice(0, 3))).toEqual([]);
  });

  it("matches hand-computed ATR(3) values including a Wilder-smoothing step", () => {
    // TR1..TR4 = 2,2,2,2 -> seed ATR = avg(TR1,TR2,TR3) = 2
    // next ATR (using TR4=2) = (2*2 + 2)/3 = 2
    // TR5 = max(20-12=8, |20-13.5|=6.5, |12-13.5|=1.5) = 8
    // next ATR = (2*2 + 8)/3 = 4
    const values = atr3.compute(candles);
    expect(values.map((v) => v.value)).toEqual([2, 2, 4]);
  });

  it("is prefix-stable (no look-ahead)", () => {
    assertPrefixStability(atr3, candles);
  });
});
