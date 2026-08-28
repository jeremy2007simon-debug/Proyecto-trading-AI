import { describe, expect, it } from "vitest";
import { deriveApprovalStatus, deriveSignalFreshness } from "../../../../scripts/block6/paper/forward-execution-observability";

describe("deriveSignalFreshness", () => {
  it("returns STALE when the STALE_SIGNAL guard fired, regardless of other violations", () => {
    expect(
      deriveSignalFreshness({
        guardViolations: [{ guard: "STALE_SIGNAL", reason: "too old" }],
        decisionMonth: "2026-07",
      }),
    ).toBe("STALE");
  });

  it("returns UNKNOWN when no signal was ever computed (no decisionMonth)", () => {
    expect(deriveSignalFreshness({ guardViolations: [], decisionMonth: undefined })).toBe("UNKNOWN");
  });

  it("returns FRESH when a signal exists and the staleness guard did not fire", () => {
    expect(deriveSignalFreshness({ guardViolations: [{ guard: "APPROVAL_REQUIRED", reason: "x" }], decisionMonth: "2026-07" })).toBe("FRESH");
  });
});

describe("deriveApprovalStatus", () => {
  it("returns AWAITING_APPROVAL when the APPROVAL_REQUIRED guard fired, regardless of finalState", () => {
    expect(
      deriveApprovalStatus({
        guardViolations: [{ guard: "APPROVAL_REQUIRED", reason: "no approval on file" }],
        finalState: "BLOCKED",
      }),
    ).toBe("AWAITING_APPROVAL");
  });

  it("returns APPROVED for an EXECUTED attempt with no approval violation", () => {
    expect(deriveApprovalStatus({ guardViolations: [], finalState: "EXECUTED" })).toBe("APPROVED");
  });

  it("returns APPROVED for a SKIPPED attempt (execute() was reached, so approval was already satisfied)", () => {
    expect(deriveApprovalStatus({ guardViolations: [], finalState: "SKIPPED" })).toBe("APPROVED");
  });

  it("returns N/A when no rebalance was needed", () => {
    expect(deriveApprovalStatus({ guardViolations: [], finalState: "NO_REBALANCE_NEEDED" })).toBe("N/A");
  });

  it("returns N/A for a block unrelated to approval (e.g. stale signal)", () => {
    expect(deriveApprovalStatus({ guardViolations: [{ guard: "STALE_SIGNAL", reason: "too old" }], finalState: "BLOCKED" })).toBe("N/A");
  });
});
