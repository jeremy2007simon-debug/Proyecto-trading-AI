import { describe, expect, it } from "vitest";
import { computeIndicatorSnapshot, computeIndicatorSnapshotSeries } from "@/core/indicators";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import { buildCandles } from "./fixtures";

describe("computeIndicatorSnapshotSeries", () => {
  const calendar = createNyseCalendar();
  // Enough bars to warm up every indicator (EMA200 is the longest at 200).
  const candles = buildCandles(
    Array.from({ length: 230 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2024, 0, 1, 0, 0, 0) + i * 60_000).toISOString(),
      close: 100 + Math.sin(i / 9) * 3 + i * 0.01,
      high: 100 + Math.sin(i / 9) * 3 + i * 0.01 + 0.5,
      low: 100 + Math.sin(i / 9) * 3 + i * 0.01 - 0.5,
      volume: 1000 + (i % 7) * 50,
    })),
  );

  it("matches computeIndicatorSnapshot at every position (spot-checked), in one linear pass", () => {
    const series = computeIndicatorSnapshotSeries(candles, calendar);
    expect(series.size).toBeGreaterThan(0);

    const sampleIndices = [199, 200, 201, 215, candles.length - 1];
    for (const idx of sampleIndices) {
      const prefix = candles.slice(0, idx + 1);
      const expected = computeIndicatorSnapshot(prefix, calendar);
      const actual = series.get(candles[idx].timestamp);
      expect(actual).toEqual(expected);
    }
  });

  it("omits fields for bars still in warmup, same as computeIndicatorSnapshot would", () => {
    const series = computeIndicatorSnapshotSeries(candles, calendar);
    const earlySnapshot = series.get(candles[5].timestamp);
    expect(earlySnapshot?.ema200).toBeUndefined();
    expect(earlySnapshot?.currentVolume).toBeDefined(); // always available (no warmup)
  });
});
