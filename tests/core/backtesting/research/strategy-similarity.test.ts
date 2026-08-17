import { describe, expect, it } from "vitest";
import {
  buildDailyPnlSeries,
  computeTimeInMarketOverlapPct,
  correlateDailyPnl,
  pearsonCorrelation,
} from "@/core/backtesting/research/strategy-similarity";
import type { BacktestTrade } from "@/core/backtesting/types";

let nextId = 0;
function trade(overrides: Partial<BacktestTrade>): BacktestTrade {
  nextId += 1;
  return {
    id: `trade-${nextId}`,
    market: "SP500",
    timeframe: "15m",
    direction: "BUY",
    entryPrice: 100,
    stopLoss: 98,
    entryAt: "2024-06-17T14:00:00.000Z",
    exitAt: "2024-06-17T15:00:00.000Z",
    ambiguousIntrabarExit: false,
    positionSize: 1,
    riskAmount: 2,
    commissionPaid: 0,
    slippagePaid: 0,
    entrySlippageAmount: 0,
    entrySpreadAmount: 0,
    exitSlippageAmount: 0,
    exitSpreadAmount: 0,
    rulesTriggered: [],
    pnlAmount: 0,
    ...overrides,
  };
}

describe("pearsonCorrelation", () => {
  it("is undefined with fewer than 2 paired observations", () => {
    expect(pearsonCorrelation([1], [2])).toBeUndefined();
    expect(pearsonCorrelation([], [])).toBeUndefined();
  });

  it("is undefined for mismatched lengths", () => {
    expect(pearsonCorrelation([1, 2], [1])).toBeUndefined();
  });

  it("is 1 for perfectly correlated series", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
  });

  it("is -1 for perfectly anti-correlated series", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 6);
  });

  it("is undefined when either series has zero variance", () => {
    expect(pearsonCorrelation([1, 1, 1], [1, 2, 3])).toBeUndefined();
  });
});

describe("buildDailyPnlSeries", () => {
  it("buckets trades by the Eastern calendar day of their exit and sums pnlAmount", () => {
    const trades = [
      trade({ exitAt: "2024-06-17T15:00:00.000Z", pnlAmount: 100 }),
      trade({ exitAt: "2024-06-17T19:00:00.000Z", pnlAmount: -30 }),
      trade({ exitAt: "2024-06-18T15:00:00.000Z", pnlAmount: 50 }),
    ];
    const series = buildDailyPnlSeries(trades);
    expect(series.get("2024-06-17")).toBe(70);
    expect(series.get("2024-06-18")).toBe(50);
  });

  it("ignores trades with no exitAt or no pnlAmount", () => {
    const trades = [trade({ exitAt: undefined, pnlAmount: undefined })];
    expect(buildDailyPnlSeries(trades).size).toBe(0);
  });
});

describe("correlateDailyPnl", () => {
  it("is 1 for two strategies with identical daily P&L", () => {
    const tradesA = [trade({ exitAt: "2024-06-17T15:00:00.000Z", pnlAmount: 100 })];
    const tradesB = [trade({ exitAt: "2024-06-17T15:00:00.000Z", pnlAmount: 200 })];
    // Only one shared day with a fixed ratio isn't enough to define correlation (needs >=2 points);
    // add a second day with a different but proportional relationship.
    const tradesA2 = [...tradesA, trade({ exitAt: "2024-06-18T15:00:00.000Z", pnlAmount: -50 })];
    const tradesB2 = [...tradesB, trade({ exitAt: "2024-06-18T15:00:00.000Z", pnlAmount: -100 })];
    expect(correlateDailyPnl(tradesA2, tradesB2)).toBeCloseTo(1, 6);
  });
});

describe("computeTimeInMarketOverlapPct", () => {
  it("is 0 when either side has no closed trades", () => {
    expect(computeTimeInMarketOverlapPct([], [])).toBe(0);
  });

  it("is 100% when one strategy's exposure is fully contained in the other's", () => {
    const tradesA = [trade({ entryAt: "2024-06-17T14:00:00.000Z", exitAt: "2024-06-17T18:00:00.000Z" })];
    const tradesB = [trade({ entryAt: "2024-06-17T15:00:00.000Z", exitAt: "2024-06-17T16:00:00.000Z" })];
    expect(computeTimeInMarketOverlapPct(tradesA, tradesB)).toBeCloseTo(100, 6);
  });

  it("is 0% when the two never overlap in time", () => {
    const tradesA = [trade({ entryAt: "2024-06-17T14:00:00.000Z", exitAt: "2024-06-17T15:00:00.000Z" })];
    const tradesB = [trade({ entryAt: "2024-06-17T16:00:00.000Z", exitAt: "2024-06-17T17:00:00.000Z" })];
    expect(computeTimeInMarketOverlapPct(tradesA, tradesB)).toBe(0);
  });
});
