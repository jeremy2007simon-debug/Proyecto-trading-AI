import { describe, expect, it } from "vitest";
import { createRuleBasedDataQualityEngine } from "@/core/data-quality/rule-based-data-quality-engine";
import type { DataQualityContext, DataQualityRuleId } from "@/core/data-quality/types";
import { toMarketDataValidFlag } from "@/core/data-quality/types";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import type { Candle } from "@/core/market-data/types";
import type { Market, Timeframe } from "@/core/shared/types";

const calendar = createNyseCalendar();
const engine = createRuleBasedDataQualityEngine();

function candle(overrides: Partial<Candle> & { timestamp: string }): Candle {
  return {
    market: "SP500",
    timeframe: "1d",
    symbol: "SPY",
    provider: "test-fixture",
    open: 100,
    high: 102,
    low: 98,
    close: 101,
    volume: 1000,
    ...overrides,
  };
}

function context(overrides: Partial<DataQualityContext> = {}): DataQualityContext {
  return {
    market: "SP500" as Market,
    timeframe: "1d" as Timeframe,
    calendar,
    now: new Date("2024-06-22T20:00:00.000Z"), // Saturday -> market closed, sidesteps staleness
    ...overrides,
  };
}

function findRule(rules: { rule: DataQualityRuleId; passed: boolean }[], id: DataQualityRuleId) {
  const found = rules.find((r) => r.rule === id);
  if (!found) throw new Error(`rule ${id} not evaluated`);
  return found;
}

describe("createRuleBasedDataQualityEngine — clean data", () => {
  it("returns PASS for a clean daily series that correctly skips a holiday and a weekend", () => {
    const candles = [
      candle({ timestamp: "2024-06-17T20:00:00.000Z" }), // Mon
      candle({ timestamp: "2024-06-18T20:00:00.000Z" }), // Tue
      // 2024-06-19 (Wed) is Juneteenth — a market holiday — intentionally skipped.
      candle({ timestamp: "2024-06-20T20:00:00.000Z" }), // Thu
      candle({ timestamp: "2024-06-21T20:00:00.000Z" }), // Fri
      candle({ timestamp: "2024-06-24T20:00:00.000Z" }), // Mon (weekend skipped)
    ];
    const report = engine.evaluate(candles, context({ minimumSampleSize: 5 }));

    expect(report.status).toBe("PASS");
    expect(report.duplicatesDetected).toBe(0);
    expect(report.gapsDetected).toBe(0);
    expect(toMarketDataValidFlag(report)).toBe(true);
    expect(report.rulesEvaluated.every((r) => r.passed)).toBe(true);
  });
});

describe("createRuleBasedDataQualityEngine — one broken rule at a time", () => {
  const base = context({ minimumSampleSize: 1 });

  it("flags NO_DUPLICATE_TIMESTAMPS", () => {
    const candles = [
      candle({ timestamp: "2024-06-17T20:00:00.000Z" }),
      candle({ timestamp: "2024-06-17T20:00:00.000Z" }),
    ];
    const report = engine.evaluate(candles, base);
    const rule = findRule(report.rulesEvaluated, "NO_DUPLICATE_TIMESTAMPS");
    expect(rule.passed).toBe(false);
    expect(report.duplicatesDetected).toBe(1);
    expect(report.status).toBe("FAIL");
  });

  it("flags MONOTONIC_TIMESTAMPS", () => {
    const candles = [
      candle({ timestamp: "2024-06-18T20:00:00.000Z" }),
      candle({ timestamp: "2024-06-17T20:00:00.000Z" }),
    ];
    const report = engine.evaluate(candles, base);
    expect(findRule(report.rulesEvaluated, "MONOTONIC_TIMESTAMPS").passed).toBe(false);
  });

  it("flags OHLC_INTERNALLY_CONSISTENT when high is below close", () => {
    const candles = [
      candle({ timestamp: "2024-06-17T20:00:00.000Z", high: 90, low: 80, open: 85, close: 95 }),
    ];
    const report = engine.evaluate(candles, base);
    expect(findRule(report.rulesEvaluated, "OHLC_INTERNALLY_CONSISTENT").passed).toBe(false);
  });

  it("flags NO_ZERO_OR_NEGATIVE_PRICES", () => {
    const candles = [
      candle({ timestamp: "2024-06-17T20:00:00.000Z", close: 0 }),
    ];
    const report = engine.evaluate(candles, base);
    expect(findRule(report.rulesEvaluated, "NO_ZERO_OR_NEGATIVE_PRICES").passed).toBe(false);
  });

  it("flags VOLUME_NON_NEGATIVE", () => {
    const candles = [
      candle({ timestamp: "2024-06-17T20:00:00.000Z", volume: -1 }),
    ];
    const report = engine.evaluate(candles, base);
    expect(findRule(report.rulesEvaluated, "VOLUME_NON_NEGATIVE").passed).toBe(false);
  });

  it("flags SUFFICIENT_SAMPLE_SIZE when below the configured minimum", () => {
    const candles = [candle({ timestamp: "2024-06-17T20:00:00.000Z" })];
    const report = engine.evaluate(candles, context({ minimumSampleSize: 5 }));
    expect(findRule(report.rulesEvaluated, "SUFFICIENT_SAMPLE_SIZE").passed).toBe(false);
    expect(report.status).toBe("FAIL");
  });

  it("flags WITHIN_EXPECTED_TIMEFRAME_INTERVAL when candles are too close together", () => {
    const candles = [
      candle({ timestamp: "2024-06-17T13:30:00.000Z", timeframe: "1h" }),
      candle({ timestamp: "2024-06-17T13:35:00.000Z", timeframe: "1h" }), // 5 min apart on a 1h timeframe
    ];
    const report = engine.evaluate(
      candles,
      context({ minimumSampleSize: 1, timeframe: "1h" }),
    );
    expect(findRule(report.rulesEvaluated, "WITHIN_EXPECTED_TIMEFRAME_INTERVAL").passed).toBe(false);
  });

  it("flags NO_GAPS_IN_SEQUENCE for a mid-session gap and downgrades status to WARN (not FAIL)", () => {
    // Both timestamps are 09:30 ET and 14:30 ET on the same trading day
    // (2024-06-17) — a 5-hour gap on a 1h timeframe during open RTH.
    const candles = [
      candle({ timestamp: "2024-06-17T13:30:00.000Z", timeframe: "1h" }),
      candle({ timestamp: "2024-06-17T18:30:00.000Z", timeframe: "1h" }),
    ];
    const report = engine.evaluate(
      candles,
      context({ minimumSampleSize: 2, timeframe: "1h" }),
    );
    const rule = findRule(report.rulesEvaluated, "NO_GAPS_IN_SEQUENCE");
    expect(rule.passed).toBe(false);
    expect(report.gapsDetected).toBe(1);
    expect(report.status).toBe("WARN");
    expect(toMarketDataValidFlag(report)).toBe(true); // WARN is still usable, unlike FAIL
  });

  it("does NOT flag a gap across a normal weekend (Friday -> Monday)", () => {
    const candles = [
      candle({ timestamp: "2024-06-21T20:00:00.000Z" }), // Friday
      candle({ timestamp: "2024-06-24T20:00:00.000Z" }), // Monday
    ];
    const report = engine.evaluate(candles, context({ minimumSampleSize: 2 }));
    expect(findRule(report.rulesEvaluated, "NO_GAPS_IN_SEQUENCE").passed).toBe(true);
    expect(report.gapsDetected).toBe(0);
  });

  it("flags NOT_STALE when the market is open and the latest candle is too old", () => {
    const candles = [candle({ timestamp: "2024-06-17T13:30:00.000Z", timeframe: "5m" })];
    const report = engine.evaluate(
      candles,
      context({
        minimumSampleSize: 1,
        timeframe: "5m",
        now: new Date("2024-06-17T14:00:00.000Z"), // 30 min later, still RTH (10:00 ET)
      }),
    );
    expect(findRule(report.rulesEvaluated, "NOT_STALE").passed).toBe(false);
  });

  it("does not evaluate staleness as a failure when the market is closed", () => {
    const candles = [candle({ timestamp: "2024-06-17T13:30:00.000Z", timeframe: "5m" })];
    const report = engine.evaluate(
      candles,
      context({
        minimumSampleSize: 1,
        timeframe: "5m",
        now: new Date("2024-06-22T14:00:00.000Z"), // Saturday
      }),
    );
    expect(findRule(report.rulesEvaluated, "NOT_STALE").passed).toBe(true);
  });
});

describe("toMarketDataValidFlag", () => {
  it("is false only when status is FAIL", () => {
    expect(toMarketDataValidFlag({ status: "PASS" } as never)).toBe(true);
    expect(toMarketDataValidFlag({ status: "WARN" } as never)).toBe(true);
    expect(toMarketDataValidFlag({ status: "FAIL" } as never)).toBe(false);
  });
});
