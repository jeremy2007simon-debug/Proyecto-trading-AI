import { describe, expect, it } from "vitest";
import { aggregateDailyToMonthly, buildDailyReturnSeries, computeMaxDrawdownPctFromCurve, buildDailyEquityCurve, toAdjustedCandles } from "@/core/us-index-research/daily-series";
import type { UsIndexDailyBar } from "@/core/us-index-research/types";

function bar(date: string, close: number, adjClose: number, overrides: Partial<UsIndexDailyBar> = {}): UsIndexDailyBar {
  return { date, open: close, high: close, low: close, close, adjClose, volume: 1000, ...overrides };
}

describe("buildDailyReturnSeries — adjusted prices", () => {
  it("computes returns from adjClose, not raw close — a dividend-driven close drop must NOT appear as a negative return once adjusted", () => {
    // Day 2 has a real $1 ex-dividend drop in raw close, but adjClose (which already prices in the dividend) is flat.
    const bars: UsIndexDailyBar[] = [bar("2024-01-01", 100, 100), bar("2024-01-02", 99, 100), bar("2024-01-03", 100, 101)];
    const points = buildDailyReturnSeries(bars, 20);
    expect(points[1].dailyReturn).toBeCloseTo(0, 10); // NOT -0.01
    expect(points[2].dailyReturn).toBeCloseTo(0.01, 10);
  });
});

describe("buildDailyReturnSeries — no look-ahead", () => {
  it("a bar's trailing vol reading is unchanged when a LATER bar's return is mutated", () => {
    const base: UsIndexDailyBar[] = Array.from({ length: 30 }, (_, i) => bar(`2024-01-${String(i + 1).padStart(2, "0")}`, 100 + i, 100 + i));
    const pointsBefore = buildDailyReturnSeries(base, 20);
    const mutated = base.map((b, i) => (i === 25 ? { ...b, close: 500, adjClose: 500 } : b));
    const pointsAfter = buildDailyReturnSeries(mutated, 20);
    // Index 20's reading depends only on bars [1..20] — bar 25 is strictly after it.
    expect(pointsAfter[20].trailingRealizedVolPct).toBeCloseTo(pointsBefore[20].trailingRealizedVolPct!, 10);
  });

  it("trailingAtrVolPct is undefined until the ATR warmup window is full", () => {
    const bars: UsIndexDailyBar[] = Array.from({ length: 10 }, (_, i) => bar(`2024-01-${String(i + 1).padStart(2, "0")}`, 100, 100));
    const points = buildDailyReturnSeries(bars, 20, 14);
    expect(points[9].trailingAtrVolPct).toBeUndefined();
  });
});

describe("aggregateDailyToMonthly", () => {
  it("compounds daily returns within a month, not sums them", () => {
    const dates = ["2024-01-01", "2024-01-02", "2024-01-03"];
    const returns = [0.1, 0.1, undefined]; // +10%, +10%, warmup day (0%)
    const result = aggregateDailyToMonthly(dates, returns);
    expect(result.months).toEqual(["2024-01"]);
    expect(result.returnsPct[0]).toBeCloseTo((1.1 * 1.1 - 1) * 100, 8);
  });

  it("splits across month boundaries into separate entries", () => {
    const dates = ["2024-01-31", "2024-02-01"];
    const returns = [0.05, 0.02];
    const result = aggregateDailyToMonthly(dates, returns);
    expect(result.months).toEqual(["2024-01", "2024-02"]);
  });
});

describe("buildDailyEquityCurve / computeMaxDrawdownPctFromCurve", () => {
  it("computes a correct max drawdown from a simple curve", () => {
    // equity path: 1.1, 1.045, 0.9405, 1.1286 -> peak stays 1.1 through the trough at 0.9405.
    const curve = buildDailyEquityCurve([0.1, -0.05, -0.1, 0.2]);
    const peak = 1.1;
    const trough = 1.1 * 0.95 * 0.9;
    const expectedDd = ((peak - trough) / peak) * 100;
    expect(computeMaxDrawdownPctFromCurve(curve)).toBeCloseTo(expectedDd, 6);
  });
});

describe("toAdjustedCandles", () => {
  it("scales OHLC by the same adjClose/close ratio, keeping the bar internally consistent", () => {
    const bars: UsIndexDailyBar[] = [{ date: "2024-01-01", open: 100, high: 105, low: 95, close: 100, adjClose: 90, volume: 500 }];
    const candles = toAdjustedCandles(bars, "SPY");
    expect(candles[0].close).toBe(90);
    expect(candles[0].open).toBeCloseTo(90, 8);
    expect(candles[0].high).toBeCloseTo(94.5, 8);
    expect(candles[0].low).toBeCloseTo(85.5, 8);
  });

  it("maps ticker to the correct logical Market", () => {
    const bars: UsIndexDailyBar[] = [{ date: "2024-01-01", open: 1, high: 1, low: 1, close: 1, adjClose: 1, volume: 1 }];
    expect(toAdjustedCandles(bars, "QQQ")[0].market).toBe("NASDAQ100");
    expect(toAdjustedCandles(bars, "IWM")[0].market).toBe("RUSSELL2000");
    expect(toAdjustedCandles(bars, "DIA")[0].market).toBe("DOWJONES");
  });
});
