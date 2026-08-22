import { describe, expect, it } from "vitest";
import { deflatedSharpeRatio, expectedMaxSharpeUnderTrials } from "@/core/backtesting/research/deflated-sharpe";
import { runMonthlyMonteCarlo } from "@/core/backtesting/research/monthly-monte-carlo";

/**
 * Block 8.4 §17, §22, §28 — regression tests for the two statistical
 * mechanisms this block's decision rests on: (1) Monte Carlo
 * determinism (same seed -> same result, required for reproducibility
 * of the R3-B Monte Carlo figures in the report), and (2) the DIRECTION
 * of the DSR trial-pool effect this block's central finding depends on
 * (expanding numTrials from 24 to a larger, brief-mandated cumulative
 * pool, holding the Sharpe-stdev assumption fixed, must raise the
 * benchmark and can only lower or hold DSR — never raise it). These
 * don't re-derive R3-B's own specific numbers (that's the audit
 * scripts' job, captured in results/block8-4/) — they pin the
 * underlying MATH so a future change to either generic module can't
 * silently invert this block's reasoning.
 */
describe("Monte Carlo determinism (R3-B and portfolio simulations depend on this)", () => {
  it("the same seed and inputs always produce the same result", () => {
    const returns = [1.2, -0.5, 2.1, -1.8, 0.3, 1.9, -0.2];
    const a = runMonthlyMonteCarlo(returns, { numSimulations: 1000, seed: 42 });
    const b = runMonthlyMonteCarlo(returns, { numSimulations: 1000, seed: 42 });
    expect(a).toEqual(b);
  });

  it("a different seed generally produces a different result (sanity: seed actually matters)", () => {
    const returns = [1.2, -0.5, 2.1, -1.8, 0.3, 1.9, -0.2];
    const a = runMonthlyMonteCarlo(returns, { numSimulations: 1000, seed: 42 });
    const b = runMonthlyMonteCarlo(returns, { numSimulations: 1000, seed: 7 });
    expect(a.endingEquity.p50).not.toBe(b.endingEquity.p50);
  });
});

describe("DSR trial-pool sensitivity (the mechanism behind this block's core finding)", () => {
  it("increasing numTrials (holding sharpeStdDevAcrossTrials fixed) raises the required benchmark Sharpe", () => {
    const stdev = 0.286;
    const benchmark24 = expectedMaxSharpeUnderTrials(24, stdev);
    const benchmark154 = expectedMaxSharpeUnderTrials(154, stdev);
    expect(benchmark154).toBeGreaterThan(benchmark24);
  });

  it("for a fixed observed Sharpe, DSR can only fall (never rise) as numTrials increases — reproducing R3-B's own 0.96 -> 0.23 direction", () => {
    const input = { sharpe: 0.706, skewness: 0.19, kurtosis: 14.9, numObservations: 403, sharpeStdDevAcrossTrials: 0.286 };
    const dsr24 = deflatedSharpeRatio({ ...input, numTrials: 24 });
    const dsr154 = deflatedSharpeRatio({ ...input, numTrials: 154 });
    expect(dsr24).toBeDefined();
    expect(dsr154).toBeDefined();
    expect(dsr154!).toBeLessThan(dsr24!);
  });
});
