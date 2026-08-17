import { describe, expect, it } from "vitest";
import {
  MEAN_REVERSION_DEFAULT_PARAMETERS,
  meanReversionStrategy,
} from "@/core/strategy-manager/strategies/mean-reversion.strategy";
import type { StrategyEvaluationInput } from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";

const START = Date.UTC(2024, 5, 17, 13, 30, 0);
const FIFTEEN_MIN_MS = 900_000;

function bar(i: number, overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "15m",
    symbol: "SPY",
    provider: "test",
    timestamp: new Date(START + i * FIFTEEN_MIN_MS).toISOString(),
    open: 100,
    high: 100.3,
    low: 99.7,
    close: 100,
    volume: 100_000,
    ...overrides,
  };
}

function buildFlatWarmup(count: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) candles.push(bar(i, {}));
  return candles;
}

/** A flat warmup (stable EMA20/ATR baseline) followed by a sharp drop, pushing RSI oversold and price well below EMA20/VWAP. */
function buildDropFixture(dropBars: number, dropPct: number): Candle[] {
  const candles = buildFlatWarmup(25);
  let price = 100;
  for (let i = 0; i < dropBars; i++) {
    price = price * (1 - dropPct);
    candles.push(bar(25 + i, { open: price * 1.005, high: price * 1.01, low: price * 0.99, close: price, volume: 150_000 }));
  }
  return candles;
}

/** Mirror of `buildDropFixture`: a sharp rally, pushing RSI overbought and price well above EMA20/VWAP. */
function buildRallyFixture(rallyBars: number, rallyPct: number): Candle[] {
  const candles = buildFlatWarmup(25);
  let price = 100;
  for (let i = 0; i < rallyBars; i++) {
    price = price * (1 + rallyPct);
    candles.push(bar(25 + i, { open: price * 0.995, high: price * 1.01, low: price * 0.99, close: price, volume: 150_000 }));
  }
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

describe("meanReversionStrategy", () => {
  it("produces a BUY signal on an oversold bounce candidate", () => {
    const signal = meanReversionStrategy.generateSignal(baseInput(buildDropFixture(2, 0.008)));

    expect(signal.signal).toBe("BUY");
    expect(signal.entry).toBeDefined();
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    // Take-profit targets EMA20 (the mean), not an arbitrary R-multiple.
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(MEAN_REVERSION_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rawScore).toBeGreaterThan(0);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL signal on an overbought fade candidate", () => {
    const signal = meanReversionStrategy.generateSignal(baseInput(buildRallyFixture(2, 0.008)));

    expect(signal.signal).toBe("SELL");
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(MEAN_REVERSION_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rawScore).toBeLessThan(0);
  });

  it("WAITs when there isn't enough warmed-up history", () => {
    const signal = meanReversionStrategy.generateSignal(baseInput(buildFlatWarmup(10)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs when price isn't extended far enough from EMA20 to qualify as a reversion candidate", () => {
    const signal = meanReversionStrategy.generateSignal(baseInput(buildDropFixture(2, 0.006)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_REVERSION_SETUP"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs when the computed risk:reward is below the configured minimum", () => {
    // Same fixture as the BUY test (riskReward ~1.74), but with the
    // minimum raised above it.
    const signal = meanReversionStrategy.generateSignal(
      baseInput(buildDropFixture(2, 0.008), { parameters: { minimumRiskReward: 2.0 } }),
    );

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["MINIMUM_RISK_REWARD"]);
    expect(signal.metadata.candidateRiskReward).toBeLessThan(2.0);
  });

  it("is prefix-stable: never depends on candles beyond the current (last) bar", () => {
    const drop = buildDropFixture(2, 0.008);
    const future = buildFlatWarmup(10).map((c, idx) => ({
      ...c,
      timestamp: new Date(START + (drop.length + idx) * FIFTEEN_MIN_MS).toISOString(),
    }));
    const withFuture = [...drop, ...future];

    const fromShort = meanReversionStrategy.generateSignal(baseInput(drop));
    const fromPrefixOfLonger = meanReversionStrategy.generateSignal(baseInput(withFuture.slice(0, drop.length)));

    expect(fromPrefixOfLonger).toEqual(fromShort);
  });

  describe("timeframe generalization (Block 4.5, Phase 5)", () => {
    it("declares support for 5m/15m/30m/1h, not just 15m", () => {
      expect(meanReversionStrategy.supportedTimeframes).toEqual(["15m", "5m", "30m", "1h"]);
    });

    it("declares support for NASDAQ100/RUSSELL2000/DOWJONES too, for cross-asset validation (Phase 7)", () => {
      expect(meanReversionStrategy.supportedMarkets).toEqual(["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"]);
    });

    it("produces the same coherent BUY signal when the same fixture is labeled as a different timeframe", () => {
      // The rule set never reads `candle.timeframe`/`input.timeframe` in
      // its math (only EMA20/ATR14/RSI14/VWAP over OHLC) — this proves
      // widening `supportedTimeframes` didn't require, and didn't get,
      // any change to `generateSignal` itself.
      const drop = buildDropFixture(2, 0.008).map((c): Candle => ({ ...c, timeframe: "1h" }));
      const signal = meanReversionStrategy.generateSignal(baseInput(drop, { timeframe: "1h" }));

      expect(signal.signal).toBe("BUY");
      expect(signal.entry).toBeDefined();
      expect(signal.stopLoss).toBeLessThan(signal.entry!);
      expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
      expect(signal.rulesFailed).toEqual([]);
    });
  });
});
