import { describe, expect, it } from "vitest";
import { computeHoldingBehavior, computeRelativePerformance } from "@/core/backtesting/research/relative-performance";
import type { RelativeStrengthPeriod } from "@/core/backtesting/research/relative-strength";

function period(decisionMonth: string, holdMonth: string, selectedMarket: string | undefined, periodReturnPct: number): RelativeStrengthPeriod {
  return { decisionMonth, holdMonth, selectedMarket, periodReturnPct };
}

describe("computeRelativePerformance", () => {
  it("computes beta=1, alpha=0 when the strategy exactly tracks the benchmark", () => {
    const benchmark = [2, -1, 3, -2, 4];
    const strategy = [...benchmark];
    const result = computeRelativePerformance(strategy, benchmark);

    expect(result.beta).toBeCloseTo(1, 6);
    expect(result.alphaMonthlyPct).toBeCloseTo(0, 6);
    expect(result.trackingErrorAnnualizedPct).toBeCloseTo(0, 6);
    expect(result.correlation).toBeCloseTo(1, 6);
  });

  it("computes a positive descriptive alpha when the strategy adds a constant excess return every month", () => {
    const benchmark = [2, -1, 3, -2, 4];
    const strategy = benchmark.map((r) => r + 1); // +1pp every month, same shape (beta=1)
    const result = computeRelativePerformance(strategy, benchmark);

    expect(result.beta).toBeCloseTo(1, 6);
    expect(result.alphaMonthlyPct).toBeCloseTo(1, 6);
    expect(result.alphaAnnualizedPct).toBeCloseTo(12, 6);
    expect(result.meanExcessMonthlyPct).toBeCloseTo(1, 6);
  });

  it("beta is undefined when the benchmark has ~zero variance (division would be meaningless)", () => {
    const result = computeRelativePerformance([1, 2, 3], [5, 5, 5]);
    expect(result.beta).toBeUndefined();
    expect(result.alphaMonthlyPct).toBeUndefined();
  });

  it("upside/downside capture: 200% upside capture, 50% downside capture", () => {
    // Benchmark up months: +2, strategy matches +4 (200% capture).
    // Benchmark down months: -4, strategy only drops -2 (50% capture, favorable).
    const benchmark = [2, -4, 2, -4];
    const strategy = [4, -2, 4, -2];
    const result = computeRelativePerformance(strategy, benchmark);

    expect(result.upsideCapturePct).toBeCloseTo(200, 6);
    expect(result.downsideCapturePct).toBeCloseTo(50, 6);
  });

  it("capture ratios are undefined when there are no up (or down) months in the benchmark", () => {
    const result = computeRelativePerformance([1, 2, 3], [-1, -2, -3]);
    expect(result.upsideCapturePct).toBeUndefined();
    expect(result.downsideCapturePct).toBeDefined();
  });

  it("truncates to the shorter series length instead of throwing on mismatched lengths", () => {
    const result = computeRelativePerformance([1, 2, 3, 4, 5], [1, 2, 3]);
    expect(result.monthsCompared).toBe(3);
  });

  it("information ratio is undefined for fewer than 2 comparable months", () => {
    const result = computeRelativePerformance([1], [1]);
    expect(result.informationRatio).toBeUndefined();
  });
});

describe("computeHoldingBehavior", () => {
  it("computes time-in-asset percentages that sum to 100%", () => {
    const periods = [period("2024-01", "2024-02", "A", 1), period("2024-02", "2024-03", "A", 2), period("2024-03", "2024-04", "B", 3)];
    const result = computeHoldingBehavior(periods);

    expect(result.timeInAssetPct.A).toBeCloseTo(200 / 3, 4);
    expect(result.timeInAssetPct.B).toBeCloseTo(100 / 3, 4);
    const total = Object.values(result.timeInAssetPct).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it("counts total switches correctly (first period is never counted as a switch)", () => {
    const periods = [period("2024-01", "2024-02", "A", 1), period("2024-02", "2024-03", "B", 1), period("2024-03", "2024-04", "B", 1), period("2024-04", "2024-05", "A", 1)];
    const result = computeHoldingBehavior(periods);

    expect(result.totalSwitches).toBe(2); // A->B, B->A (not counting the initial A as a switch)
    expect(result.rotationFrequencyPctOfMonths).toBeCloseTo(50, 6);
  });

  it("computes streak lengths correctly, including a trailing streak with no subsequent switch", () => {
    const periods = [
      period("2024-01", "2024-02", "A", 1),
      period("2024-02", "2024-03", "A", 1),
      period("2024-03", "2024-04", "A", 1),
      period("2024-04", "2024-05", "B", 1),
      period("2024-05", "2024-06", "A", 1),
    ];
    const result = computeHoldingBehavior(periods);

    expect(result.streaks).toEqual([
      { asset: "A", lengthMonths: 3 },
      { asset: "B", lengthMonths: 1 },
      { asset: "A", lengthMonths: 1 },
    ]);
    expect(result.averageStreakLengthMonths).toBeCloseTo((3 + 1 + 1) / 3, 6);
    expect(result.medianStreakLengthMonths).toBe(1);
  });

  it("treats undefined selectedMarket as a distinct 'CASH' bucket", () => {
    const periods = [period("2024-01", "2024-02", undefined, 0), period("2024-02", "2024-03", "A", 1)];
    const result = computeHoldingBehavior(periods);

    expect(result.timeInAssetPct.CASH).toBeCloseTo(50, 6);
    expect(result.timeInAssetPct.A).toBeCloseTo(50, 6);
  });

  it("returns all-zero/empty results for an empty period list", () => {
    const result = computeHoldingBehavior([]);
    expect(result.totalSwitches).toBe(0);
    expect(result.rotationFrequencyPctOfMonths).toBe(0);
    expect(result.streaks).toEqual([]);
    expect(result.timeInAssetPct).toEqual({});
  });

  it("buckets switches by the switch's hold-month year", () => {
    const periods = [
      period("2023-12", "2024-01", "A", 1),
      period("2024-01", "2024-02", "B", 1), // switch realized in 2024
      period("2024-11", "2024-12", "B", 1),
      period("2024-12", "2025-01", "A", 1), // switch realized in 2025
    ];
    const result = computeHoldingBehavior(periods);
    expect(result.switchesByYear).toEqual({ "2024": 1, "2025": 1 });
  });
});
