import { describe, expect, it } from "vitest";
import { runMonteCarloSimulation } from "@/core/backtesting/monte-carlo";
import type { BacktestTrade } from "@/core/backtesting/types";

function tradeWithR(pnlR: number): BacktestTrade {
  return {
    id: crypto.randomUUID(),
    market: "SP500",
    timeframe: "15m",
    direction: "BUY",
    entryPrice: 100,
    stopLoss: 98,
    exitPrice: 100 + pnlR * 2,
    entryAt: "2024-06-17T14:00:00.000Z",
    exitAt: "2024-06-17T14:15:00.000Z",
    exitReason: pnlR >= 0 ? "TAKE_PROFIT" : "STOP_LOSS",
    ambiguousIntrabarExit: false,
    pnlAmount: pnlR * 50, // arbitrary but consistent with riskAmount=50 in these tests
    pnlR,
    commissionPaid: 0,
    slippagePaid: 0,
    rulesTriggered: [],
  };
}

describe("runMonteCarloSimulation", () => {
  it("is fully deterministic for a given seed", () => {
    const trades = [tradeWithR(2), tradeWithR(-1), tradeWithR(1), tradeWithR(-1), tradeWithR(3)];

    const first = runMonteCarloSimulation(trades, 10_000, 0.5, 500, 42);
    const second = runMonteCarloSimulation(trades, 10_000, 0.5, 500, 42);

    expect(second).toEqual(first);
  });

  it("percentiles are ordered p5 <= p50 <= p95", () => {
    const trades = [tradeWithR(2), tradeWithR(-1), tradeWithR(1), tradeWithR(-2), tradeWithR(3)];
    const result = runMonteCarloSimulation(trades, 10_000, 0.5, 500, 7);

    expect(result.maxDrawdownPct.p5).toBeLessThanOrEqual(result.maxDrawdownPct.p50);
    expect(result.maxDrawdownPct.p50).toBeLessThanOrEqual(result.maxDrawdownPct.p95);
    expect(result.endingEquity.p5).toBeLessThanOrEqual(result.endingEquity.p50);
    expect(result.endingEquity.p50).toBeLessThanOrEqual(result.endingEquity.p95);
    expect(result.losingStreak.p5).toBeLessThanOrEqual(result.losingStreak.p50);
    expect(result.losingStreak.p50).toBeLessThanOrEqual(result.losingStreak.p95);
  });

  it("returns a degenerate zero/initialCapital result for an empty trade list, never throwing", () => {
    const result = runMonteCarloSimulation([], 10_000, 0.5, 500, 42);

    expect(result.maxDrawdownPct).toEqual({ p5: 0, p50: 0, p95: 0 });
    expect(result.endingEquity).toEqual({ p5: 10_000, p50: 10_000, p95: 10_000 });
    expect(result.losingStreak).toEqual({ p5: 0, p50: 0, p95: 0 });
  });

  it("computes exact, uniform results when every trade has the identical R (resampling can't change the outcome)", () => {
    // All +1R: every possible resample is [1,1,1] — deterministic regardless of seed/order.
    const winningTrades = [tradeWithR(1), tradeWithR(1), tradeWithR(1)];
    const result = runMonteCarloSimulation(winningTrades, 10_000, 1, 200, 99);

    const expectedEquity = 10_000 * 1.01 ** 3;
    expect(result.endingEquity.p5).toBeCloseTo(expectedEquity, 6);
    expect(result.endingEquity.p50).toBeCloseTo(expectedEquity, 6);
    expect(result.endingEquity.p95).toBeCloseTo(expectedEquity, 6);
    expect(result.maxDrawdownPct.p50).toBe(0); // monotonically increasing equity -> never below peak
    expect(result.losingStreak.p50).toBe(0);
  });

  it("computes exact, uniform results for an all-losing sequence", () => {
    const losingTrades = [tradeWithR(-1), tradeWithR(-1), tradeWithR(-1)];
    const result = runMonteCarloSimulation(losingTrades, 10_000, 1, 200, 99);

    const expectedEquity = 10_000 * 0.99 ** 3;
    const expectedDrawdownPct = ((10_000 - expectedEquity) / 10_000) * 100;
    expect(result.endingEquity.p50).toBeCloseTo(expectedEquity, 6);
    expect(result.maxDrawdownPct.p50).toBeCloseTo(expectedDrawdownPct, 6);
    expect(result.losingStreak.p50).toBe(3);
  });

  it("records the requested numSimulations and seed on the result", () => {
    const result = runMonteCarloSimulation([tradeWithR(1)], 10_000, 0.5, 123, 7);
    expect(result.numSimulations).toBe(123);
    expect(result.seed).toBe(7);
  });
});
