import { describe, expect, it } from "vitest";
import { legTurnoverCost, legTurnoverCostFlat, roundTripCostBps, swapMarkupMonthly } from "@/core/portfolio-research/cost-model";
import { FULL_INSTRUMENTS } from "@/core/portfolio-research/instruments";

describe("roundTripCostBps — scenario ordering", () => {
  it("OPTIMISTIC <= REALISTIC <= STRESSED for every instrument", () => {
    for (const inst of FULL_INSTRUMENTS) {
      const opt = roundTripCostBps(inst, "OPTIMISTIC");
      const real = roundTripCostBps(inst, "REALISTIC");
      const stress = roundTripCostBps(inst, "STRESSED");
      expect(opt).toBeLessThanOrEqual(real);
      expect(real).toBeLessThanOrEqual(stress);
    }
  });
});

describe("legTurnoverCost", () => {
  it("scales linearly with |weightChange|", () => {
    const c1 = legTurnoverCost("EURUSD", 0.5, "REALISTIC");
    const c2 = legTurnoverCost("EURUSD", 1.0, "REALISTIC");
    expect(c2).toBeCloseTo(c1 * 2, 10);
  });

  it("is direction-agnostic (a decrease costs the same as an equal increase)", () => {
    expect(legTurnoverCost("EURUSD", 0.5, "REALISTIC")).toBeCloseTo(legTurnoverCost("EURUSD", -0.5, "REALISTIC"), 10);
  });

  it("is zero for zero turnover", () => {
    expect(legTurnoverCost("EURUSD", 0, "REALISTIC")).toBe(0);
  });
});

describe("legTurnoverCostFlat", () => {
  it("matches a manual bps calculation", () => {
    expect(legTurnoverCostFlat(1, 5)).toBeCloseTo(5 / 10_000, 12);
  });
});

describe("swapMarkupMonthly", () => {
  it("OPTIMISTIC is always zero", () => {
    expect(swapMarkupMonthly("OPTIMISTIC")).toBe(0);
  });

  it("REALISTIC <= STRESSED", () => {
    expect(swapMarkupMonthly("REALISTIC")).toBeLessThanOrEqual(swapMarkupMonthly("STRESSED"));
  });
});
