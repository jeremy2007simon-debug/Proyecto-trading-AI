import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaForwardEvidenceRecord } from "@/core/ca-shadow/forward-evidence";

const appendFileSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => {
  const mocked = {
    appendFileSync: (...args: unknown[]) => appendFileSyncMock(...args),
    mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
  };
  return { ...mocked, default: mocked };
});

function row(overrides: Partial<CaForwardEvidenceRecord> = {}): CaForwardEvidenceRecord {
  return {
    date: "2026-09-01",
    candidateId: "CA_CANDIDATE_V1",
    candidateHash: "f6b860f5",
    dataCutoff: "2026-09-01T21:00:00.000Z",
    dataSource: "ALPACA",
    signal: { decisionDate: "2026-09-01", decisionReturn: -0.02, percentileThreshold: -0.015, percentileRank: 0.05, triggered: false, windowSize: 252, sufficientHistory: true },
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

describe("Block 10 §16 — getCaShadowSnapshot: insufficient-data state, never fabricated", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders every field as an honest empty/unavailable state with zero forward evidence", async () => {
    existsSyncMock.mockReturnValue(false);
    const { getCaShadowSnapshot } = await import("@/novacore/strategy-hub/adapters/ca-shadow-snapshot-adapter");
    const snapshot = getCaShadowSnapshot();

    expect(snapshot.hasForwardEvidence).toBe(false);
    expect(snapshot.latestSignal).toBeUndefined();
    expect(snapshot.shadow.daysProcessed).toBe(0);
    expect(snapshot.shadow.trades).toBe(0);
    expect(snapshot.shadow.hypotheticalEquity).toBe(1);
    expect(snapshot.shadow.realizedShadowPnlPct).toBe(0);
    expect(snapshot.shadow.lastFill).toBeUndefined();
    expect(snapshot.shadow.spyBenchmarkReturnPct).toBeUndefined();
    expect(snapshot.risk.currentDrawdownPct).toBeUndefined();
    expect(snapshot.promotionBar.operationalVerified).toBe(false);
    expect(snapshot.promotionBar.forwardEvidenceSufficient).toBe(false);
  });

  it("computes currentDrawdownPct as the running-peak drawdown once evidence exists", async () => {
    existsSyncMock.mockReturnValue(true);
    const rows = [
      row({ date: "2026-09-01", decision: "ENTER", shadowEquityBefore: 1, shadowEquityAfter: 1, positionAfter: "LONG", entryPriceAfter: 500, entryDateAfter: "2026-09-01" }),
      row({ date: "2026-09-02", decision: "EXIT", shadowEquityBefore: 1, shadowEquityAfter: 0.9, positionAfter: "FLAT", spyBenchmarkClose: 490 }),
    ];
    readFileSyncMock.mockReturnValue(rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

    const { getCaShadowSnapshot } = await import("@/novacore/strategy-hub/adapters/ca-shadow-snapshot-adapter");
    const snapshot = getCaShadowSnapshot();

    expect(snapshot.hasForwardEvidence).toBe(true);
    expect(snapshot.risk.currentDrawdownPct).toBeCloseTo(10, 6); // peak 1.0 -> 0.9 = 10% DD
    expect(snapshot.shadow.spyBenchmarkReturnPct).toBeCloseTo(-2, 6); // 500 -> 490
  });
});
