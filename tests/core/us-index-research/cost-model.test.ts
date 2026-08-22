import { describe, expect, it } from "vitest";
import { swingTurnoverCost, swingTurnoverCostFlat, SWING_ROUND_TRIP_BPS, INTRADAY_ROUND_TRIP_BPS } from "@/core/us-index-research/cost-model";

describe("swingTurnoverCost", () => {
  it("OPTIMISTIC is zero cost", () => {
    expect(swingTurnoverCost(1, "OPTIMISTIC")).toBe(0);
  });

  it("scales linearly with turnover magnitude, using the absolute value (direction-agnostic)", () => {
    expect(swingTurnoverCost(0.5, "REALISTIC")).toBeCloseTo(swingTurnoverCost(1, "REALISTIC") / 2, 10);
    expect(swingTurnoverCost(-1, "REALISTIC")).toBe(swingTurnoverCost(1, "REALISTIC"));
  });

  it("STRESSED costs more than REALISTIC, which costs more than OPTIMISTIC", () => {
    expect(SWING_ROUND_TRIP_BPS.OPTIMISTIC).toBeLessThan(SWING_ROUND_TRIP_BPS.REALISTIC);
    expect(SWING_ROUND_TRIP_BPS.REALISTIC).toBeLessThan(SWING_ROUND_TRIP_BPS.STRESSED);
  });
});

describe("swingTurnoverCostFlat", () => {
  it("matches an explicit bps figure regardless of scenario", () => {
    expect(swingTurnoverCostFlat(1, 7)).toBeCloseTo(7 / 10_000, 10);
  });
});

describe("INTRADAY_ROUND_TRIP_BPS", () => {
  it("is wider than the SWING tier at every scenario — intraday round-trips are paid far more often", () => {
    expect(INTRADAY_ROUND_TRIP_BPS.REALISTIC).toBeGreaterThan(SWING_ROUND_TRIP_BPS.REALISTIC);
    expect(INTRADAY_ROUND_TRIP_BPS.STRESSED).toBeGreaterThan(SWING_ROUND_TRIP_BPS.STRESSED);
  });
});
