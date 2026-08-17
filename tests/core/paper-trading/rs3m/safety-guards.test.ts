import { describe, expect, it } from "vitest";
import {
  assertCandidateHashNotTampered,
  assertNoLeverage,
  assertNoShortOrder,
  assertNotAlreadyExecutedThisMonth,
  assertPaperOnly,
  assertSignalNotStale,
  assertSymbolWhitelisted,
  runAllRs3mSafetyGuards,
  EXPECTED_RS3M_CANDIDATE_V1_HASH,
  RS3M_ALLOWED_SYMBOLS,
} from "@/core/paper-trading/rs3m/safety-guards";
import type { RebalancePlanOrder } from "@/core/paper-trading/rs3m/rebalance-planner";

describe("assertPaperOnly", () => {
  it("passes for the real client (which hardcodes the paper URL)", () => {
    expect(assertPaperOnly()).toBeUndefined();
  });
});

describe("assertSymbolWhitelisted", () => {
  it("passes for every allowed symbol", () => {
    for (const symbol of RS3M_ALLOWED_SYMBOLS) expect(assertSymbolWhitelisted(symbol)).toBeUndefined();
  });

  it("fails for a symbol outside the universe", () => {
    const violation = assertSymbolWhitelisted("TSLA");
    expect(violation).toBeDefined();
    expect(violation!.guard).toBe("SYMBOL_WHITELIST");
  });
});

describe("assertNoShortOrder", () => {
  it("passes a sell for a symbol that IS currently held", () => {
    const order: RebalancePlanOrder = { symbol: "SPY", side: "sell", notionalUsd: 1000, reason: "x" };
    expect(assertNoShortOrder(order, new Set(["SPY"]))).toBeUndefined();
  });

  it("fails a sell for a symbol NOT currently held (would open a short)", () => {
    const order: RebalancePlanOrder = { symbol: "SPY", side: "sell", notionalUsd: 1000, reason: "x" };
    const violation = assertNoShortOrder(order, new Set());
    expect(violation?.guard).toBe("NO_SHORTS");
  });

  it("passes any buy order regardless of holdings", () => {
    const order: RebalancePlanOrder = { symbol: "SPY", side: "buy", notionalUsd: 1000, reason: "x" };
    expect(assertNoShortOrder(order, new Set())).toBeUndefined();
  });
});

describe("assertNoLeverage", () => {
  it("passes a buy notional at or below total portfolio value", () => {
    const order: RebalancePlanOrder = { symbol: "SPY", side: "buy", notionalUsd: 10000, reason: "x" };
    expect(assertNoLeverage(order, 10000)).toBeUndefined();
  });

  it("fails a buy notional exceeding total portfolio value beyond the rounding epsilon", () => {
    const order: RebalancePlanOrder = { symbol: "SPY", side: "buy", notionalUsd: 10005, reason: "x" };
    const violation = assertNoLeverage(order, 10000);
    expect(violation?.guard).toBe("NO_LEVERAGE");
  });

  it("tolerates a sub-cent rounding difference", () => {
    const order: RebalancePlanOrder = { symbol: "SPY", side: "buy", notionalUsd: 10000.1, reason: "x" };
    expect(assertNoLeverage(order, 10000)).toBeUndefined();
  });
});

describe("assertNotAlreadyExecutedThisMonth", () => {
  it("passes when not yet executed", () => {
    expect(assertNotAlreadyExecutedThisMonth("2026-08", false)).toBeUndefined();
  });

  it("fails when already executed", () => {
    const violation = assertNotAlreadyExecutedThisMonth("2026-08", true);
    expect(violation?.guard).toBe("IDEMPOTENCY");
  });
});

describe("assertSignalNotStale", () => {
  it("passes for a fresh signal", () => {
    expect(assertSignalNotStale("2026-08-03T00:00:00Z", "2026-08-03T14:00:00Z")).toBeUndefined();
  });

  it("fails for a signal older than the max stale days", () => {
    const violation = assertSignalNotStale("2026-07-01T00:00:00Z", "2026-08-03T00:00:00Z", 10);
    expect(violation?.guard).toBe("STALE_SIGNAL");
  });

  it("fails for a signal timestamped in the future relative to now (clock/data bug)", () => {
    const violation = assertSignalNotStale("2026-08-10T00:00:00Z", "2026-08-03T00:00:00Z");
    expect(violation?.guard).toBe("STALE_SIGNAL");
    expect(violation!.reason).toContain("clock or data bug");
  });
});

describe("assertCandidateHashNotTampered", () => {
  it("passes when the actual hash matches the expected hash", () => {
    expect(assertCandidateHashNotTampered("RS3M_CANDIDATE_V1", "abc123", "abc123")).toBeUndefined();
  });

  it("fails when the actual hash does not match — the candidate may have been edited in place", () => {
    const violation = assertCandidateHashNotTampered("RS3M_CANDIDATE_V1", "deadbeef", "abc123");
    expect(violation?.guard).toBe("CANDIDATE_HASH_MISMATCH");
    expect(violation!.reason).toContain("edited in place");
  });

  it("defaults the expected hash to the pinned RS3M_CANDIDATE_V1 value when not passed explicitly", () => {
    expect(assertCandidateHashNotTampered("RS3M_CANDIDATE_V1", EXPECTED_RS3M_CANDIDATE_V1_HASH)).toBeUndefined();
    expect(assertCandidateHashNotTampered("RS3M_CANDIDATE_V1", "tampered")?.guard).toBe("CANDIDATE_HASH_MISMATCH");
  });
});

describe("runAllRs3mSafetyGuards", () => {
  const baseParams = {
    orders: [{ symbol: "SPY", side: "buy", notionalUsd: 10000, reason: "x" } satisfies RebalancePlanOrder],
    currentlyHeldSymbols: new Set<string>(),
    totalPortfolioValue: 10000,
    decisionMonth: "2026-08",
    alreadyExecutedThisMonth: false,
    signalDataCutoffTimestamp: "2026-08-03T00:00:00Z",
    nowIso: "2026-08-03T14:00:00Z",
    candidateId: "RS3M_CANDIDATE_V1",
    candidateHash: EXPECTED_RS3M_CANDIDATE_V1_HASH,
  };

  it("passes when every guard passes", () => {
    const result = runAllRs3mSafetyGuards(baseParams);
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("collects ALL violations at once — never short-circuits on the first failure", () => {
    const result = runAllRs3mSafetyGuards({
      ...baseParams,
      orders: [{ symbol: "TSLA", side: "buy", notionalUsd: 999999, reason: "x" } satisfies RebalancePlanOrder],
      alreadyExecutedThisMonth: true,
    });

    expect(result.passed).toBe(false);
    const guards = result.violations.map((v) => v.guard);
    expect(guards).toContain("IDEMPOTENCY");
    expect(guards).toContain("SYMBOL_WHITELIST");
    expect(guards).toContain("NO_LEVERAGE");
  });

  it("fails overall if even a single guard fails, regardless of how many pass", () => {
    const result = runAllRs3mSafetyGuards({ ...baseParams, alreadyExecutedThisMonth: true });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].guard).toBe("IDEMPOTENCY");
  });

  it("blocks the whole run if the candidate hash doesn't match the pinned expected value (tamper detection)", () => {
    const result = runAllRs3mSafetyGuards({ ...baseParams, candidateHash: "tampered-hash" });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.guard === "CANDIDATE_HASH_MISMATCH")).toBe(true);
  });
});
