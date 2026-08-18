import { describe, expect, it } from "vitest";
import { classifyBlockedPlanNotification, isRoutineStaleSignalOnly } from "@/core/paper-trading/rs3m/notification-policy";
import type { Rs3mPlanResult } from "@/core/paper-trading/rs3m/rs3m-engine";

function planResult(overrides: Partial<Rs3mPlanResult> = {}): Rs3mPlanResult {
  return {
    signal: { decisionMonth: "2026-08", dataCutoffTimestamp: "2026-08-31T20:00:00Z", ranking: [], selectedMarket: "DOWJONES" },
    plan: { currentAsset: undefined, targetAsset: "DIA", isRebalanceNeeded: true, orders: [], estimatedTurnoverPct: 100 },
    guardResult: { passed: false, violations: [] },
    wouldExecute: false,
    ...overrides,
  };
}

describe("isRoutineStaleSignalOnly", () => {
  it("is true when STALE_SIGNAL is the only violation (required test #9: routine block, no daily spam)", () => {
    const result = planResult({ guardResult: { passed: false, violations: [{ guard: "STALE_SIGNAL", reason: "too old" }] } });
    expect(isRoutineStaleSignalOnly(result)).toBe(true);
  });

  it("is false when STALE_SIGNAL appears alongside another, unexpected violation", () => {
    const result = planResult({ guardResult: { passed: false, violations: [{ guard: "STALE_SIGNAL", reason: "too old" }, { guard: "CANDIDATE_HASH_MISMATCH", reason: "x" }] } });
    expect(isRoutineStaleSignalOnly(result)).toBe(false);
  });

  it("is STILL true when STALE_SIGNAL co-occurs with APPROVAL_REQUIRED — that pairing is the everyday resting state under approval mode, not new information", () => {
    const result = planResult({ guardResult: { passed: false, violations: [{ guard: "STALE_SIGNAL", reason: "too old" }, { guard: "APPROVAL_REQUIRED", reason: "x" }] } });
    expect(isRoutineStaleSignalOnly(result)).toBe(true);
  });

  it("is false with zero violations", () => {
    expect(isRoutineStaleSignalOnly(planResult({ guardResult: { passed: true, violations: [] } }))).toBe(false);
  });
});

describe("classifyBlockedPlanNotification", () => {
  it("does not notify when the plan would execute (that path uses DRY_RUN_PASSED separately)", () => {
    expect(classifyBlockedPlanNotification(planResult({ wouldExecute: true, guardResult: { passed: true, violations: [] } }))).toEqual({ notify: false });
  });

  it("does not notify for NO_REBALANCE_NEEDED (already holding the target asset)", () => {
    expect(classifyBlockedPlanNotification(planResult({ blockedReason: "NO_REBALANCE_NEEDED", guardResult: { passed: true, violations: [] } }))).toEqual({ notify: false });
  });

  it("does not notify for routine STALE_SIGNAL-only blocks — required test #9", () => {
    const result = planResult({ blockedReason: "SAFETY_GUARD_FAILED", guardResult: { passed: false, violations: [{ guard: "STALE_SIGNAL", reason: "too old" }] } });
    expect(classifyBlockedPlanNotification(result)).toEqual({ notify: false });
  });

  it("does not notify when STALE_SIGNAL co-occurs with APPROVAL_REQUIRED (the real everyday combination under approval mode — regression test for the live-verified anti-spam fix)", () => {
    const result = planResult({
      blockedReason: "SAFETY_GUARD_FAILED",
      guardResult: { passed: false, violations: [{ guard: "STALE_SIGNAL", reason: "too old" }, { guard: "APPROVAL_REQUIRED", reason: "x" }] },
    });
    expect(classifyBlockedPlanNotification(result)).toEqual({ notify: false });
  });

  it("DOES notify with SIGNAL_AWAITING_APPROVAL for the one moment the human is waiting for", () => {
    const result = planResult({ blockedReason: "AWAITING_APPROVAL", guardResult: { passed: false, violations: [{ guard: "APPROVAL_REQUIRED", reason: "x" }] } });
    expect(classifyBlockedPlanNotification(result)).toEqual({ notify: true, type: "SIGNAL_AWAITING_APPROVAL" });
  });

  it("DOES notify with STALE_SIGNAL type when stale co-occurs with a genuinely unexpected guard failure", () => {
    const result = planResult({
      blockedReason: "SAFETY_GUARD_FAILED",
      guardResult: { passed: false, violations: [{ guard: "STALE_SIGNAL", reason: "x" }, { guard: "CANDIDATE_HASH_MISMATCH", reason: "y" }] },
    });
    expect(classifyBlockedPlanNotification(result)).toEqual({ notify: true, type: "STALE_SIGNAL" });
  });

  it("DOES notify with GUARD_BLOCKED for an unexpected guard failure unrelated to staleness", () => {
    const result = planResult({ blockedReason: "SAFETY_GUARD_FAILED", guardResult: { passed: false, violations: [{ guard: "CANDIDATE_HASH_MISMATCH", reason: "x" }] } });
    expect(classifyBlockedPlanNotification(result)).toEqual({ notify: true, type: "GUARD_BLOCKED" });
  });
});
