import { describe, expect, it } from "vitest";
import { runHybridBacktest, computeHybridAttribution, type HybridConfig } from "@/core/us-index-research/hybrid";
import type { Candle } from "@/core/market-data/types";

function makeCandles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ market: "SP500", timeframe: "1d", timestamp: new Date(Date.UTC(2020, 0, 1 + i)).toISOString(), symbol: "SPY", provider: "test", open: c, high: c, low: c, close: c, volume: 1000 }));
}

const CONFIG: HybridConfig = { adxPeriod: 14, adxTrendThreshold: 20, rocLookbackDays: 10, contrarianRsiLow: 30, contrarianRsiHigh: 70 };

describe("runHybridBacktest", () => {
  it("never opens a position while the regime is still undetermined (ADX warmup)", () => {
    const closes = Array.from({ length: 10 }, (_, i) => 100 + i);
    const candles = makeCandles(closes);
    const results = runHybridBacktest(candles, CONFIG, "OPTIMISTIC");
    for (const r of results) {
      expect(r.regime).toBeUndefined();
      expect(r.inPosition).toBe(false);
    }
  });

  it("a strong sustained uptrend eventually classifies as TREND_REGIME with a long position", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i * 2); // strong, steady rally
    const candles = makeCandles(closes);
    const results = runHybridBacktest(candles, CONFIG, "OPTIMISTIC");
    const last = results[results.length - 1];
    expect(last.regime).toBe("TREND_REGIME");
    expect(last.inPosition).toBe(true);
  });
});

describe("computeHybridAttribution", () => {
  it("splits net return contribution by which regime was active when the position was held, and counts genuine regime switches", () => {
    const results = [
      { date: "d1", regime: "TREND_REGIME" as const, inPosition: true, grossReturn: 0.02, costDrag: 0, netReturn: 0.02, turnover: 1 },
      { date: "d2", regime: "TREND_REGIME" as const, inPosition: true, grossReturn: 0.01, costDrag: 0, netReturn: 0.01, turnover: 0 },
      { date: "d3", regime: "RANGE_REGIME" as const, inPosition: true, grossReturn: -0.005, costDrag: 0, netReturn: -0.005, turnover: 1 },
    ];
    const attribution = computeHybridAttribution([], CONFIG, results);
    expect(attribution.contributionMomentumPct).toBeCloseTo(3, 6);
    expect(attribution.contributionContrarianPct).toBeCloseTo(-0.5, 6);
    expect(attribution.switchingFrequency).toBeCloseTo((1 / 3) * 100, 6);
  });
});
