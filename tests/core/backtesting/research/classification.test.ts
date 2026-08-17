import { describe, expect, it } from "vitest";
import { classifyStrategy, type FunnelSummary } from "@/core/backtesting/research/classification";

function baseSummary(overrides: Partial<FunnelSummary> = {}): FunnelSummary {
  return {
    sanityPassed: true,
    zeroCostExpectancyR: 0.2,
    realisticCostExpectancyR: 0.1,
    breakEvenBps: 6,
    oosExpectancyR: 0.08,
    walkForwardPositiveWindowPct: 60,
    walkForwardWindowCount: 10,
    sampleQuality: "HIGH",
    crossAssetPositiveCount: 1,
    crossAssetTestedCount: 3,
    monteCarloDrawdownP95Pct: 40,
    positiveRegimeCount: 2,
    ...overrides,
  };
}

describe("classifyStrategy", () => {
  it("REJECTED — fails sanity", () => {
    const result = classifyStrategy(baseSummary({ sanityPassed: false }));
    expect(result.classification).toBe("REJECTED");
  });

  it("REJECTED — no positive gross edge at zero cost", () => {
    const result = classifyStrategy(baseSummary({ zeroCostExpectancyR: -0.05 }));
    expect(result.classification).toBe("REJECTED");
  });

  it("REJECTED — non-positive expectancy at realistic cost", () => {
    const result = classifyStrategy(baseSummary({ realisticCostExpectancyR: -0.02 }));
    expect(result.classification).toBe("REJECTED");
  });

  it("REJECTED — non-positive out-of-sample expectancy", () => {
    const result = classifyStrategy(baseSummary({ oosExpectancyR: -0.01 }));
    expect(result.classification).toBe("REJECTED");
  });

  it("RESEARCH — clears full-period/OOS but walk-forward is not majority positive", () => {
    const result = classifyStrategy(baseSummary({ walkForwardPositiveWindowPct: 30 }));
    expect(result.classification).toBe("RESEARCH");
  });

  it("RESEARCH — clears full-period/OOS/walk-forward but sample quality is too low", () => {
    const result = classifyStrategy(baseSummary({ sampleQuality: "LOW" }));
    expect(result.classification).toBe("RESEARCH");
  });

  it("CANDIDATE — clears core bars but not cross-asset/Monte Carlo/regime", () => {
    const result = classifyStrategy(baseSummary({ crossAssetPositiveCount: 0, monteCarloDrawdownP95Pct: undefined, positiveRegimeCount: 0 }));
    expect(result.classification).toBe("CANDIDATE");
  });

  it("VALIDATED — clears every bar including cross-asset, non-catastrophic Monte Carlo, and a positive regime", () => {
    const result = classifyStrategy(baseSummary());
    expect(result.classification).toBe("VALIDATED");
  });

  it("CANDIDATE, not VALIDATED — Monte Carlo drawdown is catastrophic", () => {
    const result = classifyStrategy(baseSummary({ monteCarloDrawdownP95Pct: 95 }));
    expect(result.classification).toBe("CANDIDATE");
  });

  it("never promotes past CANDIDATE without a tested cross-asset check", () => {
    const result = classifyStrategy(baseSummary({ crossAssetTestedCount: 0, crossAssetPositiveCount: 0 }));
    expect(result.classification).toBe("CANDIDATE");
  });
});
