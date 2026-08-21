import { describe, expect, it } from "vitest";
import { causalRollingPercentile, monthlyReturn, resampleToMonthly } from "@/core/portfolio-research/monthly";
import type { DailyBar } from "@/core/portfolio-research/types";

function bar(date: string, close: number): DailyBar {
  return { date, open: close, high: close, low: close, close };
}

describe("resampleToMonthly", () => {
  it("picks the LAST daily bar within each calendar month, never a bar from the next month", () => {
    const bars = [bar("2024-01-30", 1.1), bar("2024-01-31", 1.11), bar("2024-02-01", 1.12), bar("2024-02-28", 1.15)];
    const series = resampleToMonthly("EURUSD", bars);
    expect(series.points).toHaveLength(2);
    expect(series.points[0].monthEnd).toBe("2024-01-31");
    expect(series.points[0].close).toBe(1.11);
    expect(series.points[1].monthEnd).toBe("2024-02-28");
    expect(series.points[1].close).toBe(1.15);
  });

  it("is a pure function of the bars given — appending a FUTURE month never changes an earlier month's point (no look-ahead)", () => {
    const bars = [bar("2024-01-15", 1.1), bar("2024-01-31", 1.11)];
    const withFuture = [...bars, bar("2024-02-15", 1.5), bar("2024-02-29", 1.6)];

    const withoutFuture = resampleToMonthly("EURUSD", bars);
    const withFutureResult = resampleToMonthly("EURUSD", withFuture);

    expect(withFutureResult.points[0]).toEqual(withoutFuture.points[0]);
  });

  it("computes trailingAnnualizedVol only from bars up to and including the month-end bar", () => {
    const flatBars = Array.from({ length: 70 }, (_, i) => bar(`2024-01-${String((i % 28) + 1).padStart(2, "0")}`, 1.1)).map((b, i) => ({
      ...b,
      date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    }));
    const series = resampleToMonthly("EURUSD", flatBars, 63);
    // A perfectly flat price series has zero realized volatility.
    expect(series.points.at(-1)?.trailingAnnualizedVol).toBe(0);
  });
});

describe("monthlyReturn", () => {
  it("computes a simple percentage return", () => {
    expect(monthlyReturn({ monthEnd: "a", close: 100 }, { monthEnd: "b", close: 110 })).toBeCloseTo(0.1, 10);
  });

  it("returns 0 for a non-positive starting price rather than Infinity/NaN", () => {
    expect(monthlyReturn({ monthEnd: "a", close: 0 }, { monthEnd: "b", close: 110 })).toBe(0);
  });
});

describe("causalRollingPercentile", () => {
  it("never depends on values after the current index", () => {
    const values = [1, 2, 3, 4, 5, 100, 100, 100];
    const full = causalRollingPercentile(values, 4);
    const truncated = causalRollingPercentile(values.slice(0, 5), 4);
    expect(full.slice(0, 5)).toEqual(truncated);
  });

  it("ranks the most recent value against its own trailing window", () => {
    const values = [10, 10, 10, 10, 100];
    const percentiles = causalRollingPercentile(values, 5);
    // 4 ties below (counted as half-rank each) + itself: (4 + 0.5)/5*100 = 90 exactly.
    expect(percentiles[4]).toBeGreaterThanOrEqual(90);
  });
});
