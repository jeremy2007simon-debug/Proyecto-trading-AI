import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForwardEvidenceRecord } from "@/core/paper-trading/rs3m/forward-evidence";

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

function record(overrides: Partial<ForwardEvidenceRecord> = {}): ForwardEvidenceRecord {
  return {
    timestamp: "2026-09-01T13:36:00Z",
    candidateId: "RS3M_CANDIDATE_V1",
    candidateHash: "1c28b57c",
    decisionMonth: "2026-08",
    dataCutoff: "2026-08-31T20:00:00Z",
    ranking: [{ market: "DOWJONES", trailingReturnPct: 5.9 }],
    winner: "DOWJONES",
    accountEquityUsd: 100000,
    accountEquityAfterUsd: undefined,
    positionsBefore: [],
    targetAsset: "DIA",
    proposedOrders: [{ symbol: "DIA", side: "buy", notionalUsd: 100000, reason: "x" }],
    submittedOrders: [],
    averageFillPriceBySymbol: {},
    estimatedTurnoverPct: 100,
    referenceRebalanceCostBps: 20,
    positionsAfter: undefined,
    guardViolations: [],
    finalState: "EXECUTED",
    skipReason: undefined,
    anyOrderStillInFlight: false,
    mode: "PAPER_ONLY",
    ...overrides,
  };
}

describe("appendForwardEvidence", () => {
  afterEach(() => vi.clearAllMocks());

  it("ensures the results/block6/forward directory exists before writing", async () => {
    const { appendForwardEvidence } = await import("../../../../scripts/block6/paper/forward-evidence-store");
    appendForwardEvidence(record());

    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining("results/block6/forward"), { recursive: true });
  });

  it("appends one JSON line to ledger.jsonl, never truncating/rewriting", async () => {
    const { appendForwardEvidence } = await import("../../../../scripts/block6/paper/forward-evidence-store");
    appendForwardEvidence(record());

    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    const [path, content] = appendFileSyncMock.mock.calls[0] as [string, string];
    expect(path).toContain("ledger.jsonl");
    expect(content.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(content.trim()) as ForwardEvidenceRecord;
    expect(parsed.candidateId).toBe("RS3M_CANDIDATE_V1");
    expect(parsed.mode).toBe("PAPER_ONLY");
  });

  it("writes a separate append call per record (append-only, one row per call)", async () => {
    const { appendForwardEvidence } = await import("../../../../scripts/block6/paper/forward-evidence-store");
    appendForwardEvidence(record({ decisionMonth: "2026-08" }));
    appendForwardEvidence(record({ decisionMonth: "2026-09" }));

    expect(appendFileSyncMock).toHaveBeenCalledTimes(2);
  });
});

describe("readForwardEvidenceLedger", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns an empty array when the ledger file doesn't exist yet", async () => {
    existsSyncMock.mockReturnValue(false);
    const { readForwardEvidenceLedger } = await import("../../../../scripts/block6/paper/forward-evidence-store");

    expect(readForwardEvidenceLedger()).toEqual([]);
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it("parses each JSONL line back into a record, in file order", async () => {
    existsSyncMock.mockReturnValue(true);
    const r1 = record({ decisionMonth: "2026-08" });
    const r2 = record({ decisionMonth: "2026-09" });
    readFileSyncMock.mockReturnValue(`${JSON.stringify(r1)}\n${JSON.stringify(r2)}\n`);

    const { readForwardEvidenceLedger } = await import("../../../../scripts/block6/paper/forward-evidence-store");
    const result = readForwardEvidenceLedger();

    expect(result).toHaveLength(2);
    expect(result[0].decisionMonth).toBe("2026-08");
    expect(result[1].decisionMonth).toBe("2026-09");
  });

  it("skips blank trailing lines", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(`${JSON.stringify(record())}\n\n`);

    const { readForwardEvidenceLedger } = await import("../../../../scripts/block6/paper/forward-evidence-store");
    expect(readForwardEvidenceLedger()).toHaveLength(1);
  });
});
