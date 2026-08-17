import { describe, expect, it } from "vitest";
import { createEma } from "@/core/indicators/ema";
import { buildCandles } from "./fixtures";
import { assertPrefixStability } from "./prefix-stability.helper";

describe("createEma", () => {
  const candles = buildCandles([
    { close: 10 },
    { close: 20 },
    { close: 30 },
    { close: 40 },
    { close: 50 },
    { close: 60 },
  ]);
  const ema3 = createEma(3);

  it("produces no value before the warmup period", () => {
    expect(ema3.compute(candles.slice(0, 2))).toEqual([]);
  });

  it("matches a hand-computed EMA(3) series seeded with the initial SMA", () => {
    const values = ema3.compute(candles);
    // seed = avg(10,20,30) = 20; k = 2/4 = 0.5
    expect(values.map((v) => v.value)).toEqual([20, 30, 40, 50]);
  });

  it("is prefix-stable (no look-ahead)", () => {
    assertPrefixStability(ema3, candles);
  });
});
