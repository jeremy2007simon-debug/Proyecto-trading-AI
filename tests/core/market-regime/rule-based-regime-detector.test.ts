import { describe, expect, it } from "vitest";
import { computeIndicatorSnapshot } from "@/core/indicators";
import type { Candle } from "@/core/market-data/types";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import { createRuleBasedRegimeDetector } from "@/core/market-regime/rule-based-regime-detector";

const calendar = createNyseCalendar();
const detector = createRuleBasedRegimeDetector();

function bar(i: number, overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "1h",
    symbol: "TEST",
    provider: "test",
    timestamp: new Date(Date.UTC(2024, 5, 17, 13, 30, 0) + i * 3_600_000).toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 100_000,
    ...overrides,
  };
}

/** Tight, alternating oscillation around 100 — no net drift, small true range. */
function buildRangeCandles(count: number, startIndex = 0): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + (i % 2 === 0 ? 0.2 : -0.2);
    candles.push(bar(startIndex + i, { open: 100, high: 100.6, low: 99.4, close, volume: 100_000 }));
  }
  return candles;
}

/**
 * A strong, uninterrupted parallel-shift trend (high/low both move
 * `direction` * 2 every bar). Starts from a high enough base price that
 * a 50-bar downtrend never approaches zero — otherwise constant
 * absolute moves would balloon into huge percentage log-returns near
 * the end and get misread as a volatility spike rather than a trend.
 */
function buildTrendCandles(count: number, direction: 1 | -1, startLow = 500): Candle[] {
  const candles: Candle[] = [];
  let low = startLow;
  for (let i = 0; i < count; i++) {
    const high = low + 2;
    const close = (high + low) / 2;
    const open = close - direction * 0.2;
    candles.push(bar(i, { open, high, low, close, volume: 100_000 + (i % 5) * 1000 }));
    low += direction * 2;
  }
  return candles;
}

/** Calm data followed by a sudden burst of much larger true range/whipsaws. */
function buildVolatilitySpikeCandles(calmCount: number, spikeCount: number): Candle[] {
  const candles = buildRangeCandles(calmCount);
  for (let i = 0; i < spikeCount; i++) {
    const idx = calmCount + i;
    const swingUp = idx % 2 === 0;
    const close = swingUp ? 130 : 70;
    candles.push(
      bar(idx, {
        open: 100,
        high: swingUp ? 135 : 105,
        low: swingUp ? 95 : 65,
        close,
        volume: 100_000,
      }),
    );
  }
  return candles;
}

/** A small, steady drift with the same bar-to-bar range as `buildRangeCandles` (no volatility spike, just sustained direction). */
function buildGentleDrift(startIndex: number, count: number, fromClose: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = fromClose + (i + 1) * 0.15;
    candles.push(
      bar(startIndex + i, {
        open: close - 0.1,
        high: close + 0.3,
        low: close - 0.3,
        close,
        volume: 100_000,
      }),
    );
  }
  return candles;
}

function detect(candles: Candle[]) {
  return detector.detect({
    market: "SP500",
    timeframe: "1h",
    candles,
    indicators: computeIndicatorSnapshot(candles, calendar),
  });
}

describe("createRuleBasedRegimeDetector", () => {
  it("returns UNKNOWN with zero confidence when there isn't enough history", () => {
    const result = detect(buildRangeCandles(10));
    expect(result.regime).toBe("UNKNOWN");
    expect(result.confidenceScore).toBe(0);
    expect(result.rulesEvaluated.length).toBeGreaterThan(0);
    expect(result.scores).toBeUndefined();
  });

  it("classifies a strong, sustained uptrend as STRONG_UPTREND", () => {
    const result = detect(buildTrendCandles(50, 1));
    expect(result.regime).toBe("STRONG_UPTREND");
    expect(result.scores!.trendScore).toBeGreaterThan(0);
  });

  it("classifies a strong, sustained downtrend as STRONG_DOWNTREND", () => {
    const result = detect(buildTrendCandles(50, -1));
    expect(result.regime).toBe("STRONG_DOWNTREND");
    expect(result.scores!.trendScore).toBeLessThan(0);
  });

  it("classifies a tight, directionless oscillation as RANGE", () => {
    const result = detect(buildRangeCandles(50));
    expect(result.regime).toBe("RANGE");
  });

  it("classifies a sudden burst of true range as HIGH_VOLATILITY", () => {
    const result = detect(buildVolatilitySpikeCandles(40, 6));
    expect(result.regime).toBe("HIGH_VOLATILITY");
  });

  it("keeps confidenceScore within [0, 100] and always returns rule evaluations", () => {
    for (const candles of [buildRangeCandles(50), buildTrendCandles(50, 1)]) {
      const result = detect(candles);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(result.confidenceScore).toBeLessThanOrEqual(100);
      expect(result.rulesEvaluated.length).toBeGreaterThan(0);
    }
  });

  describe("hysteresis (confirmation bars)", () => {
    it("does NOT flip the confirmed regime after only a brief directional move", () => {
      const rangeCandles = buildRangeCandles(45);
      const lastClose = rangeCandles[rangeCandles.length - 1].close;
      const candles = [...rangeCandles, ...buildGentleDrift(45, 6, lastClose)];

      const result = detect(candles);
      expect(result.regime).toBe("RANGE");
    });

    it("DOES flip the confirmed regime once the directional move is sustained for enough bars", () => {
      const rangeCandles = buildRangeCandles(45);
      const lastClose = rangeCandles[rangeCandles.length - 1].close;
      const candles = [...rangeCandles, ...buildGentleDrift(45, 10, lastClose)];

      const result = detect(candles);
      expect(result.regime).toBe("STRONG_UPTREND");
      expect(result.previousRegime).toBe("RANGE");
    });
  });
});
