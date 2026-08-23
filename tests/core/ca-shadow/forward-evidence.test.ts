import { describe, expect, it } from "vitest";
import { computeCaMonthlySummaries, type CaForwardEvidenceRecord } from "@/core/ca-shadow/forward-evidence";

function row(overrides: Partial<CaForwardEvidenceRecord>): CaForwardEvidenceRecord {
  return {
    date: "2020-01-01",
    candidateId: "CA_CANDIDATE_V1",
    candidateHash: "f6b860f5",
    dataCutoff: "2020-01-01T21:00:00.000Z",
    dataSource: "test",
    signal: undefined,
    guardResult: { passed: true, violations: [] },
    decision: "HOLD_FLAT",
    theoreticalPrice: 100,
    hypotheticalFillPrice: undefined,
    slippageAssumption: "0",
    costBps: 20,
    costFraction: 0.002,
    positionBefore: "FLAT",
    positionAfter: "FLAT",
    entryPriceAfter: undefined,
    entryDateAfter: undefined,
    dailyPnlPct: 0,
    shadowEquityBefore: 1,
    shadowEquityAfter: 1,
    spyBenchmarkClose: 100,
    dataAdjustment: "SPLIT_AND_DIVIDEND_ADJUSTED_CLOSE",
    warnings: [],
    ...overrides,
  };
}

describe("Block 10 §7/§16 — computeCaMonthlySummaries", () => {
  it("groups rows by calendar month (YYYY-MM) and computes start/end equity + return", () => {
    const rows = [
      row({ date: "2020-01-05", shadowEquityBefore: 1, shadowEquityAfter: 1.01 }),
      row({ date: "2020-01-06", shadowEquityBefore: 1.01, shadowEquityAfter: 1.02 }),
      row({ date: "2020-02-03", shadowEquityBefore: 1.02, shadowEquityAfter: 1.05 }),
    ];
    const summaries = computeCaMonthlySummaries(rows);

    expect(summaries).toHaveLength(2);
    expect(summaries[0].month).toBe("2020-01");
    expect(summaries[0].startEquity).toBe(1);
    expect(summaries[0].endEquity).toBe(1.02);
    expect(summaries[0].monthlyReturnPct).toBeCloseTo(2, 6);
    expect(summaries[1].month).toBe("2020-02");
    expect(summaries[1].startEquity).toBe(1.02);
    expect(summaries[1].endEquity).toBe(1.05);
  });

  it("counts ENTER decisions as trades and BLOCKED decisions separately, per month", () => {
    const rows = [row({ date: "2020-01-05", decision: "ENTER" }), row({ date: "2020-01-06", decision: "EXIT" }), row({ date: "2020-01-07", decision: "BLOCKED" }), row({ date: "2020-01-08", decision: "HOLD_FLAT" })];
    const [summary] = computeCaMonthlySummaries(rows);

    expect(summary.trades).toBe(1);
    expect(summary.blockedDays).toBe(1);
    expect(summary.daysProcessed).toBe(4);
  });

  it("returns [] for no rows", () => {
    expect(computeCaMonthlySummaries([])).toEqual([]);
  });

  it("months are returned in chronological order regardless of input order", () => {
    const rows = [row({ date: "2020-03-01" }), row({ date: "2020-01-01" }), row({ date: "2020-02-01" })];
    const summaries = computeCaMonthlySummaries(rows);
    expect(summaries.map((s) => s.month)).toEqual(["2020-01", "2020-02", "2020-03"]);
  });
});
