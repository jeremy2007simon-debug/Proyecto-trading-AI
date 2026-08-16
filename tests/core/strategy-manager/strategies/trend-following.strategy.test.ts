import { describe, expect, it } from "vitest";
import {
  TREND_FOLLOWING_DEFAULT_PARAMETERS,
  trendFollowingStrategy,
} from "@/core/strategy-manager/strategies/trend-following.strategy";
import type { StrategyEvaluationInput } from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";

function bar(i: number, overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "15m",
    symbol: "SPY",
    provider: "test",
    timestamp: new Date(Date.UTC(2024, 5, 17, 13, 30, 0) + i * 900_000).toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 100_000,
    ...overrides,
  };
}

/** Same geometric (constant %) construction validated in the regime detector tests. */
function buildTrendCandles(count: number, direction: 1 | -1, startPrice = 500, startIndex = 0): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const stepPct = 0.004;
  const rangePct = 0.004;
  for (let i = 0; i < count; i++) {
    const rangeAbs = price * rangePct;
    const low = price;
    const high = price + rangeAbs;
    const close = (high + low) / 2;
    const open = close - direction * rangeAbs * 0.1;
    candles.push(bar(startIndex + i, { open, high, low, close, volume: 100_000 + (i % 5) * 1000 }));
    price = price * (1 + direction * stepPct);
  }
  return candles;
}

function buildRangeCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + (i % 2 === 0 ? 0.2 : -0.2);
    candles.push(bar(i, { open: 100, high: 100.6, low: 99.4, close, volume: 100_000 }));
  }
  return candles;
}

function baseInput(candles: Candle[], overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "SP500",
    timeframe: "15m",
    candles,
    indicators: {},
    marketRegime: "STRONG_UPTREND",
    parameters: {},
    ...overrides,
  };
}

describe("trendFollowingStrategy", () => {
  it("produces a BUY signal for a strong, sustained uptrend with valid risk:reward", () => {
    const signal = trendFollowingStrategy.generateSignal(baseInput(buildTrendCandles(220, 1)));

    expect(signal.signal).toBe("BUY");
    expect(signal.entry).toBeDefined();
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(TREND_FOLLOWING_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rawScore).toBeGreaterThan(0);
    expect(signal.rulesFailed).toEqual([]);
    expect(signal.strategyVersion).toBe("1.0.0");
  });

  it("produces a SELL signal for a strong, sustained downtrend with valid risk:reward", () => {
    const signal = trendFollowingStrategy.generateSignal(
      baseInput(buildTrendCandles(220, -1), { marketRegime: "STRONG_DOWNTREND" }),
    );

    expect(signal.signal).toBe("SELL");
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(TREND_FOLLOWING_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rawScore).toBeLessThan(0);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("WAITs when there isn't enough warmed-up history for EMA200", () => {
    const signal = trendFollowingStrategy.generateSignal(baseInput(buildTrendCandles(50, 1)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs when there is no clear, aligned trend setup", () => {
    const signal = trendFollowingStrategy.generateSignal(
      baseInput(buildRangeCandles(220), { marketRegime: "RANGE" }),
    );

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_TREND_SETUP"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs when the computed risk:reward is below the configured minimum", () => {
    const signal = trendFollowingStrategy.generateSignal(
      baseInput(buildTrendCandles(220, 1), { parameters: { takeProfitRMultiple: 1.0 } }),
    );

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["MINIMUM_RISK_REWARD"]);
    expect(signal.entry).toBeUndefined();
    expect(signal.metadata.candidateRiskReward).toBeCloseTo(1.0, 5);
    expect(signal.metadata.candidateEntry).toBeDefined();
  });

  it("is prefix-stable: never depends on candles beyond the current (last) bar", () => {
    const fullHistory = buildTrendCandles(220, 1);
    const lastPrice = fullHistory[fullHistory.length - 1].close;
    const futureCrash = buildTrendCandles(30, -1, lastPrice, fullHistory.length);
    const withFutureCrash = [...fullHistory, ...futureCrash];

    const fromFullHistory = trendFollowingStrategy.generateSignal(baseInput(fullHistory));
    const fromPrefixOfLonger = trendFollowingStrategy.generateSignal(
      baseInput(withFutureCrash.slice(0, fullHistory.length)),
    );

    expect(fromPrefixOfLonger).toEqual(fromFullHistory);
  });
});
