import { describe, expect, it } from "vitest";
import {
  VOLATILITY_COMPRESSION_BREAKOUT_DEFAULT_PARAMETERS,
  volatilityCompressionBreakoutStrategy,
} from "@/core/strategy-manager/strategies/research/volatility-compression-breakout.strategy";
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

/**
 * 90 bars of a wide-range baseline, then 20 bars that are either
 * compressed (tight range, `opts.compressed`) or continue the wide
 * range, then a final bar that either breaks out (`opts.breakout`) or
 * stays inside the range, with volume that either confirms
 * (`opts.volumeConfirmed`) or doesn't.
 */
function buildScenario(opts: { direction: 1 | -1; compressed: boolean; breakout: boolean; volumeConfirmed: boolean }): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < 90; i++) {
    const close = 100 + (i % 2 === 0 ? 0.5 : -0.5);
    candles.push(bar(i, { open: 100, high: close + 1.5, low: close - 1.5, close, volume: 100_000 }));
  }
  for (let i = 90; i < 110; i++) {
    const close = opts.compressed ? 100 + (i % 2 === 0 ? 0.05 : -0.05) : 100 + (i % 2 === 0 ? 0.5 : -0.5);
    const range = opts.compressed ? 0.1 : 1.5;
    candles.push(bar(i, { open: 100, high: close + range, low: close - range, close, volume: 100_000 }));
  }
  const lastClose = opts.breakout ? (opts.direction === 1 ? 105 : 95) : 100 + (opts.compressed ? 0.02 : 0.5);
  const lastOpen = opts.compressed ? 100.02 : 100;
  const lastRange = opts.compressed ? 0.1 : 1.5;
  candles.push(
    bar(110, {
      open: lastOpen,
      high: Math.max(lastOpen, lastClose) + lastRange,
      low: Math.min(lastOpen, lastClose) - lastRange,
      close: lastClose,
      volume: opts.volumeConfirmed ? 300_000 : 100_000,
    }),
  );
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

describe("volatilityCompressionBreakoutStrategy", () => {
  it("produces a BUY signal on a compression-then-expansion upside breakout", () => {
    const candles = buildScenario({ direction: 1, compressed: true, breakout: true, volumeConfirmed: true });
    const signal = volatilityCompressionBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("BUY");
    expect(signal.entry).toBe(105);
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(VOLATILITY_COMPRESSION_BREAKOUT_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL signal on a compression-then-expansion downside breakout", () => {
    const candles = buildScenario({ direction: -1, compressed: true, breakout: true, volumeConfirmed: true });
    const signal = volatilityCompressionBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("SELL");
    expect(signal.entry).toBe(95);
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
  });

  it("WAITs when there isn't enough history for the ATR percentile baseline", () => {
    const candles = buildScenario({ direction: 1, compressed: true, breakout: true, volumeConfirmed: true }).slice(0, 50);
    const signal = volatilityCompressionBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
  });

  it("WAITs when the breakout wasn't preceded by genuine ATR compression", () => {
    const candles = buildScenario({ direction: 1, compressed: false, breakout: true, volumeConfirmed: true });
    const signal = volatilityCompressionBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NOT_COMPRESSED"]);
  });

  it("WAITs when compression holds but price hasn't broken the prior range", () => {
    const candles = buildScenario({ direction: 1, compressed: true, breakout: false, volumeConfirmed: true });
    const signal = volatilityCompressionBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_BREAKOUT_SETUP"]);
  });

  it("WAITs when the breakout isn't confirmed by volume", () => {
    const candles = buildScenario({ direction: 1, compressed: true, breakout: true, volumeConfirmed: false });
    const signal = volatilityCompressionBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["VOLUME_CONFIRMATION"]);
  });

  it("checks compression on the bar BEFORE the breakout, never the breakout bar itself (no look-ahead)", () => {
    const candles = buildScenario({ direction: 1, compressed: true, breakout: true, volumeConfirmed: true });
    const signal = volatilityCompressionBreakoutStrategy.generateSignal(baseInput(candles));

    // The breakout bar's own true range is huge (it jumped from ~100 to
    // 105) — if the compression check accidentally used the breakout
    // bar's own ATR percentile instead of the prior bar's, it would never
    // classify as compressed and this would WAIT, not BUY.
    expect(signal.signal).toBe("BUY");
    expect(signal.metadata.atrPercentilePrior).toBeLessThanOrEqual(
      VOLATILITY_COMPRESSION_BREAKOUT_DEFAULT_PARAMETERS.compressionPercentileThreshold,
    );
  });

  it("excludes the current (breakout) bar from its own prior-structure window", () => {
    const candles = buildScenario({ direction: 1, compressed: true, breakout: true, volumeConfirmed: true });
    const signal = volatilityCompressionBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.metadata.priorHigh).toBeLessThan(101);
  });

  it("declares its Block 5 research metadata", () => {
    expect(volatilityCompressionBreakoutStrategy.family).toBe("VOLATILITY_BREAKOUT");
    expect(volatilityCompressionBreakoutStrategy.status).toBe("ACTIVE_RESEARCH");
    expect(volatilityCompressionBreakoutStrategy.supportedTimeframes).toEqual(["15m"]);
  });
});
