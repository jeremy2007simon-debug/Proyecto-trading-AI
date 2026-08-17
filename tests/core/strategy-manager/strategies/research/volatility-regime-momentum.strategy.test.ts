import { describe, expect, it } from "vitest";
import {
  VOLATILITY_REGIME_MOMENTUM_DEFAULT_PARAMETERS,
  volatilityRegimeMomentumStrategy,
} from "@/core/strategy-manager/strategies/research/volatility-regime-momentum.strategy";
import type { StrategyEvaluationInput } from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";

function bar(i: number, overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "30m",
    symbol: "SPY",
    provider: "test",
    timestamp: new Date(Date.UTC(2024, 0, 1, 0, 0, 0) + i * 1_800_000).toISOString(),
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
    const close = 100 + direction * i * 0.6;
    candles.push(bar(i, { open: close - direction * 0.4, high: close + 0.5, low: close - 0.5, close }));
  }
  return candles;
}

function buildChoppyCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + (i % 2 === 0 ? 0.1 : -0.1);
    candles.push(bar(i, { close, open: 100, high: 100.2, low: 99.8 }));
  }
  return candles;
}

function baseInput(candles: Candle[], overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "SP500",
    timeframe: "30m",
    candles,
    indicators: {},
    marketRegime: "HIGH_VOLATILITY",
    parameters: {},
    ...overrides,
  };
}

describe("volatilityRegimeMomentumStrategy", () => {
  it("produces a BUY signal on confirmed directional momentum (ADX + DI)", () => {
    const signal = volatilityRegimeMomentumStrategy.generateSignal(baseInput(buildTrendCandles(60, 1)));

    expect(signal.signal).toBe("BUY");
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(VOLATILITY_REGIME_MOMENTUM_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL signal on confirmed bearish directional momentum", () => {
    const signal = volatilityRegimeMomentumStrategy.generateSignal(baseInput(buildTrendCandles(60, -1)));

    expect(signal.signal).toBe("SELL");
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
  });

  it("WAITs when there isn't enough history for ADX14", () => {
    const signal = volatilityRegimeMomentumStrategy.generateSignal(baseInput(buildTrendCandles(20, 1)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
  });

  it("WAITs when ADX is too weak to confirm directional momentum", () => {
    const signal = volatilityRegimeMomentumStrategy.generateSignal(baseInput(buildChoppyCandles(60)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_DIRECTIONAL_MOMENTUM"]);
  });

  it("only declares HIGH_VOLATILITY as a compatible regime — reuses the engine's own regime gate, no new regime code", () => {
    expect(volatilityRegimeMomentumStrategy.compatibleRegimes).toEqual(["HIGH_VOLATILITY"]);
  });

  it("declares its Block 5 research metadata", () => {
    expect(volatilityRegimeMomentumStrategy.family).toBe("VOLATILITY_REGIME");
    expect(volatilityRegimeMomentumStrategy.status).toBe("ACTIVE_RESEARCH");
    expect(volatilityRegimeMomentumStrategy.supportedTimeframes).toEqual(["30m"]);
  });
});
