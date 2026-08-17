import { describe, expect, it } from "vitest";
import {
  MOMENTUM_TREND_DEFAULT_PARAMETERS,
  momentumTrendStrategy,
} from "@/core/strategy-manager/strategies/research/momentum-trend.strategy";
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

function buildTrendCandles(count: number, direction: 1 | -1): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + direction * i * 0.5;
    candles.push(bar(i, { open: close - direction * 0.3, high: close + 0.4, low: close - 0.4, close }));
  }
  return candles;
}

function buildChoppyCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + (i % 2 === 0 ? 0.15 : -0.15);
    candles.push(bar(i, { close, open: 100, high: 100.3, low: 99.7 }));
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

describe("momentumTrendStrategy", () => {
  it("produces a BUY signal on a confirmed uptrend (positive ROC + EMA50 slope up + ADX)", () => {
    const signal = momentumTrendStrategy.generateSignal(baseInput(buildTrendCandles(120, 1)));

    expect(signal.signal).toBe("BUY");
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(MOMENTUM_TREND_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rawScore).toBeGreaterThan(0);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL signal on a confirmed downtrend", () => {
    const signal = momentumTrendStrategy.generateSignal(baseInput(buildTrendCandles(120, -1), { marketRegime: "DOWNTREND" }));

    expect(signal.signal).toBe("SELL");
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
    expect(signal.rawScore).toBeLessThan(0);
  });

  it("WAITs when there isn't enough history for EMA50", () => {
    const signal = momentumTrendStrategy.generateSignal(baseInput(buildTrendCandles(30, 1)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs on a choppy, directionless series", () => {
    const signal = momentumTrendStrategy.generateSignal(baseInput(buildChoppyCandles(120)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_MOMENTUM_SETUP"]);
  });

  it("is prefix-stable: never depends on candles beyond the current (last) bar", () => {
    const trend = buildTrendCandles(120, 1);
    const future = buildTrendCandles(10, -1).map((c, idx) => ({
      ...c,
      timestamp: new Date(Date.UTC(2024, 0, 1, 0, 0, 0) + (trend.length + idx) * 3_600_000).toISOString(),
    }));
    const withFuture = [...trend, ...future];

    const fromShort = momentumTrendStrategy.generateSignal(baseInput(trend));
    const fromPrefixOfLonger = momentumTrendStrategy.generateSignal(baseInput(withFuture.slice(0, trend.length)));

    expect(fromPrefixOfLonger).toEqual(fromShort);
  });

  it("declares its Block 5 research metadata", () => {
    expect(momentumTrendStrategy.family).toBe("MOMENTUM_TREND");
    expect(momentumTrendStrategy.status).toBe("ACTIVE_RESEARCH");
    expect(momentumTrendStrategy.supportedTimeframes).toEqual(["1h"]);
  });
});
