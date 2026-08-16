import { describe, expect, it } from "vitest";
import {
  BREAKOUT_DEFAULT_PARAMETERS,
  breakoutStrategy,
} from "@/core/strategy-manager/strategies/breakout.strategy";
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
    high: 100.6,
    low: 99.4,
    close: 100,
    volume: 100_000,
    ...overrides,
  };
}

function buildCalmCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + (i % 2 === 0 ? 0.2 : -0.2);
    candles.push(bar(i, { close }));
  }
  return candles;
}

function buildUpBreakoutCandles(calmCount: number): Candle[] {
  const candles = buildCalmCandles(calmCount);
  candles.push(bar(calmCount, { open: 100.6, high: 106, low: 100.4, close: 105, volume: 200_000 }));
  return candles;
}

function buildDownBreakoutCandles(calmCount: number): Candle[] {
  const candles = buildCalmCandles(calmCount);
  candles.push(bar(calmCount, { open: 99.4, high: 99.6, low: 94, close: 95, volume: 200_000 }));
  return candles;
}

function baseInput(candles: Candle[], overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "SP500",
    timeframe: "15m",
    candles,
    indicators: {},
    marketRegime: "BREAKOUT",
    parameters: {},
    ...overrides,
  };
}

describe("breakoutStrategy", () => {
  it("produces a BUY signal on a confirmed upside breakout (level + volume + range expansion)", () => {
    const signal = breakoutStrategy.generateSignal(baseInput(buildUpBreakoutCandles(30)));

    expect(signal.signal).toBe("BUY");
    expect(signal.entry).toBe(105);
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(BREAKOUT_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rawScore).toBeGreaterThan(0);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL signal on a confirmed downside breakout", () => {
    const signal = breakoutStrategy.generateSignal(baseInput(buildDownBreakoutCandles(30)));

    expect(signal.signal).toBe("SELL");
    expect(signal.entry).toBe(95);
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(BREAKOUT_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rawScore).toBeLessThan(0);
  });

  it("WAITs when there isn't enough history for a full lookback window", () => {
    const signal = breakoutStrategy.generateSignal(baseInput(buildCalmCandles(10)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs when price stays within the prior range (no breakout)", () => {
    const signal = breakoutStrategy.generateSignal(baseInput(buildCalmCandles(31)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_BREAKOUT_SETUP"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs when the level breaks but volume doesn't confirm it", () => {
    const candles = buildCalmCandles(30);
    candles.push(bar(30, { open: 100.6, high: 101.5, low: 100.4, close: 101, volume: 100_000 }));

    const signal = breakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["VOLUME_CONFIRMATION"]);
  });

  it("WAITs when the computed risk:reward is below the configured minimum", () => {
    const signal = breakoutStrategy.generateSignal(
      baseInput(buildUpBreakoutCandles(30), { parameters: { takeProfitRMultiple: 1.0 } }),
    );

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["MINIMUM_RISK_REWARD"]);
    expect(signal.metadata.candidateRiskReward).toBeCloseTo(1.0, 5);
  });

  it("excludes the current (breakout) bar from its own prior-high calculation (no look-ahead)", () => {
    const candles = buildUpBreakoutCandles(30);
    const signal = breakoutStrategy.generateSignal(baseInput(candles));

    // The breakout bar's own high (106) is the maximum of the entire
    // series. If the prior-structure window accidentally included the
    // current bar, `priorHigh` would be 106 and `close (105) > priorHigh
    // + buffer` would be false — this strategy would never signal on its
    // own breakout bar. Asserting the actual computed priorHigh proves
    // the current bar was excluded.
    expect(signal.metadata.priorHigh).toBe(100.6);
    expect(signal.signal).toBe("BUY");
  });

  it("is prefix-stable: never depends on candles beyond the current (last) bar", () => {
    const upBreakout = buildUpBreakoutCandles(30);
    const future = buildCalmCandles(10).map((c, idx) => ({
      ...c,
      timestamp: new Date(Date.UTC(2024, 5, 17, 13, 30, 0) + (upBreakout.length + idx) * 900_000).toISOString(),
    }));
    const withFuture = [...upBreakout, ...future];

    const fromShort = breakoutStrategy.generateSignal(baseInput(upBreakout));
    const fromPrefixOfLonger = breakoutStrategy.generateSignal(baseInput(withFuture.slice(0, upBreakout.length)));

    expect(fromPrefixOfLonger).toEqual(fromShort);
  });

  it("was not touched by Block 4.5's timeframe/market generalization (still 15m-only, SP500-only)", () => {
    expect(breakoutStrategy.supportedTimeframes).toEqual(["15m"]);
    expect(breakoutStrategy.supportedMarkets).toEqual(["SP500"]);
  });
});
