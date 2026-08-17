import { describe, expect, it } from "vitest";
import {
  classifyCostRobustness,
  computeBreakEvenCost,
  costsForBps,
} from "@/core/backtesting/research/break-even-cost";

describe("costsForBps", () => {
  it("returns exactly REALISTIC_COST_SCENARIO at 5bps", () => {
    expect(costsForBps(5)).toEqual({ commissionPerFill: 0, slippagePct: 0.0005, halfSpread: 0.005 });
  });

  it("scales proportionally from the 5bps reference", () => {
    expect(costsForBps(10)).toEqual({ commissionPerFill: 0, slippagePct: 0.001, halfSpread: 0.01 });
    expect(costsForBps(0)).toEqual({ commissionPerFill: 0, slippagePct: 0, halfSpread: 0 });
  });
});

describe("computeBreakEvenCost", () => {
  it("interpolates linearly between the two points that bracket zero", () => {
    const result = computeBreakEvenCost([
      { bps: 0, expectancyR: 0.2 },
      { bps: 1, expectancyR: 0.1 },
      { bps: 2, expectancyR: -0.1 },
      { bps: 3, expectancyR: -0.2 },
    ]);
    expect(result.reason).toBe("CROSSED");
    // Crosses between bps=1 (0.1) and bps=2 (-0.1) — exact midpoint.
    expect(result.breakEvenBps).toBeCloseTo(1.5, 6);
  });

  it("reports NEGATIVE_AT_ZERO_COST when expectancy is negative even at 0bps", () => {
    const result = computeBreakEvenCost([
      { bps: 0, expectancyR: -0.05 },
      { bps: 1, expectancyR: -0.1 },
      { bps: 2, expectancyR: -0.2 },
    ]);
    expect(result.reason).toBe("NEGATIVE_AT_ZERO_COST");
    expect(result.breakEvenBps).toBeNull();
  });

  it("reports POSITIVE_THROUGHOUT_TESTED_RANGE when expectancy never crosses zero", () => {
    const result = computeBreakEvenCost([
      { bps: 0, expectancyR: 0.5 },
      { bps: 1, expectancyR: 0.4 },
      { bps: 5, expectancyR: 0.1 },
    ]);
    expect(result.reason).toBe("POSITIVE_THROUGHOUT_TESTED_RANGE");
    expect(result.breakEvenBps).toBeNull();
  });

  it("is order-independent (sorts input by bps)", () => {
    const a = computeBreakEvenCost([
      { bps: 2, expectancyR: -0.1 },
      { bps: 0, expectancyR: 0.2 },
      { bps: 1, expectancyR: 0.1 },
    ]);
    const b = computeBreakEvenCost([
      { bps: 0, expectancyR: 0.2 },
      { bps: 1, expectancyR: 0.1 },
      { bps: 2, expectancyR: -0.1 },
    ]);
    expect(a).toEqual(b);
  });
});

describe("classifyCostRobustness", () => {
  it("labels each documented range correctly", () => {
    expect(classifyCostRobustness({ breakEvenBps: 0.5, reason: "CROSSED", note: "" })).toBe("EXTREMELY_FRAGILE");
    expect(classifyCostRobustness({ breakEvenBps: 1.5, reason: "CROSSED", note: "" })).toBe("FRAGILE");
    expect(classifyCostRobustness({ breakEvenBps: 2.5, reason: "CROSSED", note: "" })).toBe("WEAK");
    expect(classifyCostRobustness({ breakEvenBps: 4, reason: "CROSSED", note: "" })).toBe("POTENTIALLY_EXECUTABLE");
    expect(classifyCostRobustness({ breakEvenBps: 6, reason: "CROSSED", note: "" })).toBe("STRONGER_EXECUTION_MARGIN");
  });

  it("treats NEGATIVE_AT_ZERO_COST as extremely fragile and POSITIVE_THROUGHOUT as stronger margin", () => {
    expect(classifyCostRobustness({ breakEvenBps: null, reason: "NEGATIVE_AT_ZERO_COST", note: "" })).toBe("EXTREMELY_FRAGILE");
    expect(classifyCostRobustness({ breakEvenBps: null, reason: "POSITIVE_THROUGHOUT_TESTED_RANGE", note: "" })).toBe(
      "STRONGER_EXECUTION_MARGIN",
    );
  });
});
