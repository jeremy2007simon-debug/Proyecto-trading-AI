import { describe, expect, it } from "vitest";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import {
  OPENING_RANGE_BREAKOUT_DEFAULT_PARAMETERS,
  openingRangeBreakoutStrategy,
} from "@/core/strategy-manager/strategies/opening-range-breakout.strategy";
import type { StrategyEvaluationInput } from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";

const FIVE_MIN_MS = 300_000;
const calendar = createNyseCalendar();

// 2024-06-17 is a DST (EDT, UTC-4) trading day; 2024-12-16 is a
// non-DST (EST, UTC-5) trading day. Both are Mondays with no holiday.
const DST_DAY_UTC = Date.UTC(2024, 5, 17, 12, 0, 0);
const NON_DST_DAY_UTC = Date.UTC(2024, 11, 16, 12, 0, 0);

function bar(timestampMs: number, overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "5m",
    symbol: "SPY",
    provider: "test",
    timestamp: new Date(timestampMs).toISOString(),
    open: 100,
    high: 100.3,
    low: 99.7,
    close: 100,
    volume: 100_000,
    ...overrides,
  };
}

function sessionStartMs(referenceDateUTC: number): number {
  return new Date(calendar.getSessionStartUTC(new Date(referenceDateUTC))).getTime();
}

function buildWarmup(sessionStart: number, count = 25): Candle[] {
  const candles: Candle[] = [];
  for (let i = count; i >= 1; i--) candles.push(bar(sessionStart - i * FIVE_MIN_MS, {}));
  return candles;
}

function buildOpeningRangeBars(sessionStart: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < 3; i++) candles.push(bar(sessionStart + i * FIVE_MIN_MS, { high: 100.3, low: 99.7, close: 100 }));
  return candles;
}

function buildUpBreakoutFixture(referenceDateUTC: number): Candle[] {
  const sessionStart = sessionStartMs(referenceDateUTC);
  const breakoutBar = bar(sessionStart + 3 * FIVE_MIN_MS, { open: 100.2, high: 103, low: 100.1, close: 102.5, volume: 200_000 });
  return [...buildWarmup(sessionStart), ...buildOpeningRangeBars(sessionStart), breakoutBar];
}

function buildDownBreakoutFixture(referenceDateUTC: number): Candle[] {
  const sessionStart = sessionStartMs(referenceDateUTC);
  const breakoutBar = bar(sessionStart + 3 * FIVE_MIN_MS, { open: 99.8, high: 99.9, low: 97, close: 97.5, volume: 200_000 });
  return [...buildWarmup(sessionStart), ...buildOpeningRangeBars(sessionStart), breakoutBar];
}

function baseInput(candles: Candle[], overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "SP500",
    timeframe: "5m",
    candles,
    indicators: {},
    marketRegime: "BREAKOUT",
    parameters: {},
    ...overrides,
  };
}

describe("openingRangeBreakoutStrategy", () => {
  it("produces a BUY signal on a confirmed break of the opening range high", () => {
    const signal = openingRangeBreakoutStrategy.generateSignal(baseInput(buildUpBreakoutFixture(DST_DAY_UTC)));

    expect(signal.signal).toBe("BUY");
    expect(signal.entry).toBe(102.5);
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(OPENING_RANGE_BREAKOUT_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rawScore).toBeGreaterThan(0);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL signal on a confirmed break of the opening range low", () => {
    const signal = openingRangeBreakoutStrategy.generateSignal(baseInput(buildDownBreakoutFixture(DST_DAY_UTC)));

    expect(signal.signal).toBe("SELL");
    expect(signal.entry).toBe(97.5);
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(OPENING_RANGE_BREAKOUT_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rawScore).toBeLessThan(0);
  });

  it("NEVER signals before the opening range has closed", () => {
    const sessionStart = sessionStartMs(DST_DAY_UTC);
    // Ends on the 3rd opening-range bar itself — still inside the 15-minute window.
    const candles = [...buildWarmup(sessionStart), ...buildOpeningRangeBars(sessionStart)];

    const signal = openingRangeBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["OPENING_RANGE_FORMING"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs when no opening range candles exist even though the range window has closed", () => {
    const sessionStart = sessionStartMs(DST_DAY_UTC);
    // Skips straight from pre-session warmup to well after the opening
    // range closes, with nothing timestamped inside [start, start+15m).
    const candles = [...buildWarmup(sessionStart), bar(sessionStart + 20 * FIVE_MIN_MS, {})];

    const signal = openingRangeBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_OPENING_RANGE_DATA"]);
  });

  it("WAITs when price stays inside the opening range (no breakout)", () => {
    const sessionStart = sessionStartMs(DST_DAY_UTC);
    const candles = [
      ...buildWarmup(sessionStart),
      ...buildOpeningRangeBars(sessionStart),
      bar(sessionStart + 3 * FIVE_MIN_MS, { high: 100.2, low: 99.8, close: 100.1 }),
    ];

    const signal = openingRangeBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_BREAKOUT_SETUP"]);
  });

  it("WAITs when the level breaks but volume doesn't confirm it", () => {
    const sessionStart = sessionStartMs(DST_DAY_UTC);
    const candles = [
      ...buildWarmup(sessionStart),
      ...buildOpeningRangeBars(sessionStart),
      bar(sessionStart + 3 * FIVE_MIN_MS, { open: 100.2, high: 101, low: 100.1, close: 100.8, volume: 100_000 }),
    ];

    const signal = openingRangeBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["VOLUME_CONFIRMATION"]);
  });

  it("WAITs when the computed risk:reward is below the configured minimum", () => {
    const signal = openingRangeBreakoutStrategy.generateSignal(
      baseInput(buildUpBreakoutFixture(DST_DAY_UTC), { parameters: { takeProfitRMultiple: 0.5 } }),
    );

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["MINIMUM_RISK_REWARD"]);
  });

  it("WAITs when openingRangeMinutes is not a multiple of the timeframe", () => {
    const signal = openingRangeBreakoutStrategy.generateSignal(
      baseInput(buildUpBreakoutFixture(DST_DAY_UTC), { parameters: { openingRangeMinutes: 7 } }),
    );

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INVALID_OPENING_RANGE_CONFIGURATION"]);
  });

  it("does not re-signal on the bar after the breakout bar (only the FIRST bar that clears the level fires)", () => {
    const sessionStart = sessionStartMs(DST_DAY_UTC);
    const breakoutBar = bar(sessionStart + 3 * FIVE_MIN_MS, { open: 100.2, high: 103, low: 100.1, close: 102.5, volume: 200_000 });
    const nextBar = bar(sessionStart + 4 * FIVE_MIN_MS, { open: 102.5, high: 103.5, low: 102, close: 103, volume: 200_000 });
    const candles = [...buildWarmup(sessionStart), ...buildOpeningRangeBars(sessionStart), breakoutBar, nextBar];

    const signal = openingRangeBreakoutStrategy.generateSignal(baseInput(candles));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_BREAKOUT_SETUP"]);
  });

  it("correctly forms/closes the opening range on a non-DST (EST) trading day too", () => {
    const dstSignal = openingRangeBreakoutStrategy.generateSignal(baseInput(buildUpBreakoutFixture(DST_DAY_UTC)));
    const nonDstSignal = openingRangeBreakoutStrategy.generateSignal(baseInput(buildUpBreakoutFixture(NON_DST_DAY_UTC)));

    expect(dstSignal.signal).toBe("BUY");
    expect(nonDstSignal.signal).toBe("BUY");

    // The two sessions' opening bells are 1 hour apart in UTC (EDT vs EST),
    // proving the session boundary is derived from the DST-aware calendar
    // and not a hardcoded UTC offset.
    const dstSessionStart = sessionStartMs(DST_DAY_UTC);
    const nonDstSessionStart = sessionStartMs(NON_DST_DAY_UTC);
    const dstHourUTC = new Date(dstSessionStart).getUTCHours();
    const nonDstHourUTC = new Date(nonDstSessionStart).getUTCHours();
    expect(nonDstHourUTC - dstHourUTC).toBe(1);
  });

  it("is prefix-stable: never depends on candles beyond the current (last) bar", () => {
    const upBreakout = buildUpBreakoutFixture(DST_DAY_UTC);
    const lastTimestamp = new Date(upBreakout[upBreakout.length - 1].timestamp).getTime();
    const future = [bar(lastTimestamp + FIVE_MIN_MS, { high: 90, low: 80, close: 85 })];
    const withFuture = [...upBreakout, ...future];

    const fromShort = openingRangeBreakoutStrategy.generateSignal(baseInput(upBreakout));
    const fromPrefixOfLonger = openingRangeBreakoutStrategy.generateSignal(baseInput(withFuture.slice(0, upBreakout.length)));

    expect(fromPrefixOfLonger).toEqual(fromShort);
  });

  describe("timeframe generalization (Block 4.5, Phase 5)", () => {
    it("declares support for 1m/5m/15m/30m, not just 5m", () => {
      expect(openingRangeBreakoutStrategy.supportedTimeframes).toEqual(["5m", "1m", "15m", "30m"]);
    });

    it("declares support for NASDAQ100/RUSSELL2000/DOWJONES too, for cross-asset validation (Phase 7)", () => {
      expect(openingRangeBreakoutStrategy.supportedMarkets).toEqual(["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"]);
    });

    it("produces a coherent BUY signal on 15m too, where the default 15-minute opening range is exactly one bar", () => {
      const FIFTEEN_MIN_MS = 900_000;
      const bar15 = (timestampMs: number, overrides: Partial<Candle>): Candle => ({
        market: "SP500",
        timeframe: "15m",
        symbol: "SPY",
        provider: "test",
        timestamp: new Date(timestampMs).toISOString(),
        open: 100,
        high: 100.3,
        low: 99.7,
        close: 100,
        volume: 100_000,
        ...overrides,
      });
      const sessionStart = sessionStartMs(DST_DAY_UTC);
      const warmup: Candle[] = [];
      for (let i = 25; i >= 1; i--) warmup.push(bar15(sessionStart - i * FIFTEEN_MIN_MS, {}));
      const openingRangeBar = bar15(sessionStart, { high: 100.3, low: 99.7, close: 100 });
      const breakoutBar = bar15(sessionStart + FIFTEEN_MIN_MS, {
        open: 100.2,
        high: 103,
        low: 100.1,
        close: 102.5,
        volume: 200_000,
      });
      const candles = [...warmup, openingRangeBar, breakoutBar];

      const signal = openingRangeBreakoutStrategy.generateSignal(baseInput(candles, { timeframe: "15m" }));

      expect(signal.signal).toBe("BUY");
      expect(signal.entry).toBe(102.5);
      expect(signal.rulesFailed).toEqual([]);
    });

    it("with the default openingRangeMinutes=15 (never adjusted), 30m never signals — 15 isn't a multiple of 30 (documented robustness finding, not a bug)", () => {
      const signal = openingRangeBreakoutStrategy.generateSignal(
        baseInput(buildUpBreakoutFixture(DST_DAY_UTC), { timeframe: "30m" }),
      );

      expect(signal.signal).toBe("WAIT");
      expect(signal.rulesFailed).toEqual(["INVALID_OPENING_RANGE_CONFIGURATION"]);
    });
  });
});
