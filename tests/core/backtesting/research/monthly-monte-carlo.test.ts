import { describe, expect, it } from "vitest";
import { runMonthlyMonteCarlo, runMonthlyMonteCarloBlockBootstrap } from "@/core/backtesting/research/monthly-monte-carlo";

describe("runMonthlyMonteCarlo (single-month reshuffle)", () => {
  it("returns the neutral empty-result shape for an empty series", () => {
    const result = runMonthlyMonteCarlo([]);
    expect(result.method).toBe("RESHUFFLE");
    expect(result.monthsPerSimulation).toBe(0);
    expect(result.endingEquity).toEqual({ p1: 1, p5: 1, p50: 1, p95: 1 });
    expect(result.maxDrawdownPct).toEqual({ p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 });
    expect(result.probabilityOfTerminalLossPct).toBe(0);
  });

  it("is deterministic for a fixed seed (reproducible across calls)", () => {
    const monthly = [3, -1, 4, -2, 5, -1, 2, -3, 1, 2, -1, 3];
    const a = runMonthlyMonteCarlo(monthly, { numSimulations: 500, seed: 7 });
    const b = runMonthlyMonteCarlo(monthly, { numSimulations: 500, seed: 7 });
    expect(a).toEqual(b);
  });

  it("has ~0% probability of terminal loss for an all-positive series", () => {
    const monthly = Array(24).fill(2);
    const result = runMonthlyMonteCarlo(monthly, { numSimulations: 1000, seed: 1 });
    expect(result.probabilityOfTerminalLossPct).toBe(0);
    expect(result.endingEquity.p50).toBeGreaterThan(1);
  });

  it("has 100% probability of terminal loss for an all-negative series", () => {
    const monthly = Array(24).fill(-2);
    const result = runMonthlyMonteCarlo(monthly, { numSimulations: 1000, seed: 1 });
    expect(result.probabilityOfTerminalLossPct).toBe(100);
    expect(result.endingEquity.p95).toBeLessThan(1);
  });

  it("computes underperformance probabilities against supplied benchmark/equal-weight series", () => {
    const monthly = Array(12).fill(5); // strong, steady positive series
    const weakBenchmark = Array(12).fill(-10); // benchmark that clearly loses money
    const result = runMonthlyMonteCarlo(monthly, {
      numSimulations: 500,
      seed: 3,
      benchmarkMonthlyReturnsPct: weakBenchmark,
      equalWeightMonthlyReturnsPct: weakBenchmark,
    });
    // Every simulated path reshuffles the SAME all-+5% months, so every simulation ends above the losing benchmark.
    expect(result.probabilityOfUnderperformingBenchmarkPct).toBe(0);
    expect(result.probabilityOfUnderperformingEqualWeightPct).toBe(0);
  });

  it("leaves underperformance probabilities undefined when no comparison series is supplied", () => {
    const result = runMonthlyMonteCarlo([1, 2, 3], { numSimulations: 100 });
    expect(result.probabilityOfUnderperformingBenchmarkPct).toBeUndefined();
    expect(result.probabilityOfUnderperformingEqualWeightPct).toBeUndefined();
  });

  it("percentiles are monotonic (p1 <= p5 <= p50 <= p95 for equity, p50 <= p75 <= p90 <= p95 <= p99 for drawdown)", () => {
    const monthly = [4, -6, 8, -3, 5, -8, 2, 6, -4, 3, -2, 7];
    const result = runMonthlyMonteCarlo(monthly, { numSimulations: 2000, seed: 11 });
    expect(result.endingEquity.p1).toBeLessThanOrEqual(result.endingEquity.p5);
    expect(result.endingEquity.p5).toBeLessThanOrEqual(result.endingEquity.p50);
    expect(result.endingEquity.p50).toBeLessThanOrEqual(result.endingEquity.p95);
    expect(result.maxDrawdownPct.p50).toBeLessThanOrEqual(result.maxDrawdownPct.p75);
    expect(result.maxDrawdownPct.p75).toBeLessThanOrEqual(result.maxDrawdownPct.p90);
    expect(result.maxDrawdownPct.p90).toBeLessThanOrEqual(result.maxDrawdownPct.p95);
    expect(result.maxDrawdownPct.p95).toBeLessThanOrEqual(result.maxDrawdownPct.p99);
  });

  it("defaults to 10,000 simulations when not specified", () => {
    const result = runMonthlyMonteCarlo([1, -1, 2], { seed: 1 });
    expect(result.numSimulations).toBe(10_000);
  });
});

describe("runMonthlyMonteCarloBlockBootstrap", () => {
  it("returns the neutral empty-result shape for an empty series", () => {
    const result = runMonthlyMonteCarloBlockBootstrap([]);
    expect(result.method).toBe("BLOCK_BOOTSTRAP");
    expect(result.monthsPerSimulation).toBe(0);
    expect(result.endingEquity).toEqual({ p1: 1, p5: 1, p50: 1, p95: 1 });
  });

  it("is deterministic for a fixed seed", () => {
    const monthly = [3, -1, 4, -2, 5, -1, 2, -3, 1, 2, -1, 3];
    const a = runMonthlyMonteCarloBlockBootstrap(monthly, { numSimulations: 500, seed: 9, blockSizeMonths: 3 });
    const b = runMonthlyMonteCarloBlockBootstrap(monthly, { numSimulations: 500, seed: 9, blockSizeMonths: 3 });
    expect(a).toEqual(b);
  });

  it("every simulated path has exactly the original number of months", () => {
    // Indirectly verified: an all-+1% series compounded over exactly n months has a known, tight ending-equity range.
    const monthly = Array(11).fill(1); // odd length vs a block size of 4, to exercise truncation
    const result = runMonthlyMonteCarloBlockBootstrap(monthly, { numSimulations: 2000, seed: 5, blockSizeMonths: 4 });
    const expectedEquity = 1.01 ** 11;
    expect(result.endingEquity.p50).toBeCloseTo(expectedEquity, 6);
    expect(result.endingEquity.p1).toBeCloseTo(expectedEquity, 6);
  });

  it("clamps blockSizeMonths to the series length instead of throwing", () => {
    const monthly = [2, -1, 3];
    expect(() => runMonthlyMonteCarloBlockBootstrap(monthly, { numSimulations: 50, seed: 1, blockSizeMonths: 100 })).not.toThrow();
  });

  it("defaults to a 4-month block size when not specified", () => {
    const result = runMonthlyMonteCarloBlockBootstrap([1, -1, 2, 3, -2], { numSimulations: 10, seed: 1 });
    expect(result.blockSizeMonths).toBe(4);
  });
});
