import { describe, expect, it } from "vitest";
import { classifyCorrelationVsRs3m, simulateRs3mPlusCandidatePortfolio } from "@/core/us-index-research/portfolio-vs-rs3m";

describe("classifyCorrelationVsRs3m", () => {
  it("HIGH diversification value for near-zero correlation", () => {
    const a = [1, -1, 1, -1, 1, -1];
    const b = [1, 1, -1, -1, 1, 1];
    const result = classifyCorrelationVsRs3m(a, b);
    expect(Math.abs(result.returnCorrelation ?? 1)).toBeLessThan(0.3);
    expect(result.diversificationValue).toBe("HIGH");
  });

  it("LOW diversification value for near-identical series", () => {
    const a = [1, 2, 3, 4, 5, 6];
    const b = [1, 2, 3, 4, 5, 6];
    const result = classifyCorrelationVsRs3m(a, b);
    expect(result.returnCorrelation).toBeCloseTo(1, 6);
    expect(result.diversificationValue).toBe("LOW");
  });

  it("undefined correlation (e.g. too few observations) is treated conservatively as LOW, not assumed diversifying", () => {
    const result = classifyCorrelationVsRs3m([1], [2]);
    expect(result.returnCorrelation).toBeUndefined();
    expect(result.diversificationValue).toBe("LOW");
  });
});

describe("simulateRs3mPlusCandidatePortfolio", () => {
  it("is a genuine fixed 50/50 blend, not weight-optimized", () => {
    const rs3m = [10, -10, 10, -10];
    const candidate = [0, 0, 0, 0];
    const result = simulateRs3mPlusCandidatePortfolio(rs3m, candidate);
    // 50% of RS3M's +-10 plus 50% of 0 = +-5.
    expect(result.combined.annualizedVolatilityPct).toBeCloseTo(result.rs3mOnly.annualizedVolatilityPct / 2, 6);
  });

  it("truncates to the shorter of the two series rather than fabricating missing months", () => {
    const result = simulateRs3mPlusCandidatePortfolio([1, 2, 3, 4, 5], [1, 2, 3]);
    expect(result.monthsCompared).toBe(3);
  });
});
