import { describe, expect, it } from "vitest";
import { computeBuyAndHoldBaseline } from "@/core/backtesting/baseline-buy-and-hold";
import type { Candle } from "@/core/market-data/types";

function candle(overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "1d",
    symbol: "SPY",
    provider: "test",
    timestamp: "2024-06-17T14:00:00.000Z",
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1000,
    ...overrides,
  };
}

describe("computeBuyAndHoldBaseline", () => {
  it("computes net profit and return % for a simple gain", () => {
    const candles = [
      candle({ close: 100, timestamp: "2024-01-01T00:00:00.000Z" }),
      candle({ close: 110, timestamp: "2024-06-01T00:00:00.000Z" }),
    ];

    const metrics = computeBuyAndHoldBaseline(candles, 10_000);

    expect(metrics.totalTrades).toBe(1);
    expect(metrics.netProfit).toBeCloseTo(1000, 6); // 10% of 10,000
    expect(metrics.returnPct).toBeCloseTo(10, 6);
  });

  it("computes a loss correctly when the exit price is lower than the entry", () => {
    const candles = [
      candle({ close: 100, timestamp: "2024-01-01T00:00:00.000Z" }),
      candle({ close: 90, timestamp: "2024-06-01T00:00:00.000Z" }),
    ];

    const metrics = computeBuyAndHoldBaseline(candles, 10_000);

    expect(metrics.netProfit).toBeCloseTo(-1000, 6);
    expect(metrics.returnPct).toBeCloseTo(-10, 6);
  });

  it("has no meaningful R-multiple (pnlR fixed at 0 — no defined risk basis)", () => {
    const candles = [
      candle({ close: 100, timestamp: "2024-01-01T00:00:00.000Z" }),
      candle({ close: 150, timestamp: "2024-06-01T00:00:00.000Z" }),
    ];

    const metrics = computeBuyAndHoldBaseline(candles, 10_000);
    expect(metrics.averageR).toBe(0);
  });

  it("never throws on an empty candle list", () => {
    const metrics = computeBuyAndHoldBaseline([], 10_000);
    expect(metrics.totalTrades).toBe(0);
  });

  it("counts a gain as a winning trade and a loss as a losing trade in the underlying metrics", () => {
    const gain = computeBuyAndHoldBaseline(
      [candle({ close: 100, timestamp: "2024-01-01T00:00:00.000Z" }), candle({ close: 105, timestamp: "2024-06-01T00:00:00.000Z" })],
      10_000,
    );
    const loss = computeBuyAndHoldBaseline(
      [candle({ close: 100, timestamp: "2024-01-01T00:00:00.000Z" }), candle({ close: 95, timestamp: "2024-06-01T00:00:00.000Z" })],
      10_000,
    );

    expect(gain.winningTrades).toBe(1);
    expect(gain.losingTrades).toBe(0);
    expect(loss.winningTrades).toBe(0);
    expect(loss.losingTrades).toBe(1);
  });
});
