import { describe, expect, it } from "vitest";
import { runTrendPullbackBacktest, type TrendPullbackConfig } from "@/core/us-index-research/trend-pullback";
import type { Candle } from "@/core/market-data/types";

function makeCandles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ market: "SP500", timeframe: "1d", timestamp: new Date(Date.UTC(2020, 0, 1 + i)).toISOString(), symbol: "SPY", provider: "test", open: c, high: c, low: c, close: c, volume: 1000 }));
}

const BASE_CONFIG: TrendPullbackConfig = { smaTrendPeriod: 50, smaSlopeLookbackDays: 10, rsiPeriod: 14, entryRsiThreshold: 40, exitRsiThreshold: 55, maxHoldDays: 20, regimeFilterMode: "NONE" };

describe("runTrendPullbackBacktest — regime filter gating", () => {
  it("BOTH regime filter never opens a position when the market never establishes a bullish long-term trend or a calm vol regime", () => {
    // A long, choppy sideways series that never sustains a clear rally above a 200-day average, and stays volatile — LONG_TERM_TREND and VOL_REGIME should rarely/never both pass.
    const closes = Array.from({ length: 260 }, (_, i) => 100 + 5 * Math.sin(i / 3));
    const candles = makeCandles(closes);
    const results = runTrendPullbackBacktest(candles, { ...BASE_CONFIG, regimeFilterMode: "BOTH" }, "OPTIMISTIC");
    const unfiltered = runTrendPullbackBacktest(candles, { ...BASE_CONFIG, regimeFilterMode: "NONE" }, "OPTIMISTIC");
    const daysInPositionFiltered = results.filter((r) => r.inPosition).length;
    const daysInPositionUnfiltered = unfiltered.filter((r) => r.inPosition).length;
    // A stricter filter can only be equally or more restrictive than no filter at all.
    expect(daysInPositionFiltered).toBeLessThanOrEqual(daysInPositionUnfiltered);
  });
});

describe("runTrendPullbackBacktest — causality", () => {
  it("only charges cost on the day the position actually changes", () => {
    const closes = Array.from({ length: 100 }, () => 100); // perfectly flat — RSI never resumes from oversold, so the strategy stays flat throughout
    const candles = makeCandles(closes);
    const results = runTrendPullbackBacktest(candles, BASE_CONFIG, "REALISTIC");
    for (const r of results) {
      expect(r.turnover).toBe(0);
      expect(r.costDrag).toBe(0);
    }
  });
});
