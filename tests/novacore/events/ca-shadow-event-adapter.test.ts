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

describe("getCaShadowEvents", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns [] when no forward evidence exists yet", async () => {
    existsSyncMock.mockReturnValue(false);
    const { getCaShadowEvents } = await import("@/novacore/events/adapters/ca-shadow-event-adapter");
    expect(getCaShadowEvents()).toEqual([]);
  });

  it("emits SHADOW_INITIALIZED only for the first row, plus FORWARD_EVIDENCE_RECORDED for every row", async () => {
    existsSyncMock.mockReturnValue(true);
    const rows = [row({ date: "2026-09-01" }), row({ date: "2026-09-02" })];
    readFileSyncMock.mockReturnValue(rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

    const { getCaShadowEvents } = await import("@/novacore/events/adapters/ca-shadow-event-adapter");
    const events = getCaShadowEvents();

    expect(events.filter((e) => e.type === "SHADOW_INITIALIZED")).toHaveLength(1);
    expect(events.filter((e) => e.type === "FORWARD_EVIDENCE_RECORDED")).toHaveLength(2);
  });

  it("maps ENTER to SHADOW_POSITION_OPENED and EXIT to SHADOW_POSITION_CLOSED — never ORDER_SUBMITTED/ORDER_FILLED", async () => {
    existsSyncMock.mockReturnValue(true);
    const rows = [row({ date: "2026-09-01", decision: "ENTER", hypotheticalFillPrice: 500 }), row({ date: "2026-09-02", decision: "EXIT", hypotheticalFillPrice: 505 })];
    readFileSyncMock.mockReturnValue(rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

    const { getCaShadowEvents } = await import("@/novacore/events/adapters/ca-shadow-event-adapter");
    const events = getCaShadowEvents();

    expect(events.some((e) => e.type === "SHADOW_POSITION_OPENED")).toBe(true);
    expect(events.some((e) => e.type === "SHADOW_POSITION_CLOSED")).toBe(true);
    expect(events.some((e) => e.type === "ORDER_SUBMITTED" || e.type === "ORDER_FILLED")).toBe(false);
  });

  it("maps BLOCKED to SHADOW_BLOCKED with the violated guard names in the summary", async () => {
    existsSyncMock.mockReturnValue(true);
    const rows = [row({ date: "2026-09-01", decision: "BLOCKED", guardResult: { passed: false, violations: [{ guard: "DATA_STALE", reason: "x" }] } })];
    readFileSyncMock.mockReturnValue(rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

    const { getCaShadowEvents } = await import("@/novacore/events/adapters/ca-shadow-event-adapter");
    const events = getCaShadowEvents();
    const blocked = events.find((e) => e.type === "SHADOW_BLOCKED");
    expect(blocked?.summary).toContain("DATA_STALE");
  });

  it("never includes a credential-shaped field on any event", async () => {
    existsSyncMock.mockReturnValue(true);
    const rows = [row({ date: "2026-09-01", decision: "ENTER" })];
    readFileSyncMock.mockReturnValue(rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

    const { getCaShadowEvents } = await import("@/novacore/events/adapters/ca-shadow-event-adapter");
    const serialized = JSON.stringify(getCaShadowEvents()).toLowerCase();
    expect(serialized).not.toMatch(/secretkey|apca-api-secret/);
  });
});
