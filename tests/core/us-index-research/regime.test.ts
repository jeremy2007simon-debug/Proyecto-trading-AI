import { describe, expect, it } from "vitest";
import { buildRegimeSeries, regimePasses } from "@/core/us-index-research/regime";
import type { Candle } from "@/core/market-data/types";

function candle(date: string, close: number): Candle {
  return { market: "SP500", timeframe: "1d", timestamp: `${date}T00:00:00.000Z`, symbol: "SPY", provider: "test", open: close, high: close, low: close, close, volume: 1000 };
}

describe("buildRegimeSeries", () => {
  it("classifies bullish once price rises decisively above its trailing SMA(200)", () => {
    // Flat at 100 long enough to warm up both SMA(200) AND the realized-vol rolling percentile (needs 21 + 252 bars), then a strong rally — price ends up well above its (still catching-up) SMA200.
    const closes = [...Array(280).fill(100), ...Array(60).fill(200)];
    const candles = closes.map((close, i) => ({ ...candle("x", close), timestamp: new Date(Date.UTC(2020, 0, 1 + i)).toISOString() }));
    const regime = buildRegimeSeries(candles);
    const lastDate = candles[candles.length - 1].timestamp.slice(0, 10);
    expect(regime.byDate.get(lastDate)?.longTermTrendBullish).toBe(true);
  });

  it("produces no reading during warmup (fewer than the SMA/vol-percentile lookback requires)", () => {
    const candles = Array.from({ length: 10 }, (_, i) => ({ ...candle("x", 100), timestamp: new Date(Date.UTC(2020, 0, 1 + i)).toISOString() }));
    const regime = buildRegimeSeries(candles);
    expect(regime.byDate.size).toBe(0);
  });
});

describe("regimePasses", () => {
  const regime = { byDate: new Map([["2024-01-01", { longTermTrendBullish: true, volRegime: "HIGH_VOL" as const }]]) };

  it("NONE always passes, even with no reading", () => {
    expect(regimePasses(regime, "1999-01-01", "NONE")).toBe(true);
  });

  it("an unknown (warmup) date passes rather than blocking indefinitely", () => {
    expect(regimePasses(regime, "1999-01-01", "LONG_TERM_TREND")).toBe(true);
  });

  it("LONG_TERM_TREND reads the actual bullish flag", () => {
    expect(regimePasses(regime, "2024-01-01", "LONG_TERM_TREND")).toBe(true);
  });

  it("VOL_REGIME requires LOW_VOL", () => {
    expect(regimePasses(regime, "2024-01-01", "VOL_REGIME")).toBe(false);
  });

  it("BOTH requires both conditions", () => {
    expect(regimePasses(regime, "2024-01-01", "BOTH")).toBe(false);
  });
});
