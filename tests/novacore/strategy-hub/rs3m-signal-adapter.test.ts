import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForwardEvidenceRecord } from "@/core/paper-trading/rs3m/forward-evidence";

const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => {
  const mocked = { existsSync: (...args: unknown[]) => existsSyncMock(...args), readFileSync: (...args: unknown[]) => readFileSyncMock(...args) };
  return { ...mocked, default: mocked };
});

function record(overrides: Partial<ForwardEvidenceRecord> = {}): ForwardEvidenceRecord {
  return {
    timestamp: "2026-09-01T13:36:00Z",
    candidateId: "RS3M_CANDIDATE_V1",
    candidateHash: "1c28b57c",
    decisionMonth: "2026-08",
    dataCutoff: "2026-08-31T20:00:00Z",
    ranking: [
      { market: "DOWJONES", trailingReturnPct: 5.95 },
      { market: "RUSSELL2000", trailingReturnPct: 5.01 },
      { market: "SP500", trailingReturnPct: 4.22 },
      { market: "NASDAQ100", trailingReturnPct: 3.15 },
    ],
    winner: "DOWJONES",
    accountEquityUsd: 100000,
    accountEquityAfterUsd: undefined,
    positionsBefore: [],
    targetAsset: "DIA",
    proposedOrders: [{ symbol: "DIA", side: "buy", notionalUsd: 100000, reason: "single-winner rotation" }],
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

function mockLedger(rows: ForwardEvidenceRecord[]): void {
  existsSyncMock.mockReturnValue(rows.length > 0);
  readFileSyncMock.mockReturnValue(rows.map((r) => JSON.stringify(r)).join("\n"));
}

describe("getRs3mCurrentSignal", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("reports UNAVAILABLE — never a fabricated ranking — when the ledger has no rows", async () => {
    mockLedger([]);
    const { getRs3mCurrentSignal } = await import("@/novacore/strategy-hub/adapters/rs3m-signal-adapter");
    const signal = getRs3mCurrentSignal();
    expect(signal.status).toBe("UNAVAILABLE");
    expect(signal.ranking).toEqual([]);
    expect(signal.winner).toBeUndefined();
    expect(signal.provenance).toBe("UNAVAILABLE");
  });

  it("surfaces the exact ranking/winner/hash from a real EXECUTED ledger row, never re-deriving them", async () => {
    mockLedger([record({ finalState: "EXECUTED" })]);
    const { getRs3mCurrentSignal } = await import("@/novacore/strategy-hub/adapters/rs3m-signal-adapter");
    const signal = getRs3mCurrentSignal();

    expect(signal.status).toBe("EXECUTED");
    expect(signal.winner).toBe("DOWJONES");
    expect(signal.winnerTicker).toBe("DIA");
    expect(signal.ranking).toHaveLength(4);
    expect(signal.ranking.find((r) => r.market === "DOWJONES")?.trailingReturnPct).toBe(5.95);
    expect(signal.candidateHash).toBe("1c28b57c");
    expect(signal.provenance).toBe("FORWARD_EVIDENCE");
  });

  it("maps a BLOCKED row whose only violation is APPROVAL_REQUIRED to AWAITING_APPROVAL, not a generic BLOCKED", async () => {
    mockLedger([record({ finalState: "BLOCKED", guardViolations: [{ guard: "APPROVAL_REQUIRED", reason: "no approval on file" }] })]);
    const { getRs3mCurrentSignal } = await import("@/novacore/strategy-hub/adapters/rs3m-signal-adapter");
    const signal = getRs3mCurrentSignal();
    expect(signal.status).toBe("AWAITING_APPROVAL");
  });

  it("maps a BLOCKED row with any other violation to BLOCKED", async () => {
    mockLedger([record({ finalState: "BLOCKED", guardViolations: [{ guard: "STALE_SIGNAL", reason: "too old" }] })]);
    const { getRs3mCurrentSignal } = await import("@/novacore/strategy-hub/adapters/rs3m-signal-adapter");
    const signal = getRs3mCurrentSignal();
    expect(signal.status).toBe("BLOCKED");
  });

  it("never fabricates a live-computed ranking — it only ever echoes exactly what's in the ledger row", async () => {
    const uniqueRanking = [{ market: "SP500", trailingReturnPct: 1.23 }];
    mockLedger([record({ ranking: uniqueRanking, winner: "SP500" })]);
    const { getRs3mCurrentSignal } = await import("@/novacore/strategy-hub/adapters/rs3m-signal-adapter");
    const signal = getRs3mCurrentSignal();
    expect(signal.ranking).toHaveLength(1);
    expect(signal.ranking[0].trailingReturnPct).toBe(1.23);
  });
});
