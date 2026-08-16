import { describe, expect, it } from "vitest";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import { classifySampleQuality } from "@/core/backtesting/sample-quality";
import { getDefaultStrategyManager } from "@/core/strategy-manager/registry";
import { InMemoryMockMarketDataProvider } from "@/core/market-data/testing/mock-market-data-provider";
import { ZERO_COST_BASELINE, DEFAULT_SAME_CANDLE_POLICY, type BacktestConfig } from "@/core/backtesting/types";
import type { Timeframe } from "@/core/shared/types";

/**
 * End-to-end test of the full backtesting pipeline for this block,
 * entirely offline: synthetic SPY-like candles (deterministic, no
 * network, no broker) -> event-driven simulator (using the REAL
 * registered strategies) -> a coherent `BacktestRun` with metrics and a
 * matching sample-quality label, for each of the 5 strategies at their
 * own native timeframe.
 */
const provider = new InMemoryMockMarketDataProvider(500);

async function fetchCandles(timeframe: Timeframe, count: number) {
  const stepMs = timeframe === "15m" ? 15 * 60_000 : 5 * 60_000;
  const to = new Date("2024-06-20T20:00:00.000Z");
  const from = new Date(to.getTime() - stepMs * count);
  const result = await provider.getHistoricalCandles({
    market: "SP500",
    timeframe,
    from: from.toISOString(),
    to: to.toISOString(),
  });
  if (!result.ok) throw new Error(`mock provider failed: ${result.error.message}`);
  return result.value;
}

const STRATEGY_TIMEFRAMES: Array<[string, Timeframe]> = [
  ["trend-following", "15m"],
  ["breakout", "15m"],
  ["vwap", "15m"],
  ["mean-reversion", "15m"],
  ["opening-range-breakout", "5m"],
];

describe("Backtesting Engine integration (synthetic SPY-like candles, no broker/network)", () => {
  it("runs candles -> full event-driven backtest -> a coherent BacktestRun + metrics, for each of the 5 registered strategies", async () => {
    const engine = createEventDrivenBacktestEngine(getDefaultStrategyManager());

    for (const [strategyId, timeframe] of STRATEGY_TIMEFRAMES) {
      const candles = await fetchCandles(timeframe, 300);
      const config: BacktestConfig = {
        name: `integration-${strategyId}`,
        market: "SP500",
        timeframe,
        mode: "SINGLE_STRATEGY",
        strategyIds: [strategyId],
        dateFrom: candles[0].timestamp,
        dateTo: candles[candles.length - 1].timestamp,
        initialCapital: 10_000,
        riskPerTradePct: 0.5,
        commission: 0,
        slippage: 0,
        costs: ZERO_COST_BASELINE,
        sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
      };

      const run = engine.run(config, candles);

      expect(run.status).toBe("COMPLETED");
      expect(run.metrics).toBeDefined();
      expect(run.metrics!.totalTrades).toBe(run.trades.length);
      expect(run.metrics!.sampleQuality).toBe(classifySampleQuality(run.trades.length));
      expect(Number.isFinite(run.metrics!.netProfit)).toBe(true);
      expect(Number.isFinite(run.metrics!.maxDrawdownPct)).toBe(true);

      for (const trade of run.trades) {
        expect(trade.strategyId).toBe(strategyId);
        expect(["BUY", "SELL"]).toContain(trade.direction);
        expect(Number.isFinite(trade.pnlAmount)).toBe(true);
        expect(Number.isFinite(trade.pnlR)).toBe(true);
        expect(trade.exitReason).toBeDefined();
        expect(new Date(trade.exitAt!).getTime()).toBeGreaterThanOrEqual(new Date(trade.entryAt).getTime());
      }
    }
  }, 30_000);
});
