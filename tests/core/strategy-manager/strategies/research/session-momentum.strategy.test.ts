import { describe, expect, it } from "vitest";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import {
  SESSION_MOMENTUM_DEFAULT_PARAMETERS,
  sessionMomentumStrategy,
} from "@/core/strategy-manager/strategies/research/session-momentum.strategy";
import type { StrategyEvaluationInput } from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";

const FIVE_MIN_MS = 300_000;
const calendar = createNyseCalendar();
// 2024-06-17 is a DST (EDT, UTC-4) trading day, a Monday with no holiday.
const DST_DAY_UTC = Date.UTC(2024, 5, 17, 12, 0, 0);

function sessionStartMs(referenceDateUTC: number): number {
  return new Date(calendar.getSessionStartUTC(new Date(referenceDateUTC))).getTime();
}

function bar(timestampMs: number, overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "5m",
    symbol: "SPY",
    provider: "test",
    timestamp: new Date(timestampMs).toISOString(),
    open: 100,
    high: 100.1,
    low: 99.9,
    close: 100,
    volume: 100_000,
    ...overrides,
  };
}

/** Builds `totalBars` 5m bars ending `minutesBeforeClose` minutes before the 16:00 ET session close, with a steady directional move. */
function buildMomentumCandles(
  direction: 1 | -1,
  minutesBeforeClose: number,
  totalBars = 60,
  referenceDateUTC = DST_DAY_UTC,
): Candle[] {
  const sessionStart = sessionStartMs(referenceDateUTC);
  const sessionEnd = sessionStart + 6.5 * 60 * 60 * 1000;
  const currentTs = sessionEnd - minutesBeforeClose * 60_000;
  const candles: Candle[] = [];
  for (let i = totalBars; i >= 0; i--) {
    const ts = currentTs - i * FIVE_MIN_MS;
    const close = 100 + direction * (totalBars - i) * 0.05;
    candles.push(bar(ts, { close, open: close - direction * 0.02, high: close + 0.05, low: close - 0.05 }));
  }
  return candles;
}

/**
 * Choppy (exactly zero net momentum) bars ending `minutesBeforeClose`
 * minutes before close. Values repeat on a period-3 cycle (indexed by
 * ARRAY position, i.e. chronological order) — since the strategy's
 * default `momentumLookbackBars` is 3, the current bar and its lookback
 * reference always land on the SAME phase of the cycle, so
 * `momentum = lastClose - referenceClose` is exactly 0, never merely
 * "small." A naive 2-cycle alternation would instead guarantee a
 * consistent NONZERO momentum against an odd-length lookback.
 */
function buildChoppyCandles(minutesBeforeClose: number, totalBars = 60, referenceDateUTC = DST_DAY_UTC): Candle[] {
  const sessionStart = sessionStartMs(referenceDateUTC);
  const sessionEnd = sessionStart + 6.5 * 60 * 60 * 1000;
  const currentTs = sessionEnd - minutesBeforeClose * 60_000;
  const cycle = [100.02, 99.98, 100.0];
  const candles: Candle[] = [];
  for (let i = totalBars; i >= 0; i--) {
    const ts = currentTs - i * FIVE_MIN_MS;
    const arrayIndex = totalBars - i;
    const close = cycle[arrayIndex % cycle.length];
    candles.push(bar(ts, { close }));
  }
  return candles;
}

function baseInput(candles: Candle[], overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "SP500",
    timeframe: "5m",
    candles,
    indicators: {},
    marketRegime: "RANGE",
    parameters: {},
    ...overrides,
  };
}

describe("sessionMomentumStrategy", () => {
  it("produces a BUY signal on confirmed bullish momentum within the closing window", () => {
    const signal = sessionMomentumStrategy.generateSignal(baseInput(buildMomentumCandles(1, 30)));

    expect(signal.signal).toBe("BUY");
    expect(signal.stopLoss).toBeLessThan(signal.entry!);
    expect(signal.takeProfit).toBeGreaterThan(signal.entry!);
    expect(signal.riskReward).toBeGreaterThanOrEqual(SESSION_MOMENTUM_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL signal on confirmed bearish momentum within the closing window", () => {
    const signal = sessionMomentumStrategy.generateSignal(baseInput(buildMomentumCandles(-1, 30)));

    expect(signal.signal).toBe("SELL");
    expect(signal.stopLoss).toBeGreaterThan(signal.entry!);
    expect(signal.takeProfit).toBeLessThan(signal.entry!);
  });

  it("WAITs outside the closing window even with strong momentum", () => {
    const signal = sessionMomentumStrategy.generateSignal(baseInput(buildMomentumCandles(1, 120)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["OUTSIDE_CLOSING_WINDOW"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs when there isn't enough history for RSI14/ATR14", () => {
    const signal = sessionMomentumStrategy.generateSignal(baseInput(buildMomentumCandles(1, 30, 5)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
  });

  it("WAITs on a choppy series within the closing window", () => {
    const signal = sessionMomentumStrategy.generateSignal(baseInput(buildChoppyCandles(30)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_MOMENTUM_SETUP"]);
  });

  it("declares its Block 5 research metadata", () => {
    expect(sessionMomentumStrategy.family).toBe("INTRADAY_SEASONALITY");
    expect(sessionMomentumStrategy.status).toBe("ACTIVE_RESEARCH");
    expect(sessionMomentumStrategy.supportedTimeframes).toEqual(["5m"]);
  });
});
