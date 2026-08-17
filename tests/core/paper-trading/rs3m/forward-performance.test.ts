import { describe, expect, it } from "vitest";
import { computeForwardPerformance, type ForwardEquityPoint, type ForwardPerformanceInput } from "@/core/paper-trading/rs3m/forward-performance";

function curve(equities: readonly number[]): ForwardEquityPoint[] {
  return equities.map((equity, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, equity }));
}

function baseInput(overrides: Partial<ForwardPerformanceInput> = {}): ForwardPerformanceInput {
  return {
    strategyEquityCurve: curve([100000, 105000, 110250]),
    benchmarkEquityCurve: curve([100000, 102000, 104040]),
    equalWeightEquityCurve: curve([100000, 101000, 102010]),
    realizedTurnoverPct: [100, 0],
    realizedSlippageBps: [12, 8],
    executionFailureCount: 0,
    missedRebalanceCount: 0,
    ...overrides,
  };
}

describe("computeForwardPerformance", () => {
  it("computes a positive CAGR/total-return for a steadily rising equity curve", () => {
    const result = computeForwardPerformance(baseInput());
    expect(result.cagrPct).toBeGreaterThan(0);
    expect(result.monthsObserved).toBe(3);
  });

  it("computes excess return vs SPY and vs equal-weight as the total-return differential", () => {
    const result = computeForwardPerformance(baseInput());
    // strategy: +10.25% total, benchmark: +4.04% total, EW: +2.01% total.
    expect(result.excessReturnVsSpyPct).toBeCloseTo(10.25 - 4.04, 1);
    expect(result.excessReturnVsEwPct).toBeCloseTo(10.25 - 2.01, 1);
  });

  it("computes max drawdown as the largest peak-to-trough decline", () => {
    const result = computeForwardPerformance(baseInput({ strategyEquityCurve: curve([100000, 120000, 90000, 130000]) }));
    // Peak 120000 -> trough 90000 = 25% drawdown.
    expect(result.maxDrawdownPct).toBeCloseTo(25, 5);
  });

  it("returns undefined for CAGR/volatility/Sharpe with fewer than 2 months of data", () => {
    const result = computeForwardPerformance(baseInput({ strategyEquityCurve: curve([100000]) }));
    expect(result.cagrPct).toBeUndefined();
    expect(result.volatilityPct).toBeUndefined();
    expect(result.sharpeRatio).toBeUndefined();
  });

  it("averages realized turnover and slippage across rebalances", () => {
    const result = computeForwardPerformance(baseInput());
    expect(result.realizedTurnoverPctAvg).toBeCloseTo(50, 5);
    expect(result.realizedSlippageBpsAvg).toBeCloseTo(10, 5);
  });

  it("returns undefined turnover/slippage averages when no rebalances have happened yet", () => {
    const result = computeForwardPerformance(baseInput({ realizedTurnoverPct: [], realizedSlippageBps: [] }));
    expect(result.realizedTurnoverPctAvg).toBeUndefined();
    expect(result.realizedSlippageBpsAvg).toBeUndefined();
  });

  it("passes through execution failure and missed-rebalance counts unchanged", () => {
    const result = computeForwardPerformance(baseInput({ executionFailureCount: 2, missedRebalanceCount: 1 }));
    expect(result.executionFailureCount).toBe(2);
    expect(result.missedRebalanceCount).toBe(1);
  });

  it("ALWAYS includes the non-VALIDATED disclaimer, regardless of how good the numbers look", () => {
    const strongResult = computeForwardPerformance(baseInput({ strategyEquityCurve: curve([100000, 200000, 400000]) }));
    expect(strongResult.disclaimer).toMatch(/does NOT mark RS3M_CANDIDATE_V1 as VALIDATED/);
    expect(strongResult.disclaimer.toUpperCase()).not.toContain("STRATEGY IS VALIDATED");
  });

  it("computes zero max drawdown for a monotonically rising curve", () => {
    const result = computeForwardPerformance(baseInput({ strategyEquityCurve: curve([100000, 101000, 105000]) }));
    expect(result.maxDrawdownPct).toBe(0);
  });
});
