import { describe, expect, it } from "vitest";
import { describeDatasetSplit, splitCandlesChronologically } from "@/core/backtesting/dataset-split";
import type { Candle } from "@/core/market-data/types";

function buildCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({
      market: "SP500",
      timeframe: "15m",
      symbol: "SPY",
      provider: "test",
      timestamp: new Date(Date.UTC(2024, 0, 1) + i * 900_000).toISOString(),
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1000,
    });
  }
  return candles;
}

describe("splitCandlesChronologically", () => {
  it("splits exactly 60/20/20 for a count divisible by 5", () => {
    const candles = buildCandles(100);
    const split = splitCandlesChronologically(candles);

    expect(split.train).toHaveLength(60);
    expect(split.validation).toHaveLength(20);
    expect(split.outOfSample).toHaveLength(20);
  });

  it("accounts for every candle exactly once, even with a count that doesn't divide evenly", () => {
    const candles = buildCandles(97);
    const split = splitCandlesChronologically(candles);

    expect(split.train.length + split.validation.length + split.outOfSample.length).toBe(97);
  });

  it("never shuffles: train ends before validation starts, which ends before outOfSample starts", () => {
    const candles = buildCandles(100);
    const split = splitCandlesChronologically(candles);

    expect(new Date(split.train[split.train.length - 1].timestamp).getTime()).toBeLessThan(
      new Date(split.validation[0].timestamp).getTime(),
    );
    expect(new Date(split.validation[split.validation.length - 1].timestamp).getTime()).toBeLessThan(
      new Date(split.outOfSample[0].timestamp).getTime(),
    );
    // And each set is itself internally in order (no shuffling within a set either).
    for (const set of [split.train, split.validation, split.outOfSample]) {
      for (let i = 1; i < set.length; i++) {
        expect(new Date(set[i].timestamp).getTime()).toBeGreaterThan(new Date(set[i - 1].timestamp).getTime());
      }
    }
  });

  it("respects custom percentages", () => {
    const candles = buildCandles(100);
    const split = splitCandlesChronologically(candles, { trainPct: 80, validationPct: 10, outOfSamplePct: 10 });

    expect(split.train).toHaveLength(80);
    expect(split.validation).toHaveLength(10);
    expect(split.outOfSample).toHaveLength(10);
  });

  it("normalizes percentages that don't sum to exactly 100", () => {
    // 30/10/10 -> ratios 0.6/0.2/0.2, same as the 60/20/20 default.
    const candles = buildCandles(100);
    const split = splitCandlesChronologically(candles, { trainPct: 30, validationPct: 10, outOfSamplePct: 10 });

    expect(split.train).toHaveLength(60);
    expect(split.validation).toHaveLength(20);
  });
});

describe("describeDatasetSplit", () => {
  it("reports from/to/candleCount for each period", () => {
    const candles = buildCandles(100);
    const split = splitCandlesChronologically(candles);
    const description = describeDatasetSplit(split);

    expect(description.train.candleCount).toBe(60);
    expect(description.train.from).toBe(candles[0].timestamp);
    expect(description.train.to).toBe(candles[59].timestamp);
    expect(description.outOfSample.from).toBe(candles[80].timestamp);
    expect(description.outOfSample.to).toBe(candles[99].timestamp);
  });
});
