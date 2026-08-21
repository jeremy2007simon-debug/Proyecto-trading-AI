import { describe, expect, it } from "vitest";
import { runPortfolioMonteCarlo } from "@/core/portfolio-research/portfolio-monte-carlo";

describe("runPortfolioMonteCarlo — determinism", () => {
  const returns = [0.02, -0.01, 0.015, -0.03, 0.01, 0.005, -0.02, 0.03, -0.005, 0.01];

  it("same seed produces byte-identical results", () => {
    const a = runPortfolioMonteCarlo(returns, 500, 42);
    const b = runPortfolioMonteCarlo(returns, 500, 42);
    expect(a).toEqual(b);
  });

  it("different seeds produce different results (not a hardcoded constant)", () => {
    const a = runPortfolioMonteCarlo(returns, 500, 1);
    const b = runPortfolioMonteCarlo(returns, 500, 2);
    expect(a.maxDrawdownPct.p50).not.toBe(b.maxDrawdownPct.p50);
  });

  it("handles an empty return series without throwing or producing NaN", () => {
    const result = runPortfolioMonteCarlo([], 100, 42);
    expect(result.terminalEquity.p50).toBe(1);
    expect(Number.isFinite(result.maxDrawdownPct.p50)).toBe(true);
  });

  it("a strategy with only positive returns has zero ruin/loss probability", () => {
    const result = runPortfolioMonteCarlo([0.01, 0.02, 0.015, 0.01], 1000, 42);
    expect(result.lossProbability).toBe(0);
    expect(result.ruinProbability).toBe(0);
  });
});
