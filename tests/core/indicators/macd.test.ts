import { describe, expect, it } from "vitest";
import { createMacd } from "@/core/indicators/macd";
import { buildCandles } from "./fixtures";
import { assertPrefixStability } from "./prefix-stability.helper";

describe("createMacd", () => {
  // A straight-line ramp: once both EMAs are past their own seeding
  // transient, EMA(fast) - EMA(slow) converges to a constant, making
  // the MACD line, signal, and histogram all hand-verifiable constants.
  const candles = buildCandles(
    [10, 11, 12, 13, 14, 15, 16].map((close) => ({ close })),
  );
  const macd = createMacd(2, 3, 2); // warmup = 3 + 2 - 1 = 4

  it("produces no value before the warmup period", () => {
    expect(macd.compute(candles.slice(0, 3))).toEqual([]);
  });

  it("matches a hand-computed MACD/signal/histogram series", () => {
    // EMA(2): seed=avg(10,11)=10.5, k=2/3 -> values track close-0.5 exactly.
    // EMA(3): seed=avg(10,11,12)=11, k=0.5 -> values track close-1 exactly.
    // macd = EMA2 - EMA3 = 0.5 at every overlapping point.
    // signal = EMA(2) of a constant 0.5 series = 0.5 everywhere.
    const values = macd.compute(candles);
    expect(values).toHaveLength(4);
    for (const v of values) {
      expect(v.macd).toBeCloseTo(0.5, 6);
      expect(v.signal).toBeCloseTo(0.5, 6);
      expect(v.histogram).toBeCloseTo(0, 6);
    }
  });

  it("is prefix-stable (no look-ahead)", () => {
    assertPrefixStability(macd, candles);
  });
});
