import { describe, expect, it } from "vitest";
import { createSma } from "@/core/indicators/sma";
import { createRollingPercentile } from "@/core/indicators/rolling-percentile";
import { buildCandles } from "./fixtures";
import { assertPrefixStability } from "./prefix-stability.helper";

describe("createRollingPercentile", () => {
  // SMA(1) reproduces `close` exactly, giving direct control over the
  // source series for hand computation.
  const identity = createSma(1);
  const closes = [10, 20, 15, 30, 25, 5, 40, 35, 12, 50];
  const candles = buildCandles(closes.map((close) => ({ close })));
  const rollingPercentile = createRollingPercentile(identity, (v) => v.value, 5);

  it("produces no value before the warmup period (source.warmupPeriod + window - 1)", () => {
    expect(rollingPercentile.warmupPeriod).toBe(5);
    expect(rollingPercentile.compute(candles.slice(0, 4))).toEqual([]);
  });

  it("matches hand-computed rolling percentile ranks (mid-rank tie convention)", () => {
    // Mid-rank: percentile = (countBelow + countEqual/2) / window * 100.
    // No ties within any window here (countEqual is always 1, the value itself).
    // window [10,20,15,30,25], current 25 -> below=3(10,20,15) -> (3+.5)/5*100 = 70
    // window [20,15,30,25,5],  current 5  -> below=0            -> (0+.5)/5*100 = 10
    // window [15,30,25,5,40],  current 40 -> below=4(15,30,25,5)-> (4+.5)/5*100 = 90
    // window [30,25,5,40,35],  current 35 -> below=3(30,25,5)   -> (3+.5)/5*100 = 70
    // window [25,5,40,35,12],  current 12 -> below=1(5)         -> (1+.5)/5*100 = 30
    // window [5,40,35,12,50],  current 50 -> below=4(5,40,35,12)-> (4+.5)/5*100 = 90
    const values = rollingPercentile.compute(candles);
    expect(values.map((v) => v.percentile)).toEqual([70, 10, 90, 70, 30, 90]);
    expect(values.map((v) => v.sourceValue)).toEqual([25, 5, 40, 35, 12, 50]);
  });

  it("gives a flat/tied window a neutral percentile of 50 instead of 100", () => {
    const flatCandles = buildCandles(Array.from({ length: 6 }, () => ({ close: 42 })));
    const flatPercentile = createRollingPercentile(identity, (v) => v.value, 5);
    const values = flatPercentile.compute(flatCandles);
    expect(values).toHaveLength(2);
    for (const v of values) expect(v.percentile).toBe(50);
  });

  it("never depends on how much extra history precedes the window (rolling, not global)", () => {
    // Prepending extra bars before the window must not change the
    // percentile of the bars the window already covers.
    const extraBars = buildCandles([{ close: 1000 }, { close: -1000 }, { close: 500 }]);
    const withExtraHistory = [...extraBars, ...candles];

    const shortRun = rollingPercentile.compute(candles);
    const longRun = rollingPercentile.compute(withExtraHistory);
    const longRunTail = longRun.slice(longRun.length - shortRun.length);

    expect(longRunTail).toEqual(shortRun);
  });

  it("is prefix-stable (no look-ahead)", () => {
    assertPrefixStability(rollingPercentile, candles);
  });
});
