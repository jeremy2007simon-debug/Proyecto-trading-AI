import { describe, expect, it } from "vitest";
import { buildCaNotificationEvents } from "@/core/ca-shadow/notification-events";
import type { ShadowDayResult } from "@/core/ca-shadow/shadow-engine";

function dayResult(overrides: Partial<ShadowDayResult>): ShadowDayResult {
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

describe("Block 10 §15 — buildCaNotificationEvents: no spam, only meaningful days notify", () => {
  it("produces NOTHING for a plain untriggered HOLD_FLAT day", () => {
    expect(buildCaNotificationEvents(dayResult({ decision: "HOLD_FLAT", signal: undefined }))).toEqual([]);
  });

  it("produces CA_SIGNAL + CA_SHADOW_ENTRY on an ENTER day", () => {
    const signal = { decisionDate: "2020-01-01", decisionReturn: -0.05, percentileThreshold: -0.03, percentileRank: 0.02, triggered: true, windowSize: 252, sufficientHistory: true };
    const events = buildCaNotificationEvents(dayResult({ decision: "ENTER", signal, hypotheticalFillPrice: 100 }));
    expect(events.map((e) => e.type)).toEqual(["CA_SIGNAL", "CA_SHADOW_ENTRY"]);
  });

  it("produces CA_SHADOW_EXIT on an EXIT day", () => {
    const events = buildCaNotificationEvents(dayResult({ decision: "EXIT", hypotheticalFillPrice: 102, dailyPnlPct: 0.02 }));
    expect(events.map((e) => e.type)).toEqual(["CA_SHADOW_EXIT"]);
  });

  it("produces CA_DATA_STALE specifically when the DATA_STALE guard fired", () => {
    const events = buildCaNotificationEvents(dayResult({ decision: "BLOCKED", guardResult: { passed: false, violations: [{ guard: "DATA_STALE", reason: "x" }] } }));
    expect(events.map((e) => e.type)).toEqual(["CA_DATA_STALE"]);
  });

  it("produces CA_SHADOW_ERROR for any other block reason", () => {
    const events = buildCaNotificationEvents(dayResult({ decision: "BLOCKED", guardResult: { passed: false, violations: [{ guard: "CANDIDATE_HASH_MISMATCH", reason: "x" }] } }));
    expect(events.map((e) => e.type)).toEqual(["CA_SHADOW_ERROR"]);
  });
});
