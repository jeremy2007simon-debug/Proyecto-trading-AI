import { describe, expect, it } from "vitest";
import { createVolumeAverage } from "@/core/indicators/volume-average";
import { buildCandles } from "./fixtures";
import { assertPrefixStability } from "./prefix-stability.helper";

describe("createVolumeAverage", () => {
  const candles = buildCandles(
    [100, 200, 300, 400, 500].map((volume) => ({ close: 1, volume })),
  );
  const volAvg3 = createVolumeAverage(3);

  it("produces no value before the warmup period", () => {
    expect(volAvg3.compute(candles.slice(0, 2))).toEqual([]);
  });

  it("matches a hand-computed trailing volume average", () => {
    const values = volAvg3.compute(candles);
    expect(values.map((v) => v.value)).toEqual([200, 300, 400]);
  });

  it("is prefix-stable (no look-ahead)", () => {
    assertPrefixStability(volAvg3, candles);
  });
});
