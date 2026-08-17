import { describe, expect, it } from "vitest";
import {
  PAIRS_SPREAD_REVERSION_DEFAULT_PARAMETERS,
  pairsSpreadReversionStrategy,
} from "@/core/strategy-manager/strategies/research/pairs-spread-reversion.strategy";
import type { StrategyEvaluationInput } from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";

/** Synthetic ratio "candle": open=high=low=close=ratio, volume=0 — the exact construction the calling research script uses for a real pair. */
function ratioBar(i: number, value: number): Candle {
  return {
    market: "SP500",
    timeframe: "15m",
    symbol: "SPY/QQQ",
    provider: "test",
    timestamp: new Date(Date.UTC(2024, 5, 17, 13, 30, 0) + i * 900_000).toISOString(),
    open: value,
    high: value,
    low: value,
    close: value,
    volume: 0,
  };
}

/** 59 bars flat at 2.0, then a single outlier bar — the rolling window (inclusive of the current bar) makes the outlier extreme relative to the near-zero-variance baseline. */
function buildFlatWithOutlier(outlierValue: number, count = 60): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count - 1; i++) candles.push(ratioBar(i, 2.0));
  candles.push(ratioBar(count - 1, outlierValue));
  return candles;
}

/** Small, symmetric alternating noise around 2.0 — no bar is extended relative to the others. */
function buildFlatNoisyCandles(count = 60): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) candles.push(ratioBar(i, 2.0 + (i % 2 === 0 ? 0.001 : -0.001)));
  return candles;
}

function baseInput(candles: Candle[], overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "SP500",
    timeframe: "15m",
    candles,
    indicators: {},
    marketRegime: "RANGE",
    parameters: {},
    ...overrides,
  };
}

describe("pairsSpreadReversionStrategy", () => {
  it("produces a BUY signal when the ratio is oversold (z-score far below the negative threshold)", () => {
    const signal = pairsSpreadReversionStrategy.generateSignal(baseInput(buildFlatWithOutlier(1.9)));

    expect(signal.signal).toBe("BUY");
    expect(signal.entry).toBe(1.9);
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(PAIRS_SPREAD_REVERSION_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL signal when the ratio is overbought (z-score far above the positive threshold)", () => {
    const signal = pairsSpreadReversionStrategy.generateSignal(baseInput(buildFlatWithOutlier(2.1)));

    expect(signal.signal).toBe("SELL");
    expect(signal.entry).toBe(2.1);
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
  });

  it("targets the rolling mean, not an arbitrary R-multiple", () => {
    const signal = pairsSpreadReversionStrategy.generateSignal(baseInput(buildFlatWithOutlier(1.9)));

    expect(signal.takeProfit).toBeCloseTo(signal.metadata.rollingMean as number, 6);
  });

  it("WAITs when there isn't enough history for the z-score window", () => {
    const signal = pairsSpreadReversionStrategy.generateSignal(baseInput(buildFlatWithOutlier(1.9, 30)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
  });

  it("WAITs when the ratio hasn't stretched far enough from its rolling mean", () => {
    const signal = pairsSpreadReversionStrategy.generateSignal(baseInput(buildFlatNoisyCandles()));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_SPREAD_EXTENSION"]);
  });

  it("WAITs when the computed risk:reward is below the configured minimum", () => {
    const signal = pairsSpreadReversionStrategy.generateSignal(
      baseInput(buildFlatWithOutlier(1.9), { parameters: { minimumRiskReward: 10 } }),
    );

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["MINIMUM_RISK_REWARD"]);
  });

  it("declares its Block 5 research metadata", () => {
    expect(pairsSpreadReversionStrategy.family).toBe("PAIRS_RELATIVE_VALUE");
    expect(pairsSpreadReversionStrategy.status).toBe("ACTIVE_RESEARCH");
    expect(pairsSpreadReversionStrategy.supportedTimeframes).toEqual(["15m"]);
  });
});
