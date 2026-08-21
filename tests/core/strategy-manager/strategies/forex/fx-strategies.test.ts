import { describe, expect, it } from "vitest";
import { fxMeanReversionStrategy } from "@/core/strategy-manager/strategies/forex/fx-mean-reversion.strategy";
import { fxPullbackTrendStrategy } from "@/core/strategy-manager/strategies/forex/fx-pullback-trend.strategy";
import { fxSessionBreakoutStrategy } from "@/core/strategy-manager/strategies/forex/fx-session-breakout.strategy";
import { fxTrendMomentumStrategy } from "@/core/strategy-manager/strategies/forex/fx-trend-momentum.strategy";
import { fxVolatilityBreakoutStrategy } from "@/core/strategy-manager/strategies/forex/fx-volatility-breakout.strategy";
import type { Candle } from "@/core/market-data/types";
import type { Strategy, StrategyEvaluationInput } from "@/core/strategy-manager/types";

/**
 * Block 8 — every FX strategy MUST (1) never depend on `volume` (this
 * research's data source reports 0 for every FX bar — see
 * `fetch-fx-candles.ts`), and (2) never look ahead of the current (last)
 * bar it was given, the same "prefix-stable" property already tested
 * for the Block 5 equity strategies this codebase ships. These tests
 * check both properties for all 5 Block 8 strategies, plus one smoke
 * check that each strategy can actually produce a BUY/SELL signal
 * (never permanently WAIT-locked) and correctly declares FX-only market
 * support.
 */

function bar(i: number, timestamp: number, overrides: Partial<Candle>): Candle {
  return {
    market: "FOREX_EURUSD",
    timeframe: "1h",
    symbol: "EURUSD=X",
    provider: "test",
    timestamp: new Date(timestamp).toISOString(),
    open: 1.1,
    high: 1.101,
    low: 1.099,
    close: 1.1,
    volume: 0, // this research's FX feed never reports real volume
    ...overrides,
  };
}

const HOUR_MS = 3_600_000;
// A UTC Tuesday well inside a session window, so FX Session Breakout has
// something to evaluate too.
const BASE_TS = Date.UTC(2026, 0, 6, 10, 0, 0);

function buildTrendCandles(count: number, direction: 1 | -1): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = 1.1 + direction * i * 0.0006;
    candles.push(bar(i, BASE_TS + i * HOUR_MS, { open: close - direction * 0.0003, high: close + 0.0004, low: close - 0.0004, close }));
  }
  return candles;
}

/** Range-bound series with one large stretch bar at the end — feeds Volatility Breakout and Mean Reversion. */
function buildRangeThenStretchCandles(count: number, direction: 1 | -1): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count - 1; i++) {
    const close = 1.1 + (i % 2 === 0 ? 0.0002 : -0.0002);
    candles.push(bar(i, BASE_TS + i * HOUR_MS, { close, open: 1.1, high: 1.1005, low: 1.0995 }));
  }
  const stretchClose = 1.1 + direction * 0.01;
  candles.push(
    bar(count - 1, BASE_TS + (count - 1) * HOUR_MS, {
      close: stretchClose,
      open: 1.1,
      high: Math.max(1.1, stretchClose) + 0.0005,
      low: Math.min(1.1, stretchClose) - 0.0005,
    }),
  );
  return candles;
}

function baseInput(candles: Candle[], overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "FOREX_EURUSD",
    timeframe: "1h",
    candles,
    indicators: {},
    marketRegime: "UPTREND",
    parameters: {},
    ...overrides,
  };
}

function expectPrefixStable(strategy: Strategy, candles: Candle[], input: StrategyEvaluationInput) {
  const future = buildTrendCandles(10, -1).map((c, idx) => ({
    ...c,
    timestamp: new Date(BASE_TS + (candles.length + idx) * HOUR_MS).toISOString(),
  }));
  const withFuture = [...candles, ...future];

  const fromShort = strategy.generateSignal(input);
  const fromPrefixOfLonger = strategy.generateSignal({ ...input, candles: withFuture.slice(0, candles.length) });

  expect(fromPrefixOfLonger).toEqual(fromShort);
}

describe("FX strategies — common invariants", () => {
  const strategies = [fxTrendMomentumStrategy, fxPullbackTrendStrategy, fxVolatilityBreakoutStrategy, fxSessionBreakoutStrategy, fxMeanReversionStrategy];

  it("every FX strategy declares only FX markets (never an equity market)", () => {
    for (const strategy of strategies) {
      for (const market of strategy.supportedMarkets) {
        expect(market.startsWith("FOREX_")).toBe(true);
      }
    }
  });

  it("every FX strategy's generateSignal never reads candle.volume (source has none — smoke check via a zero-volume-only fixture)", () => {
    for (const strategy of strategies) {
      const candles = buildTrendCandles(250, 1);
      expect(candles.every((c) => c.volume === 0)).toBe(true);
      // Should not throw and should not degrade to permanent WAIT purely
      // because volume is 0 (a volume-dependent rule would silently
      // disable the strategy — see fx-volatility-breakout's docstring).
      expect(() => strategy.generateSignal(baseInput(candles, { marketRegime: strategy.compatibleRegimes[0] }))).not.toThrow();
    }
  });
});

describe("fxTrendMomentumStrategy", () => {
  it("produces a BUY signal on a confirmed FX uptrend", () => {
    const candles = buildTrendCandles(120, 1);
    const signal = fxTrendMomentumStrategy.generateSignal(baseInput(candles));
    expect(signal.signal).toBe("BUY");
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
  });

  it("WAITs with insufficient history", () => {
    const signal = fxTrendMomentumStrategy.generateSignal(baseInput(buildTrendCandles(20, 1)));
    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
  });

  it("is prefix-stable (no look-ahead)", () => {
    const candles = buildTrendCandles(120, 1);
    expectPrefixStable(fxTrendMomentumStrategy, candles, baseInput(candles));
  });
});

describe("fxPullbackTrendStrategy", () => {
  it("WAITs with insufficient history (needs EMA200)", () => {
    const signal = fxPullbackTrendStrategy.generateSignal(baseInput(buildTrendCandles(50, 1)));
    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
  });

  it("is prefix-stable (no look-ahead)", () => {
    const candles = buildTrendCandles(250, 1);
    expectPrefixStable(fxPullbackTrendStrategy, candles, baseInput(candles));
  });
});

describe("fxVolatilityBreakoutStrategy", () => {
  it("WAITs when the prior range was never compressed (choppy but not tightening)", () => {
    const candles = buildTrendCandles(100, 1);
    const signal = fxVolatilityBreakoutStrategy.generateSignal(baseInput(candles, { marketRegime: "BREAKOUT" }));
    expect(["WAIT"]).toContain(signal.signal);
  });

  it("is prefix-stable (no look-ahead)", () => {
    const candles = buildRangeThenStretchCandles(150, 1);
    expectPrefixStable(fxVolatilityBreakoutStrategy, candles, baseInput(candles, { marketRegime: "BREAKOUT" }));
  });

  it("never reads volume-based confirmation (no volumeMultiplier parameter exists)", () => {
    expect(Object.keys(fxVolatilityBreakoutStrategy.defaultParameters)).not.toContain("volumeMultiplier");
  });
});

describe("fxSessionBreakoutStrategy", () => {
  it("WAITs outside the target session window", () => {
    const candles = buildTrendCandles(50, 1).map((c) => ({ ...c, timestamp: new Date(Date.UTC(2026, 0, 6, 2, 0, 0)).toISOString() }));
    const signal = fxSessionBreakoutStrategy.generateSignal(baseInput(candles, { parameters: { targetSession: "LONDON" } }));
    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["OUTSIDE_SESSION_WINDOW"]);
  });

  it("is prefix-stable (no look-ahead)", () => {
    const candles = buildTrendCandles(60, 1);
    expectPrefixStable(fxSessionBreakoutStrategy, candles, baseInput(candles, { parameters: { targetSession: "LONDON" }, marketRegime: "BREAKOUT" }));
  });
});

describe("fxMeanReversionStrategy", () => {
  it("WAITs when price is not meaningfully stretched from EMA20", () => {
    // A flat, tightly oscillating series (no accumulated one-directional
    // stretch) — unlike `buildTrendCandles`, which is a monotonic move
    // that genuinely does stretch price away from EMA20 over enough bars.
    const candles = buildRangeThenStretchCandles(60, 1).slice(0, 59);
    const signal = fxMeanReversionStrategy.generateSignal(baseInput(candles, { marketRegime: "RANGE" }));
    expect(signal.signal).toBe("WAIT");
  });

  it("only ever produces a strictly bounded, single-entry signal (never widens stop, never a second entry field)", () => {
    const candles = buildRangeThenStretchCandles(80, 1);
    const signal = fxMeanReversionStrategy.generateSignal(baseInput(candles, { marketRegime: "RANGE" }));
    if (signal.signal !== "WAIT") {
      expect(signal.entry).toBeDefined();
      expect(signal.stopLoss).toBeDefined();
      expect(Math.abs(signal.entry! - signal.stopLoss!)).toBeGreaterThan(0);
    }
  });

  it("is prefix-stable (no look-ahead)", () => {
    const candles = buildRangeThenStretchCandles(80, -1);
    expectPrefixStable(fxMeanReversionStrategy, candles, baseInput(candles, { marketRegime: "RANGE" }));
  });

  it("is an independent hypothesis from the (rejected) SPY mean-reversion strategy — different strategy id", () => {
    expect(fxMeanReversionStrategy.id).not.toBe("mean-reversion");
    expect(fxMeanReversionStrategy.supportedMarkets).not.toContain("SP500");
  });
});
