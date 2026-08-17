import { describe, expect, it } from "vitest";
import { appendTransition, currentStatus, isTerminalStatus, isValidTransition, type StatusTransition } from "@/core/paper-trading/rs3m/status";

describe("isValidTransition", () => {
  it("allows the documented happy path: CANDIDATE_FROZEN -> AUDIT_PASSED -> PAPER_READY -> PAPER_RUNNING", () => {
    expect(isValidTransition("CANDIDATE_FROZEN", "AUDIT_PASSED")).toBe(true);
    expect(isValidTransition("AUDIT_PASSED", "PAPER_READY")).toBe(true);
    expect(isValidTransition("PAPER_READY", "PAPER_RUNNING")).toBe(true);
  });

  it("allows CANDIDATE_FROZEN -> AUDIT_FAILED", () => {
    expect(isValidTransition("CANDIDATE_FROZEN", "AUDIT_FAILED")).toBe(true);
  });

  it("rejects skipping straight from CANDIDATE_FROZEN to PAPER_READY", () => {
    expect(isValidTransition("CANDIDATE_FROZEN", "PAPER_READY")).toBe(false);
  });

  it("rejects going backwards from PAPER_READY to AUDIT_PASSED", () => {
    expect(isValidTransition("PAPER_READY", "AUDIT_PASSED")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    expect(isValidTransition("AUDIT_FAILED", "AUDIT_PASSED")).toBe(false);
    expect(isValidTransition("REJECTED_FORWARD", "PAPER_RUNNING")).toBe(false);
    expect(isValidTransition("FORWARD_VERIFIED", "PAPER_RUNNING")).toBe(false);
  });
});

describe("isTerminalStatus", () => {
  it("identifies the three terminal states", () => {
    expect(isTerminalStatus("AUDIT_FAILED")).toBe(true);
    expect(isTerminalStatus("REJECTED_FORWARD")).toBe(true);
    expect(isTerminalStatus("FORWARD_VERIFIED")).toBe(true);
  });

  it("identifies non-terminal states", () => {
    expect(isTerminalStatus("CANDIDATE_FROZEN")).toBe(false);
    expect(isTerminalStatus("PAPER_READY")).toBe(false);
  });
});

describe("appendTransition", () => {
  it("requires the first-ever entry to be CANDIDATE_FROZEN", () => {
    const result = appendTransition([], "AUDIT_PASSED", "x", "2026-08-01T00:00:00Z");
    expect(result.error).toBeDefined();
    expect(result.history).toEqual([]);
  });

  it("accepts CANDIDATE_FROZEN as the first entry", () => {
    const result = appendTransition([], "CANDIDATE_FROZEN", "Candidate frozen from Block 5.", "2026-08-01T00:00:00Z");
    expect(result.error).toBeUndefined();
    expect(result.history).toEqual([{ status: "CANDIDATE_FROZEN", timestamp: "2026-08-01T00:00:00Z", reason: "Candidate frozen from Block 5." }]);
  });

  it("appends a valid subsequent transition", () => {
    const frozen: StatusTransition[] = [{ status: "CANDIDATE_FROZEN", timestamp: "2026-08-01T00:00:00Z", reason: "x" }];
    const result = appendTransition(frozen, "AUDIT_PASSED", "Engine audit passed.", "2026-08-02T00:00:00Z");
    expect(result.error).toBeUndefined();
    expect(result.history).toHaveLength(2);
    expect(currentStatus(result.history)).toBe("AUDIT_PASSED");
  });

  it("rejects an invalid subsequent transition and returns the ORIGINAL history unchanged", () => {
    const frozen: StatusTransition[] = [{ status: "CANDIDATE_FROZEN", timestamp: "2026-08-01T00:00:00Z", reason: "x" }];
    const result = appendTransition(frozen, "PAPER_RUNNING", "x", "2026-08-02T00:00:00Z");
    expect(result.error).toBeDefined();
    expect(result.history).toEqual(frozen);
    expect(result.history).not.toBe(frozen); // still a new array, per the "never mutates" contract
  });

  it("VALIDATED is not a representable status at all (TypeScript-level guarantee, exercised as a runtime check here too)", () => {
    const frozen: StatusTransition[] = [{ status: "CANDIDATE_FROZEN", timestamp: "2026-08-01T00:00:00Z", reason: "x" }];
    // @ts-expect-error — "VALIDATED" is not a member of Rs3mStatus; this line exists to prove the type system rejects it.
    const result = appendTransition(frozen, "VALIDATED", "x", "2026-08-02T00:00:00Z");
    expect(result.error).toBeDefined();
  });

  it("never mutates the input history array", () => {
    const original: StatusTransition[] = [{ status: "CANDIDATE_FROZEN", timestamp: "2026-08-01T00:00:00Z", reason: "x" }];
    const originalLength = original.length;
    appendTransition(original, "AUDIT_PASSED", "x", "2026-08-02T00:00:00Z");
    expect(original).toHaveLength(originalLength);
  });
});

describe("currentStatus", () => {
  it("is undefined for an empty history", () => {
    expect(currentStatus([])).toBeUndefined();
  });

  it("is the last entry's status", () => {
    const history: StatusTransition[] = [
      { status: "CANDIDATE_FROZEN", timestamp: "t1", reason: "x" },
      { status: "AUDIT_PASSED", timestamp: "t2", reason: "x" },
    ];
    expect(currentStatus(history)).toBe("AUDIT_PASSED");
  });
});
