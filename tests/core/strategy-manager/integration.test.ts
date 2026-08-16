import { describe, expect, it } from "vitest";
import { computeIndicatorSnapshot } from "@/core/indicators";
import { InMemoryMockMarketDataProvider } from "@/core/market-data/testing/mock-market-data-provider";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import { createRuleBasedRegimeDetector } from "@/core/market-regime/rule-based-regime-detector";
import { DEFAULT_MINIMUM_RISK_REWARD } from "@/core/strategy-manager/risk-reward";
import { createInMemoryStrategyManager } from "@/core/strategy-manager/in-memory-strategy-manager";
import { breakoutStrategy } from "@/core/strategy-manager/strategies/breakout.strategy";
import { meanReversionStrategy } from "@/core/strategy-manager/strategies/mean-reversion.strategy";
import { openingRangeBreakoutStrategy } from "@/core/strategy-manager/strategies/opening-range-breakout.strategy";
import { trendFollowingStrategy } from "@/core/strategy-manager/strategies/trend-following.strategy";
import { vwapStrategy } from "@/core/strategy-manager/strategies/vwap.strategy";
import type { StrategySignal } from "@/core/strategy-manager/types";
import type { Timeframe } from "@/core/shared/types";

/**
 * End-to-end test of the full research pipeline for this block, entirely
 * offline: synthetic SPY-like candles (deterministic, no network, no
 * broker) -> Indicators -> Market Regime Detector -> Strategy Manager
 * (all 5 strategies registered) -> per-strategy signals. This is
 * deliberately the SAME shape `getStrategySignals` uses in production,
 * just without the Supabase/Alpaca I/O layer.
 */
const calendar = createNyseCalendar();
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

function buildManager() {
  const manager = createInMemoryStrategyManager();
  manager.register(trendFollowingStrategy);
  manager.register(breakoutStrategy);
  manager.register(vwapStrategy);
  manager.register(meanReversionStrategy);
  manager.register(openingRangeBreakoutStrategy);
  return manager;
}

function assertWellFormedSignal(signal: StrategySignal) {
  expect(["BUY", "SELL", "WAIT"]).toContain(signal.signal);
  expect(signal.strategyVersion).toBe("1.0.0");
  expect(typeof signal.explanation).toBe("string");
  expect(signal.explanation.length).toBeGreaterThan(0);

  if (signal.signal === "WAIT") {
    // WAIT never fabricates a trade.
    expect(signal.entry).toBeUndefined();
    expect(signal.stopLoss).toBeUndefined();
    expect(signal.takeProfit).toBeUndefined();
    expect(signal.riskReward).toBeUndefined();
    expect(signal.rulesFailed.length).toBeGreaterThan(0);
  } else {
    expect(signal.entry).toBeDefined();
    expect(signal.stopLoss).toBeDefined();
    expect(signal.takeProfit).toBeDefined();
    expect(signal.riskReward).toBeGreaterThanOrEqual(DEFAULT_MINIMUM_RISK_REWARD);
  }
}

describe("Strategy Manager integration (synthetic SPY-like candles, no broker/network)", () => {
  it("runs candles -> indicators -> regime -> strategy manager -> 5 strategies -> exactly 5 well-formed signals", async () => {
    // The 4 non-ORB strategies run on 15m; Opening Range Breakout is
    // 5m-only (supportedTimeframes) — mirroring how the real orchestrator
    // (`getStrategySignals`) is called once per timeframe.
    const candles15m = await fetchCandles("15m", 250);
    const indicators15m = computeIndicatorSnapshot(candles15m, calendar);
    const regime15m = createRuleBasedRegimeDetector().detect({
      market: "SP500",
      timeframe: "15m",
      candles: candles15m,
      indicators: indicators15m,
    });

    const candles5m = await fetchCandles("5m", 250);
    const indicators5m = computeIndicatorSnapshot(candles5m, calendar);
    const regime5m = createRuleBasedRegimeDetector().detect({
      market: "SP500",
      timeframe: "5m",
      candles: candles5m,
      indicators: indicators5m,
    });

    const manager = buildManager();
    const signals15m = manager.generateSignals({
      market: "SP500",
      timeframe: "15m",
      candles: candles15m,
      indicators: indicators15m,
      marketRegime: regime15m.regime,
      parameters: {},
    });
    const signals5m = manager.generateSignals({
      market: "SP500",
      timeframe: "5m",
      candles: candles5m,
      indicators: indicators5m,
      marketRegime: regime5m.regime,
      parameters: {},
    });

    const allSignals = [...signals15m, ...signals5m];
    expect(allSignals).toHaveLength(5);
    expect(allSignals.map((s) => s.strategyId).sort()).toEqual([
      "breakout",
      "mean-reversion",
      "opening-range-breakout",
      "trend-following",
      "vwap",
    ]);

    for (const signal of allSignals) assertWellFormedSignal(signal);
  });
});
