import { describe, expect, it } from "vitest";
import { computeBacktestMetrics } from "@/core/backtesting/metrics";
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
    ambiguousIntrabarExit: false,
    commissionPaid: 0,
    slippagePaid: 0,
    entrySlippageAmount: 0,
    entrySpreadAmount: 0,
    exitSlippageAmount: 0,
    exitSpreadAmount: 0,
    positionSize: 1,
    riskAmount: 50,
    rulesTriggered: [],
    ...overrides,
  };
}

describe("computeBacktestMetrics", () => {
  describe("core P&L metrics", () => {
    // 3 wins (+100, +150, +100), 2 losses (-50, -50). netProfit=250.
    const trades = [
      trade({ pnlAmount: 100, pnlR: 2 }),
      trade({ pnlAmount: -50, pnlR: -1 }),
      trade({ pnlAmount: 150, pnlR: 3 }),
      trade({ pnlAmount: -50, pnlR: -1 }),
      trade({ pnlAmount: 100, pnlR: 2 }),
    ];
    const metrics = computeBacktestMetrics(trades, 10_000, "2024-06-17T00:00:00Z", "2024-06-22T00:00:00Z");

    it("counts trades, wins, and losses", () => {
      expect(metrics.totalTrades).toBe(5);
      expect(metrics.winningTrades).toBe(3);
      expect(metrics.losingTrades).toBe(2);
      expect(metrics.winRate).toBeCloseTo(0.6, 10);
    });

    it("computes average win/loss and profit factor", () => {
      expect(metrics.averageWin).toBeCloseTo(350 / 3, 10);
      expect(metrics.averageLoss).toBeCloseTo(-50, 10);
      expect(metrics.profitFactor).toBeCloseTo(3.5, 10); // 350 gross profit / 100 gross loss
    });

    it("computes expectancy in $ and in R", () => {
      expect(metrics.expectancy).toBeCloseTo(50, 10); // 250 net / 5 trades
      expect(metrics.expectancyR).toBeCloseTo(1, 10); // mean R = (2-1+3-1+2)/5
      expect(metrics.averageR).toBeCloseTo(metrics.expectancyR, 10);
    });

    it("computes medianR and riskRewardRatio", () => {
      expect(metrics.medianR).toBeCloseTo(2, 10); // sorted [-1,-1,2,2,3] -> middle
      expect(metrics.riskRewardRatio).toBeCloseTo(Math.abs(350 / 3 / -50), 10);
    });

    it("computes net profit and return %", () => {
      expect(metrics.netProfit).toBeCloseTo(250, 10);
      expect(metrics.returnPct).toBeCloseTo(2.5, 10);
    });

    it("attaches a sample quality label", () => {
      expect(metrics.sampleQuality).toBe("INSUFFICIENT"); // 5 trades < 10
    });
  });

  describe("max drawdown", () => {
    it("tracks the largest peak-to-trough drop, not just the final one", () => {
      // equity: 1000 -> 1200 (peak) -> 900 (dd=300, 25%) -> 1000 -> 950 (dd=250, ~20.8%)
      const trades = [
        trade({ pnlAmount: 200 }),
        trade({ pnlAmount: -300 }),
        trade({ pnlAmount: 100 }),
        trade({ pnlAmount: -50 }),
      ];
      const metrics = computeBacktestMetrics(trades, 1000, "2024-06-17T00:00:00Z", "2024-06-18T00:00:00Z");

      expect(metrics.maxDrawdownAmount).toBeCloseTo(300, 10);
      expect(metrics.maxDrawdownPct).toBeCloseTo(25, 10);
    });
  });

  describe("consecutive wins/losses", () => {
    it("finds the longest streak of each, not the total count", () => {
      // W W W L L W L L L L
      const trades = [
        trade({ pnlAmount: 10 }),
        trade({ pnlAmount: 10 }),
        trade({ pnlAmount: 10 }),
        trade({ pnlAmount: -10 }),
        trade({ pnlAmount: -10 }),
        trade({ pnlAmount: 10 }),
        trade({ pnlAmount: -10 }),
        trade({ pnlAmount: -10 }),
        trade({ pnlAmount: -10 }),
        trade({ pnlAmount: -10 }),
      ];
      const metrics = computeBacktestMetrics(trades, 10_000, "2024-06-17T00:00:00Z", "2024-06-18T00:00:00Z");

      expect(metrics.consecutiveWins).toBe(3);
      expect(metrics.consecutiveLosses).toBe(4);
    });
  });

  describe("exposure, trades per month, average holding time", () => {
    it("computes exposure as time-in-position over total period", () => {
      const trades = [
        trade({
          pnlAmount: 10,
          entryAt: "2024-06-17T14:00:00.000Z",
          exitAt: "2024-06-17T15:00:00.000Z", // 1 hour
        }),
        trade({
          pnlAmount: 10,
          entryAt: "2024-06-17T16:00:00.000Z",
          exitAt: "2024-06-17T17:00:00.000Z", // 1 hour
        }),
      ];
      // period = exactly 24 hours
      const metrics = computeBacktestMetrics(trades, 10_000, "2024-06-17T00:00:00.000Z", "2024-06-18T00:00:00.000Z");

      expect(metrics.exposurePct).toBeCloseTo((2 / 24) * 100, 10);
      expect(metrics.averageHoldingTimeMs).toBe(3_600_000);
    });

    it("annualizes trade frequency to trades per month using a 30.44-day month", () => {
      const trades = [trade({ pnlAmount: 1 }), trade({ pnlAmount: 1 }), trade({ pnlAmount: 1 })];
      const periodStart = "2024-01-01T00:00:00.000Z";
      const periodEnd = new Date(new Date(periodStart).getTime() + 30.44 * 86_400_000).toISOString();
      const metrics = computeBacktestMetrics(trades, 10_000, periodStart, periodEnd);

      expect(metrics.tradesPerMonth).toBeCloseTo(3, 6);
    });
  });

  describe("Sharpe / Sortino ratio", () => {
    it("is undefined with fewer than 2 trades (can't compute variance)", () => {
      const metrics = computeBacktestMetrics(
        [trade({ pnlAmount: 10, pnlR: 1 })],
        10_000,
        "2024-06-17T00:00:00Z",
        "2024-06-18T00:00:00Z",
      );
      expect(metrics.sharpeRatio).toBeUndefined();
      expect(metrics.sortinoRatio).toBeUndefined();
    });

    it("is undefined when the relevant return series has zero variance", () => {
      // All downside returns identical (-1) -> sortino denominator is 0.
      const trades = [
        trade({ pnlAmount: 10, pnlR: 2 }),
        trade({ pnlAmount: -10, pnlR: -1 }),
        trade({ pnlAmount: -10, pnlR: -1 }),
      ];
      const metrics = computeBacktestMetrics(trades, 10_000, "2024-06-17T00:00:00Z", "2024-06-18T00:00:00Z");
      expect(metrics.sortinoRatio).toBeUndefined();
    });

    it("is undefined (never an absurd extreme value) when downside deviation is near-zero but not exact-zero", () => {
      // Block 4.5 fix: this reproduces the real bug found in the Block 4
      // report — a zero-cost run where losing trades close at ~identical
      // R (here off by 1e-10, simulating floating-point noise rather than
      // a true zero) used to produce a denominator like 1e-10 and a
      // Sortino ratio in the trillions (observed: -2.65e15). It must now
      // be undefined, exactly like the true-zero-variance case above.
      const trades = [
        trade({ pnlAmount: 20, pnlR: 2 }),
        trade({ pnlAmount: -10, pnlR: -1 }),
        trade({ pnlAmount: -10.0000001, pnlR: -1 + 1e-10 }),
        trade({ pnlAmount: -9.9999999, pnlR: -1 - 1e-10 }),
      ];
      const metrics = computeBacktestMetrics(trades, 10_000, "2024-06-17T00:00:00Z", "2024-06-18T00:00:00Z");
      expect(metrics.sortinoRatio).toBeUndefined();
    });

    it("computes a defined ratio (mean R / stdev R) when variance is non-zero", () => {
      // pnlRs = [2, 2, -1, -3], mean = 0, sample stdev = sqrt(6) -> sharpe = 0/sqrt(6) = 0 exactly
      const trades = [
        trade({ pnlAmount: 20, pnlR: 2 }),
        trade({ pnlAmount: 20, pnlR: 2 }),
        trade({ pnlAmount: -10, pnlR: -1 }),
        trade({ pnlAmount: -30, pnlR: -3 }),
      ];
      const metrics = computeBacktestMetrics(trades, 10_000, "2024-06-17T00:00:00Z", "2024-06-18T00:00:00Z");

      expect(metrics.sharpeRatio).toBeCloseTo(0, 10);
      expect(metrics.sortinoRatio).toBeCloseTo(0, 10);
    });
  });

  describe("breakdown groupings", () => {
    const trades = [
      trade({
        pnlAmount: 100,
        pnlR: 2,
        strategyId: "trend-following",
        marketRegimeAtEntry: "STRONG_UPTREND",
        entryAt: "2024-06-17T14:05:00.000Z", // Monday
      }),
      trade({
        pnlAmount: -50,
        pnlR: -1,
        strategyId: "trend-following",
        marketRegimeAtEntry: "RANGE",
        entryAt: "2024-06-18T15:05:00.000Z", // Tuesday
      }),
      trade({
        pnlAmount: 50,
        pnlR: 1,
        strategyId: "breakout",
        marketRegimeAtEntry: "STRONG_UPTREND",
        entryAt: "2024-06-17T14:35:00.000Z", // Monday
      }),
    ];
    const metrics = computeBacktestMetrics(trades, 10_000, "2024-06-17T00:00:00Z", "2024-06-22T00:00:00Z");

    it("groups by regime with correct trade counts", () => {
      expect(metrics.performanceByRegime.STRONG_UPTREND?.totalTrades).toBe(2);
      expect(metrics.performanceByRegime.RANGE?.totalTrades).toBe(1);
    });

    it("groups by strategy with correct trade counts", () => {
      expect(metrics.performanceByStrategy["trend-following"]?.totalTrades).toBe(2);
      expect(metrics.performanceByStrategy.breakout?.totalTrades).toBe(1);
    });

    it("groups by Eastern hour-of-day", () => {
      // Both 14:05Z and 14:35Z entries fall in the same UTC hour (14),
      // which for a June date (EDT, UTC-4) is Eastern hour 10.
      expect(metrics.performanceByHour[10]?.totalTrades).toBe(2);
      expect(metrics.performanceByHour[11]?.totalTrades).toBe(1);
    });

    it("groups by weekday", () => {
      // 2024-06-17 is a Monday (1), 2024-06-18 is a Tuesday (2).
      expect(metrics.performanceByWeekday[1]?.totalTrades).toBe(2);
      expect(metrics.performanceByWeekday[2]?.totalTrades).toBe(1);
    });

    it("groups by month", () => {
      expect(metrics.performanceByMonth["2024-06"]?.totalTrades).toBe(3);
    });

    it("does not recursively compute nested breakdowns within a bucket's own metrics", () => {
      const bucket = metrics.performanceByRegime.STRONG_UPTREND!;
      expect(bucket.performanceByRegime).toEqual({});
      expect(bucket.performanceByStrategy).toEqual({});
    });

    it("includeBreakdowns=false skips all breakdowns at the top level too", () => {
      const flat = computeBacktestMetrics(trades, 10_000, "2024-06-17T00:00:00Z", "2024-06-22T00:00:00Z", false);
      expect(flat.performanceByRegime).toEqual({});
      expect(flat.performanceByStrategy).toEqual({});
      expect(flat.performanceByHour).toEqual({});
      expect(flat.totalTrades).toBe(3); // top-level numbers are still computed
    });
  });

  describe("empty trade list", () => {
    it("never throws and returns sane zeroed-out metrics", () => {
      const metrics = computeBacktestMetrics([], 10_000, "2024-06-17T00:00:00Z", "2024-06-18T00:00:00Z");

      expect(metrics.totalTrades).toBe(0);
      expect(metrics.winRate).toBe(0);
      expect(metrics.profitFactor).toBe(0);
      expect(metrics.maxDrawdownPct).toBe(0);
      expect(metrics.sharpeRatio).toBeUndefined();
      expect(metrics.sampleQuality).toBe("INSUFFICIENT");
    });
  });
});
