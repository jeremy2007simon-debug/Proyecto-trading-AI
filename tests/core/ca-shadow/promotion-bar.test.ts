import { describe, expect, it } from "vitest";
import { CA_PROMOTION_BAR, evaluateCaPromotionBar } from "@/core/ca-shadow/promotion-bar";
import type { CaForwardEvidenceRecord } from "@/core/ca-shadow/forward-evidence";

function row(overrides: Partial<CaForwardEvidenceRecord> = {}): CaForwardEvidenceRecord {
  return {
    date: "2026-09-01",
    candidateId: "CA_CANDIDATE_V1",
    candidateHash: "f6b860f5",
    dataCutoff: "2026-09-01T21:00:00.000Z",
    dataSource: "ALPACA",
    signal: undefined,
    guardResult: { passed: true, violations: [] },
    decision: "HOLD_FLAT",
    theoreticalPrice: 500,
    hypotheticalFillPrice: undefined,
    slippageAssumption: "0",
    costBps: 3,
    costFraction: 0.0003,
    positionBefore: "FLAT",
    positionAfter: "FLAT",
    entryPriceAfter: undefined,
    entryDateAfter: undefined,
    dailyPnlPct: 0,
    shadowEquityBefore: 1,
    shadowEquityAfter: 1,
    spyBenchmarkClose: 500,
    dataAdjustment: "SPLIT_AND_DIVIDEND_ADJUSTED_CLOSE",
    warnings: [],
    ...overrides,
  };
}

const FORWARD_START = "2026-08-23T00:00:00.000Z";

describe("Block 10 §23/§24 — evaluateCaPromotionBar", () => {
  it("both operationalVerified and forwardEvidenceSufficient are false with zero evidence — never fabricates readiness", () => {
    const result = evaluateCaPromotionBar({ dailyEquityRows: [], forwardStartTimestamp: FORWARD_START, nowIso: "2026-08-24T00:00:00.000Z" });
    expect(result.operationalVerified).toBe(false);
    expect(result.forwardEvidenceSufficient).toBe(false);
    expect(result.operational.tradingDaysProcessed).toBe(0);
    expect(result.forwardEvidence.completedTrades).toBe(0);
  });

  it("operationalVerified requires at least minForwardTradingDays processed days with no hash/adjustment mismatch and consistent cost", () => {
    const rows = Array.from({ length: CA_PROMOTION_BAR.minForwardTradingDays }, (_, i) => row({ date: `2026-09-${String(i + 1).padStart(2, "0")}` }));
    const result = evaluateCaPromotionBar({ dailyEquityRows: rows, forwardStartTimestamp: FORWARD_START, nowIso: "2026-12-01T00:00:00.000Z" });
    expect(result.operationalVerified).toBe(true);
  });

  it("a single CANDIDATE_HASH_MISMATCH row anywhere fails operationalVerified, even with enough days", () => {
    const rows = Array.from({ length: CA_PROMOTION_BAR.minForwardTradingDays }, (_, i) => row({ date: `2026-09-${String(i + 1).padStart(2, "0")}` }));
    rows[3] = row({ date: "2026-09-04", decision: "BLOCKED", guardResult: { passed: false, violations: [{ guard: "CANDIDATE_HASH_MISMATCH", reason: "x" }] } });
    const result = evaluateCaPromotionBar({ dailyEquityRows: rows, forwardStartTimestamp: FORWARD_START, nowIso: "2026-12-01T00:00:00.000Z" });
    expect(result.operationalVerified).toBe(false);
    expect(result.operational.hasCandidateHashOrAdjustmentMismatch).toBe(true);
  });

  it("more than maxConsecutiveDataStaleBlocks consecutive DATA_STALE blocks fails operationalVerified", () => {
    const rows = Array.from({ length: CA_PROMOTION_BAR.minForwardTradingDays }, (_, i) => row({ date: `2026-09-${String(i + 1).padStart(2, "0")}` }));
    for (let i = 0; i < CA_PROMOTION_BAR.maxConsecutiveDataStaleBlocks + 1; i++) {
      rows[i] = row({ date: rows[i].date, decision: "BLOCKED", guardResult: { passed: false, violations: [{ guard: "DATA_STALE", reason: "x" }] } });
    }
    const result = evaluateCaPromotionBar({ dailyEquityRows: rows, forwardStartTimestamp: FORWARD_START, nowIso: "2026-12-01T00:00:00.000Z" });
    expect(result.operationalVerified).toBe(false);
    expect(result.operational.longestConsecutiveDataStaleStreak).toBeGreaterThan(CA_PROMOTION_BAR.maxConsecutiveDataStaleBlocks);
  });

  it("inconsistent costBps across ENTER rows fails operationalVerified (cost assumption must never silently drift, §11/§22)", () => {
    const rows = [row({ date: "2026-09-01", decision: "ENTER", costBps: 3 }), row({ date: "2026-09-02", decision: "ENTER", costBps: 4 }), ...Array.from({ length: 18 }, (_, i) => row({ date: `2026-09-${String(i + 3).padStart(2, "0")}` }))];
    const result = evaluateCaPromotionBar({ dailyEquityRows: rows, forwardStartTimestamp: FORWARD_START, nowIso: "2026-12-01T00:00:00.000Z" });
    expect(result.operational.costBpsConsistent).toBe(false);
    expect(result.operationalVerified).toBe(false);
  });

  it("forwardEvidenceSufficient requires BOTH minForwardCalendarDays elapsed AND minShadowTrades completed", () => {
    const enoughTrades = Array.from({ length: CA_PROMOTION_BAR.minShadowTrades }, (_, i) => row({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, decision: "EXIT" }));

    const notEnoughTime = evaluateCaPromotionBar({ dailyEquityRows: enoughTrades, forwardStartTimestamp: FORWARD_START, nowIso: "2026-09-10T00:00:00.000Z" });
    expect(notEnoughTime.forwardEvidenceSufficient).toBe(false);

    const enoughTimeAndTrades = evaluateCaPromotionBar({ dailyEquityRows: enoughTrades, forwardStartTimestamp: FORWARD_START, nowIso: "2027-01-01T00:00:00.000Z" });
    expect(enoughTimeAndTrades.forwardEvidence.calendarDaysSinceForwardStart).toBeGreaterThanOrEqual(CA_PROMOTION_BAR.minForwardCalendarDays);
    expect(enoughTimeAndTrades.forwardEvidenceSufficient).toBe(true);

    const enoughTimeNotEnoughTrades = evaluateCaPromotionBar({ dailyEquityRows: enoughTrades.slice(0, 1), forwardStartTimestamp: FORWARD_START, nowIso: "2027-01-01T00:00:00.000Z" });
    expect(enoughTimeNotEnoughTrades.forwardEvidenceSufficient).toBe(false);
  });

  it("operationalVerified and forwardEvidenceSufficient are independent — a fully operational pipeline with only 1 trade is NOT forward-sufficient", () => {
    const rows = Array.from({ length: CA_PROMOTION_BAR.minForwardTradingDays }, (_, i) => row({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, decision: i === 0 ? "EXIT" : "HOLD_FLAT" }));
    const result = evaluateCaPromotionBar({ dailyEquityRows: rows, forwardStartTimestamp: FORWARD_START, nowIso: "2027-06-01T00:00:00.000Z" });
    expect(result.operationalVerified).toBe(true);
    expect(result.forwardEvidence.completedTrades).toBe(1);
    expect(result.forwardEvidenceSufficient).toBe(false);
  });
});
