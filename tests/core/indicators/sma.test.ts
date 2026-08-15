import { describe, expect, it } from "vitest";
import { createSma } from "@/core/indicators/sma";
import { buildCandles } from "./fixtures";
import { assertPrefixStability } from "./prefix-stability.helper";

describe("createSma", () => {
  const candles = buildCandles([{ close: 1 }, { close: 2 }, { close: 3 }, { close: 4 }, { close: 5 }]);
  const sma3 = createSma(3);

  it("produces no value before the warmup period", () => {
    expect(sma3.compute(candles.slice(0, 2))).toEqual([]);
  });

  it("matches a hand-computed trailing SMA(3)", () => {
    const values = sma3.compute(candles);
    expect(values.map((v) => v.value)).toEqual([2, 3, 4]);
  });

  it("is prefix-stable (no look-ahead)", () => {
    assertPrefixStability(sma3, candles);
  });
});
