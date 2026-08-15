import { describe, expect, it } from "vitest";
import { isSignalEmittable, type SignalQualityGate } from "@/core/signal-engine/types";

const passingGate: SignalQualityGate = {
  consensusThresholdMet: true,
  riskEngineApproved: true,
  marketDataValid: true,
  killSwitchInactive: true,
  noInternalError: true,
  sampleQualitySufficient: true,
  stopLossDefined: true,
  minimumRiskRewardMet: true,
};

describe("isSignalEmittable", () => {
  it("returns true when every quality gate condition passes", () => {
    expect(isSignalEmittable(passingGate)).toBe(true);
  });

  it("returns false when the Risk Engine did not approve, even if everything else passes", () => {
    expect(
      isSignalEmittable({ ...passingGate, riskEngineApproved: false }),
    ).toBe(false);
  });

  it("returns false when the stop loss is not defined", () => {
    expect(
      isSignalEmittable({ ...passingGate, stopLossDefined: false }),
    ).toBe(false);
  });

  it("returns false when the kill switch is active", () => {
    expect(
      isSignalEmittable({ ...passingGate, killSwitchInactive: false }),
    ).toBe(false);
  });
});
