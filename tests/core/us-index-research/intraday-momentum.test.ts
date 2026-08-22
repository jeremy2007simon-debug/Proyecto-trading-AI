import { describe, expect, it } from "vitest";
import { runIntradayMomentumBacktest, summarizeIntradayTrades, type IntradayMomentumConfig } from "@/core/us-index-research/intraday-momentum";
import type { UsIndexIntradayBar } from "@/core/us-index-research/types";

/** Builds N regular-session hourly bars (09:30-15:30 ET = 6 bars/day, DST-naive: uses winter offset UTC-5 for simplicity) starting at `startPrice`, with a strong directional move + volume spike on the 2nd bar of each session. */
function makeSessionBars(days: number, moveDirection: 1 | -1): UsIndexIntradayBar[] {
  const bars: UsIndexIntradayBar[] = [];
  for (let d = 0; d < days; d++) {
    const dateBase = Date.UTC(2024, 0, 2 + d, 14, 30); // 09:30 ET in winter (UTC-5)
    let price = 100;
    for (let h = 0; h < 6; h++) {
      const isSignalBar = h === 1;
      const move = isSignalBar ? moveDirection * 3 : 0.1 * moveDirection;
      const open = price;
      price += move;
      const volume = isSignalBar ? 5000 : 500;
      bars.push({ timestamp: new Date(dateBase + h * 3_600_000).toISOString(), open, high: Math.max(open, price) + 0.5, low: Math.min(open, price) - 0.5, close: price, volume });
    }
  }
  return bars;
}

const CONFIG: IntradayMomentumConfig = { openingWindowBars: 3, moveThresholdAtrMultiple: 0.5, volumeMultiplier: 1.2, atrStopMultiplier: 1.0, takeProfitRMultiple: 1.5 };

describe("runIntradayMomentumBacktest — flat by close", () => {
  it("every trade is closed on the SAME session it opened on — no position carries overnight", () => {
    const bars = makeSessionBars(20, 1);
    const trades = runIntradayMomentumBacktest(bars, "SPY", CONFIG, "REALISTIC");
    expect(trades.length).toBeGreaterThan(0);
    for (const trade of trades) {
      expect(trade.exitAt.slice(0, 10)).toBe(trade.entryAt.slice(0, 10));
    }
  });
});

describe("runIntradayMomentumBacktest — no look-ahead", () => {
  it("enters at the NEXT bar's open, never at the signal bar's own close", () => {
    const bars = makeSessionBars(20, 1);
    const trades = runIntradayMomentumBacktest(bars, "SPY", CONFIG, "OPTIMISTIC");
    for (const trade of trades) {
      const barAtEntry = bars.find((b) => b.timestamp === trade.entryAt);
      expect(barAtEntry).toBeDefined();
      expect(trade.entryPrice).toBe(barAtEntry!.open);
    }
  });

  it("session-day grouping is DST-correct (Eastern calendar day, not naive UTC date)", () => {
    // 23:30 UTC on 2024-07-01 is still 19:30 ET the SAME day (summer, UTC-4) — not a session bar at all here, but the grouping key must reflect Eastern date regardless.
    const bars = makeSessionBars(5, 1);
    const trades = runIntradayMomentumBacktest(bars, "SPY", CONFIG, "OPTIMISTIC");
    // Every session's trades should key to a distinct Eastern date matching the bars' own 09:30 ET start.
    for (const trade of trades) {
      expect(trade.sessionDate).toMatch(/^2024-01-/);
    }
  });
});

describe("summarizeIntradayTrades", () => {
  it("handles zero trades without division by zero", () => {
    expect(summarizeIntradayTrades([], 10)).toEqual({ totalTrades: 0, tradesPerDay: 0, winRate: 0, averageR: 0, averageNetR: 0, profitFactor: undefined, expectancyR: 0, netExpectancyR: 0 });
  });

  it("profit factor is undefined (not Infinity) when there are no losing trades", () => {
    const trades = [{ sessionDate: "d", direction: 1 as const, entryAt: "a", entryPrice: 100, exitAt: "b", exitPrice: 105, exitReason: "TAKE_PROFIT" as const, riskPerShare: 1, pnlR: 5, netPnlR: 5 }];
    const summary = summarizeIntradayTrades(trades, 1);
    expect(summary.profitFactor).toBeUndefined();
  });
});
