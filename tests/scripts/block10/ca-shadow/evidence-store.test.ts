import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaForwardEvidenceRecord } from "@/core/ca-shadow/forward-evidence";
import { INITIAL_SHADOW_STATE } from "@/core/ca-shadow/shadow-engine";

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

function record(overrides: Partial<CaForwardEvidenceRecord> = {}): CaForwardEvidenceRecord {
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

describe("appendCaForwardEvidence", () => {
  afterEach(() => vi.clearAllMocks());

  it("writes to signals, daily-equity, and activity on a HOLD_FLAT day, but NOT positions/fills", async () => {
    const { appendCaForwardEvidence } = await import("../../../../scripts/block10/ca-shadow/evidence-store");
    appendCaForwardEvidence(record({ decision: "HOLD_FLAT" }));

    const dirsWritten = mkdirSyncMock.mock.calls.map((c) => c[0] as string);
    expect(dirsWritten.some((d) => d.includes("signals"))).toBe(true);
    expect(dirsWritten.some((d) => d.includes("daily-equity"))).toBe(true);
    expect(dirsWritten.some((d) => d.includes("activity"))).toBe(true);
    expect(dirsWritten.some((d) => d.includes("positions"))).toBe(false);
    expect(dirsWritten.some((d) => d.includes("fills"))).toBe(false);
    expect(appendFileSyncMock).toHaveBeenCalledTimes(3);
  });

  it("also writes to positions and fills on an ENTER day", async () => {
    const { appendCaForwardEvidence } = await import("../../../../scripts/block10/ca-shadow/evidence-store");
    appendCaForwardEvidence(record({ decision: "ENTER" }));

    expect(appendFileSyncMock).toHaveBeenCalledTimes(5);
    const paths = appendFileSyncMock.mock.calls.map((c) => c[0] as string);
    expect(paths.some((p) => p.includes("positions"))).toBe(true);
    expect(paths.some((p) => p.includes("fills"))).toBe(true);
  });

  it("appends never-truncating JSONL lines ending in newline", async () => {
    const { appendCaForwardEvidence } = await import("../../../../scripts/block10/ca-shadow/evidence-store");
    appendCaForwardEvidence(record());

    for (const call of appendFileSyncMock.mock.calls) {
      const content = call[1] as string;
      expect(content.endsWith("\n")).toBe(true);
      expect(() => JSON.parse(content.trim())).not.toThrow();
    }
  });
});

describe("readCaForwardLedger", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns [] when the ledger doesn't exist yet", async () => {
    existsSyncMock.mockReturnValue(false);
    const { readCaForwardLedger } = await import("../../../../scripts/block10/ca-shadow/evidence-store");
    expect(readCaForwardLedger("signals")).toEqual([]);
  });

  it("parses JSONL rows back in file order", async () => {
    existsSyncMock.mockReturnValue(true);
    const r1 = record({ date: "2020-01-01" });
    const r2 = record({ date: "2020-01-02" });
    readFileSyncMock.mockReturnValue(`${JSON.stringify(r1)}\n${JSON.stringify(r2)}\n`);
    const { readCaForwardLedger } = await import("../../../../scripts/block10/ca-shadow/evidence-store");
    const rows = readCaForwardLedger("daily-equity");
    expect(rows.map((r) => r.date)).toEqual(["2020-01-01", "2020-01-02"]);
  });
});

describe("readLastShadowState", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns INITIAL_SHADOW_STATE when no forward evidence exists yet", async () => {
    existsSyncMock.mockReturnValue(false);
    const { readLastShadowState } = await import("../../../../scripts/block10/ca-shadow/evidence-store");
    expect(readLastShadowState()).toEqual(INITIAL_SHADOW_STATE);
  });

  it("reconstructs position/equity/entry from the last NON-BLOCKED row", async () => {
    existsSyncMock.mockReturnValue(true);
    const rows = [
      record({ date: "2020-01-05", decision: "ENTER", positionAfter: "LONG", entryPriceAfter: 100, entryDateAfter: "2020-01-05", shadowEquityAfter: 0.998 }),
      record({ date: "2020-01-06", decision: "BLOCKED", positionAfter: "LONG", entryPriceAfter: 100, entryDateAfter: "2020-01-05", shadowEquityAfter: 0.998 }),
    ];
    readFileSyncMock.mockReturnValue(rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const { readLastShadowState } = await import("../../../../scripts/block10/ca-shadow/evidence-store");
    const state = readLastShadowState();

    // The BLOCKED row must NOT be treated as "processed" — lastProcessedDate stays at the last row that actually went through, so a later retry of 2020-01-06 is still allowed (not rejected as a duplicate).
    expect(state.lastProcessedDate).toBe("2020-01-05");
    expect(state.position).toBe("LONG");
    expect(state.entryPrice).toBe(100);
  });

  it("skips ALL-BLOCKED trailing rows and returns INITIAL_SHADOW_STATE if nothing ever processed successfully", async () => {
    existsSyncMock.mockReturnValue(true);
    const rows = [record({ date: "2020-01-05", decision: "BLOCKED" })];
    readFileSyncMock.mockReturnValue(rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const { readLastShadowState } = await import("../../../../scripts/block10/ca-shadow/evidence-store");
    expect(readLastShadowState()).toEqual(INITIAL_SHADOW_STATE);
  });
});
