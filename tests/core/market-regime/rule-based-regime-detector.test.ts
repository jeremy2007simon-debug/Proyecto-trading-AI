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
 * A strong, uninterrupted trend segment where the bar-to-bar move and
 * the intrabar range are a CONSTANT PERCENTAGE of price (geometric
 * progression), not a constant absolute amount. This keeps log-returns
 * (and therefore realized volatility) stable across the whole segment —
 * a constant *absolute* step would make percentage moves shrink for an
 * uptrend and balloon for a downtrend as price drifts away from the
 * base, which would register as a volatility change and mask the
 * trend classification under the volatility-override rules.
 *
 * Returns `endPrice` so segments can be chained (e.g. an uptrend
 * followed by a reversal) while keeping every segment's own internal
 * realized volatility equally stable — chaining two segments built
 * from this same "flavor" avoids the artificial volatility spike that
 * mixing a choppy range fixture with a smooth drift would create.
 */
function buildTrendSegment(
  startIndex: number,
  count: number,
  direction: 1 | -1,
  startPrice: number,
): { candles: Candle[]; endPrice: number } {
  const candles: Candle[] = [];
  let price = startPrice;
  const stepPct = 0.004;
  const rangePct = 0.004;
  for (let i = 0; i < count; i++) {
    const rangeAbs = price * rangePct;
    const low = price;
    const high = price + rangeAbs;
    const close = (high + low) / 2;
    const open = close - direction * rangeAbs * 0.1;
    candles.push(bar(startIndex + i, { open, high, low, close, volume: 100_000 + (i % 5) * 1000 }));
    price = price * (1 + direction * stepPct);
  }
  return { candles, endPrice: price };
}

function buildTrendCandles(count: number, direction: 1 | -1, startPrice = 500): Candle[] {
  return buildTrendSegment(0, count, direction, startPrice).candles;
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
    const result = detect(buildTrendCandles(100, 1));
    expect(result.regime).toBe("STRONG_UPTREND");
    expect(result.scores!.trendScore).toBeGreaterThan(0);
  });

  it("classifies a strong, sustained downtrend as STRONG_DOWNTREND", () => {
    const result = detect(buildTrendCandles(100, -1));
    expect(result.regime).toBe("STRONG_DOWNTREND");
    expect(result.scores!.trendScore).toBeLessThan(0);
  });

  it("classifies a tight, directionless oscillation as RANGE", () => {
    const result = detect(buildRangeCandles(100));
    expect(result.regime).toBe("RANGE");
  });

  it("classifies a sudden burst of true range as HIGH_VOLATILITY", () => {
    const result = detect(buildVolatilitySpikeCandles(80, 10));
    expect(result.regime).toBe("HIGH_VOLATILITY");
  });

  it("keeps confidenceScore within [0, 100] and always returns rule evaluations", () => {
    for (const candles of [buildRangeCandles(100), buildTrendCandles(100, 1)]) {
      const result = detect(candles);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(result.confidenceScore).toBeLessThanOrEqual(100);
      expect(result.rulesEvaluated.length).toBeGreaterThan(0);
    }
  });

  it("classifies the most recent bar the same way regardless of how much extra history precedes it (rolling, not global, baseline)", () => {
    // Regression test for the whole-series-median bug: the baseline used
    // to be `median()` over the entire `input.candles` array, so the
    // same final bar could classify differently purely because more (or
    // less) history was requested. The rolling-percentile baseline only
    // ever looks at a trailing `baselineWindow`, so requesting extra
    // history beyond what's needed must not change the result.
    const fullHistory = buildTrendCandles(220, 1);
    const shorterHistory = fullHistory.slice(70); // still 150 bars, well above minHistory

    const resultFromFullHistory = detect(fullHistory);
    const resultFromShorterHistory = detect(shorterHistory);

    expect(resultFromShorterHistory.regime).toBe(resultFromFullHistory.regime);
    expect(resultFromShorterHistory.scores!.volatilityScore).toBeCloseTo(
      resultFromFullHistory.scores!.volatilityScore,
      1,
    );
    expect(resultFromShorterHistory.scores!.trendScore).toBeCloseTo(
      resultFromFullHistory.scores!.trendScore,
      1,
    );
    expect(resultFromShorterHistory.confidenceScore).toBeCloseTo(
      resultFromFullHistory.confidenceScore,
      1,
    );
  });

  describe("hysteresis (confirmation bars)", () => {
    it("does NOT flip the confirmed regime after only a brief countertrend move", () => {
      const uptrend = buildTrendSegment(0, 90, 1, 500);
      const dip = buildTrendSegment(90, 3, -1, uptrend.endPrice);
      const candles = [...uptrend.candles, ...dip.candles];

      const result = detect(candles);
      expect(result.regime).toBe("STRONG_UPTREND");
    });

    it("DOES flip the confirmed regime once the reversal is sustained for enough bars", () => {
      const uptrend = buildTrendSegment(0, 90, 1, 500);
      const reversal = buildTrendSegment(90, 25, -1, uptrend.endPrice);
      const candles = [...uptrend.candles, ...reversal.candles];

      const result = detect(candles);
      expect(result.regime).toBe("STRONG_DOWNTREND");
      expect(result.previousRegime).toBeDefined();
      expect(result.previousRegime).not.toBe("STRONG_DOWNTREND");
    });
  });
});
