import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    ranking: [{ market: "DOWJONES", trailingReturnPct: 5.95 }],
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

/** Path-aware — `rs3m-guards-adapter.ts` also (transitively, via `getRs3mStrategy`) reads the unrelated status-history file, which must NOT see this ledger content or it mis-parses it (see the crash this was written to catch). */
function mockLedger(rows: ForwardEvidenceRecord[]): void {
  const content = rows.map((r) => JSON.stringify(r)).join("\n");
  existsSyncMock.mockImplementation((path: string) => path.includes("ledger.jsonl") && rows.length > 0);
  readFileSyncMock.mockImplementation((path: string) => (path.includes("ledger.jsonl") ? content : ""));
}

describe("getRs3mExecutionSafety", () => {
  const originalKeyId = process.env.ALPACA_PAPER_API_KEY_ID;
  const originalSecret = process.env.ALPACA_PAPER_API_SECRET_KEY;

  beforeEach(() => {
    delete process.env.ALPACA_PAPER_API_KEY_ID;
    delete process.env.ALPACA_PAPER_API_SECRET_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    if (originalKeyId === undefined) delete process.env.ALPACA_PAPER_API_KEY_ID;
    else process.env.ALPACA_PAPER_API_KEY_ID = originalKeyId;
    if (originalSecret === undefined) delete process.env.ALPACA_PAPER_API_SECRET_KEY;
    else process.env.ALPACA_PAPER_API_SECRET_KEY = originalSecret;
  });

  it("always PASSes the structurally-verifiable guards (candidate hash, paper endpoint) even with an empty ledger", async () => {
    mockLedger([]);
    const { getRs3mExecutionSafety } = await import("@/novacore/execution-center/adapters/rs3m-guards-adapter");
    const safety = await getRs3mExecutionSafety();
    const hashGuard = safety.guards.find((g) => g.guardCode === "CANDIDATE_HASH_MISMATCH");
    const endpointGuard = safety.guards.find((g) => g.guardCode === "PAPER_ONLY");
    expect(hashGuard?.status).toBe("PASS");
    expect(endpointGuard?.status).toBe("PASS");
  });

  it("never PASSes a plan-dependent guard when no signal has ever been computed — reports UNAVAILABLE instead", async () => {
    mockLedger([]);
    const { getRs3mExecutionSafety } = await import("@/novacore/execution-center/adapters/rs3m-guards-adapter");
    const safety = await getRs3mExecutionSafety();
    const staleSignalGuard = safety.guards.find((g) => g.guardCode === "STALE_SIGNAL");
    const symbolGuard = safety.guards.find((g) => g.guardCode === "SYMBOL_WHITELIST");
    expect(staleSignalGuard?.status).toBe("UNAVAILABLE");
    expect(symbolGuard?.status).toBe("UNAVAILABLE");
  });

  it("reports credentials as UNAVAILABLE, not a false failure, when unset (the real state of this environment)", async () => {
    mockLedger([]);
    const { getRs3mExecutionSafety } = await import("@/novacore/execution-center/adapters/rs3m-guards-adapter");
    const safety = await getRs3mExecutionSafety();
    const credGuard = safety.guards.find((g) => g.guardCode === "CREDENTIALS");
    expect(credGuard?.status).toBe("UNAVAILABLE");
  });

  it("marks a guard BLOCKED when the ledger row recorded a real violation for it", async () => {
    mockLedger([record({ finalState: "BLOCKED", guardViolations: [{ guard: "NO_LEVERAGE", reason: "notional exceeds portfolio value" }] })]);
    const { getRs3mExecutionSafety } = await import("@/novacore/execution-center/adapters/rs3m-guards-adapter");
    const safety = await getRs3mExecutionSafety();
    const leverageGuard = safety.guards.find((g) => g.guardCode === "NO_LEVERAGE");
    expect(leverageGuard?.status).toBe("BLOCKED");
    expect(safety.overallStatus).toBe("BLOCKED");
  });

  it("marks the approval guard AWAITING_APPROVAL (not BLOCKED) when it's the only violation", async () => {
    mockLedger([record({ finalState: "BLOCKED", guardViolations: [{ guard: "APPROVAL_REQUIRED", reason: "no approval on file" }] })]);
    const { getRs3mExecutionSafety } = await import("@/novacore/execution-center/adapters/rs3m-guards-adapter");
    const safety = await getRs3mExecutionSafety();
    expect(safety.approvalStatus).toBe("REQUIRED");
    expect(safety.guards.find((g) => g.guardCode === "APPROVAL_REQUIRED")?.status).toBe("AWAITING_APPROVAL");
  });

  it("counts orders submitted only from EXECUTED rows, never a fabricated number", async () => {
    mockLedger([record({ finalState: "EXECUTED", submittedOrders: [{ orderId: "1", clientOrderId: "c1", symbol: "DIA", side: "buy", notionalUsd: 100000, status: "filled", filledAt: "2026-09-01T14:00:00Z", filledAvgPrice: 400, filledQty: 250 }] })]);
    const { getRs3mExecutionSafety } = await import("@/novacore/execution-center/adapters/rs3m-guards-adapter");
    const safety = await getRs3mExecutionSafety();
    expect(safety.ordersSubmitted).toBe(1);
  });
});
