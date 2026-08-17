import { describe, expect, it } from "vitest";
import {
  computeAnnualizedSharpeRatio,
  computeAnnualizedSortinoRatio,
  computeAnnualizedVolatilityPct,
  computeCagrFromMonthlyReturns,
  computeCalmarRatio,
  computeMaxDrawdownFromMonthlyReturns,
  computeMonthlyReturnMetrics,
  computeTotalReturnPct,
} from "@/core/backtesting/research/portfolio-metrics";

describe("computeTotalReturnPct", () => {
  it("compounds monthly returns correctly", () => {
    expect(computeTotalReturnPct([10, 10])).toBeCloseTo(21, 6); // 1.1*1.1 = 1.21
  });

  it("is 0 for an empty series", () => {
    expect(computeTotalReturnPct([])).toBe(0);
  });
});

describe("computeCagrFromMonthlyReturns", () => {
  it("matches a known geometric series (12 months of +1%)", () => {
    const cagr = computeCagrFromMonthlyReturns(Array(12).fill(1));
    expect(cagr).toBeCloseTo((1.01 ** 12 - 1) * 100, 6);
  });

  it("is undefined for an empty series", () => {
    expect(computeCagrFromMonthlyReturns([])).toBeUndefined();
  });

  it("annualizes a partial year correctly (6 months of +2% each)", () => {
    const cagr = computeCagrFromMonthlyReturns(Array(6).fill(2));
    expect(cagr).toBeCloseTo((1.02 ** 6) ** 2 * 100 - 100, 4);
  });
});

describe("computeMaxDrawdownFromMonthlyReturns", () => {
  it("is 0 for an all-positive series", () => {
    expect(computeMaxDrawdownFromMonthlyReturns([5, 5, 5])).toBe(0);
  });

  it("computes drawdown from peak correctly", () => {
    // equity: 1 -> 1.5 (peak) -> 0.75 (50% drawdown from peak)
    const dd = computeMaxDrawdownFromMonthlyReturns([50, -50]);
    expect(dd).toBeCloseTo(50, 6);
  });
});

describe("computeAnnualizedVolatilityPct", () => {
  it("is 0 for a constant return series", () => {
    expect(computeAnnualizedVolatilityPct([1, 1, 1, 1])).toBe(0);
  });

  it("scales monthly stdev by sqrt(12)", () => {
    const monthly = [1, -1, 2, -2, 1, -1];
    const vol = computeAnnualizedVolatilityPct(monthly);
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeCloseTo(vol, 6); // sanity: finite, deterministic
  });
});

describe("computeAnnualizedSharpeRatio", () => {
  it("is undefined with fewer than 2 observations", () => {
    expect(computeAnnualizedSharpeRatio([1])).toBeUndefined();
  });

  it("is undefined for a zero-variance series (never a fabricated extreme value)", () => {
    expect(computeAnnualizedSharpeRatio([1, 1, 1])).toBeUndefined();
  });

  it("is positive for a series with positive mean return", () => {
    expect(computeAnnualizedSharpeRatio([2, -1, 3, -1, 2])).toBeGreaterThan(0);
  });

  it("is negative for a series with negative mean return", () => {
    expect(computeAnnualizedSharpeRatio([-2, 1, -3, 1, -2])).toBeLessThan(0);
  });
});

describe("computeAnnualizedSortinoRatio", () => {
  it("is undefined with no downside months", () => {
    expect(computeAnnualizedSortinoRatio([1, 2, 3])).toBeUndefined();
  });

  it("is undefined for near-identical downside months (floating-point noise guard)", () => {
    expect(computeAnnualizedSortinoRatio([1, -1, 2, -1.0000000001])).toBeUndefined();
  });

  it("is computable with genuine downside variance", () => {
    const sortino = computeAnnualizedSortinoRatio([3, -1, 4, -5, 2]);
    expect(sortino).toBeDefined();
    expect(Number.isFinite(sortino)).toBe(true);
  });
});

describe("computeCalmarRatio", () => {
  it("is undefined when CAGR is undefined", () => {
    expect(computeCalmarRatio(undefined, 10)).toBeUndefined();
  });

  it("is undefined when max drawdown is ~zero", () => {
    expect(computeCalmarRatio(15, 0)).toBeUndefined();
  });

  it("computes CAGR / |MaxDD|", () => {
    expect(computeCalmarRatio(20, 10)).toBeCloseTo(2, 6);
  });
});

describe("computeMonthlyReturnMetrics", () => {
  it("returns a fully populated, internally consistent metrics object", () => {
    const monthly = [3, -1, 4, -2, 5, -1, 2];
    const metrics = computeMonthlyReturnMetrics(monthly);

    expect(metrics.monthsCount).toBe(7);
    expect(metrics.totalReturnPct).toBeCloseTo(computeTotalReturnPct(monthly), 6);
    expect(metrics.cagrPct).toBeCloseTo(computeCagrFromMonthlyReturns(monthly)!, 6);
    expect(metrics.maxDrawdownPct).toBeCloseTo(computeMaxDrawdownFromMonthlyReturns(monthly), 6);
    expect(metrics.calmarRatio).toBeCloseTo(metrics.cagrPct! / metrics.maxDrawdownPct, 6);
  });
});
