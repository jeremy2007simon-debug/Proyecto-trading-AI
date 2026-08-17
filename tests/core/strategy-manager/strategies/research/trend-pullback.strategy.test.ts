import { describe, expect, it } from "vitest";
import {
  TREND_PULLBACK_DEFAULT_PARAMETERS,
  trendPullbackStrategy,
} from "@/core/strategy-manager/strategies/research/trend-pullback.strategy";
import type { StrategyEvaluationInput } from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";

function bar(i: number, overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "1h",
    symbol: "SPY",
    provider: "test",
    timestamp: new Date(Date.UTC(2024, 0, 1, 0, 0, 0) + i * 3_600_000).toISOString(),
    open: 100,
    high: 100.6,
    low: 99.4,
    close: 100,
    volume: 100_000,
    ...overrides,
  };
}

/** A strictly monotonic trend — close[i] > close[i-1] (or < for direction -1) at every bar, so a "bullish/bearish re-entry" condition (close beat the prior bar AND beat EMA20) holds structurally throughout. */
function buildMonotonicTrendCandles(count: number, direction: 1 | -1): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + direction * i * 0.3;
    candles.push(bar(i, { open: close - direction * 0.2, high: close + 0.3, low: close - 0.3, close }));
  }
  return candles;
}

function baseInput(candles: Candle[], overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "SP500",
    timeframe: "1h",
    candles,
    indicators: {},
    marketRegime: "UPTREND",
    parameters: {},
    ...overrides,
  };
}

describe("trendPullbackStrategy", () => {
  it("produces a BUY signal on an established uptrend with a qualifying pullback depth", () => {
    // A generous pullbackDepthAtrMultiple isolates the re-entry logic from
    // the exact steady-state EMA50 distance of this synthetic trend (which
    // has its own dedicated negative test below).
    const signal = trendPullbackStrategy.generateSignal(
      baseInput(buildMonotonicTrendCandles(250, 1), { parameters: { pullbackDepthAtrMultiple: 20 } }),
    );

    expect(signal.signal).toBe("BUY");
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(TREND_PULLBACK_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL signal on an established downtrend with a qualifying pullback depth", () => {
    const signal = trendPullbackStrategy.generateSignal(
      baseInput(buildMonotonicTrendCandles(250, -1), {
        marketRegime: "DOWNTREND",
        parameters: { pullbackDepthAtrMultiple: 20 },
      }),
    );

    expect(signal.signal).toBe("SELL");
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
  });

  it("WAITs when there isn't enough history for EMA200", () => {
    const signal = trendPullbackStrategy.generateSignal(baseInput(buildMonotonicTrendCandles(100, 1)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
  });

  it("WAITs when price hasn't pulled back close enough to EMA50", () => {
    const signal = trendPullbackStrategy.generateSignal(
      baseInput(buildMonotonicTrendCandles(250, 1), { parameters: { pullbackDepthAtrMultiple: 0.0001 } }),
    );

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_PULLBACK_SETUP"]);
  });

  it("is prefix-stable: never depends on candles beyond the current (last) bar", () => {
    const trend = buildMonotonicTrendCandles(250, 1);
    const fromShort = trendPullbackStrategy.generateSignal(
      baseInput(trend, { parameters: { pullbackDepthAtrMultiple: 20 } }),
    );
    const fromPrefixOfLonger = trendPullbackStrategy.generateSignal(
      baseInput([...trend, ...buildMonotonicTrendCandles(10, -1)].slice(0, trend.length), {
        parameters: { pullbackDepthAtrMultiple: 20 },
      }),
    );

    expect(fromPrefixOfLonger).toEqual(fromShort);
  });

  it("declares its Block 5 research metadata", () => {
    expect(trendPullbackStrategy.family).toBe("PULLBACK_TREND");
    expect(trendPullbackStrategy.status).toBe("ACTIVE_RESEARCH");
    expect(trendPullbackStrategy.supportedTimeframes).toEqual(["1h"]);
  });
});
