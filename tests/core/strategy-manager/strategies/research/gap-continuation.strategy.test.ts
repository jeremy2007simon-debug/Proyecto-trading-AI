import { describe, expect, it } from "vitest";
import {
  GAP_CONTINUATION_DEFAULT_PARAMETERS,
  gapContinuationStrategy,
} from "@/core/strategy-manager/strategies/research/gap-continuation.strategy";
import type { StrategyEvaluationInput } from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";

function bar(i: number, overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "1d",
    symbol: "SPY",
    provider: "test",
    timestamp: new Date(Date.UTC(2024, 0, 1, 0, 0, 0) + i * 86_400_000).toISOString(),
    open: 100,
    high: 100.6,
    low: 99.4,
    close: 100,
    volume: 1_000_000,
    ...overrides,
  };
}

function buildFlatDailyCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + (i % 2 === 0 ? 0.3 : -0.3);
    candles.push(bar(i, { open: 100, high: close + 0.6, low: close - 0.6, close }));
  }
  return candles;
}

function appendGapDay(base: Candle[], gapPct: number, continues: boolean): Candle[] {
  const priorClose = base[base.length - 1].close;
  const open = priorClose * (1 + gapPct / 100);
  const close = continues ? open * (1 + Math.sign(gapPct) * 0.005) : open;
  return [
    ...base,
    bar(base.length, {
      open,
      high: Math.max(open, close) + 0.3,
      low: Math.min(open, close) - 0.3,
      close,
    }),
  ];
}

function baseInput(candles: Candle[], overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "SP500",
    timeframe: "1d",
    candles,
    indicators: {},
    marketRegime: "BREAKOUT",
    parameters: {},
    ...overrides,
  };
}

describe("gapContinuationStrategy", () => {
  it("produces a BUY signal on a qualifying upside gap", () => {
    const candles = appendGapDay(buildFlatDailyCandles(20), 1.0, true);
    const signal = gapContinuationStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("BUY");
    expect(signal.entry).toBe(candles[candles.length - 1].close);
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(GAP_CONTINUATION_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL signal on a qualifying downside gap", () => {
    const candles = appendGapDay(buildFlatDailyCandles(20), -1.0, true);
    const signal = gapContinuationStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("SELL");
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
  });

  it("WAITs when there isn't enough history for ATR14", () => {
    const candles = appendGapDay(buildFlatDailyCandles(5), 1.0, true);
    const signal = gapContinuationStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
  });

  it("WAITs when the gap doesn't clear the threshold", () => {
    const candles = appendGapDay(buildFlatDailyCandles(20), 0.05, true);
    const signal = gapContinuationStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_GAP_SETUP"]);
  });

  it("WAITs when the computed risk:reward is below the configured minimum", () => {
    const candles = appendGapDay(buildFlatDailyCandles(20), 1.0, true);
    const signal = gapContinuationStrategy.generateSignal(baseInput(candles, { parameters: { takeProfitRMultiple: 0.1 } }));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["MINIMUM_RISK_REWARD"]);
  });

  it("measures the gap against the PRIOR day's close, never the current day's own range", () => {
    const candles = appendGapDay(buildFlatDailyCandles(20), 1.0, true);
    const priorClose = candles[candles.length - 2].close;
    const signal = gapContinuationStrategy.generateSignal(baseInput(candles));

    const expectedGapPct = ((candles[candles.length - 1].open - priorClose) / priorClose) * 100;
    expect(signal.metadata.gapPct).toBeCloseTo(expectedGapPct, 6);
  });

  it("declares its Block 5 research metadata", () => {
    expect(gapContinuationStrategy.family).toBe("GAP_OVERNIGHT");
    expect(gapContinuationStrategy.status).toBe("ACTIVE_RESEARCH");
    expect(gapContinuationStrategy.supportedTimeframes).toEqual(["1d"]);
  });
});
