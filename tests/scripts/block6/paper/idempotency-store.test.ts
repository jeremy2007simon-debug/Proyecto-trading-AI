import { afterEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => {
  const mocked = {
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
    writeFileSync: (...args: unknown[]) => writeFileSyncMock(...args),
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
  };
  return { ...mocked, default: mocked };
});

describe("hasExecutedThisMonth", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns false when no marker file exists for the month (never executed)", async () => {
    existsSyncMock.mockReturnValue(false);
    const { hasExecutedThisMonth } = await import("../../../../scripts/block6/paper/idempotency-store");

    expect(await hasExecutedThisMonth("2026-08")).toBe(false);
    const [path] = existsSyncMock.mock.calls[0] as [string];
    expect(path).toContain("results/block6/forward");
    expect(path).toContain("2026-08");
    expect(path).toContain("executed.json");
  });

  it("returns true when a marker file exists for the month — this is what makes a duplicate-month rebalance blocked", async () => {
    existsSyncMock.mockReturnValue(true);
    const { hasExecutedThisMonth } = await import("../../../../scripts/block6/paper/idempotency-store");

    expect(await hasExecutedThisMonth("2026-08")).toBe(true);
  });

  it("checks a DIFFERENT path per decision month — August's marker is not September's", async () => {
    existsSyncMock.mockReturnValue(false);
    const { hasExecutedThisMonth } = await import("../../../../scripts/block6/paper/idempotency-store");

    await hasExecutedThisMonth("2026-08");
    await hasExecutedThisMonth("2026-09");

    const [augPath] = existsSyncMock.mock.calls[0] as [string];
    const [sepPath] = existsSyncMock.mock.calls[1] as [string];
    expect(augPath).not.toBe(sepPath);
  });
});

describe("markExecuted", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates the month's directory and writes a marker with the decision month, timestamp, and orders", async () => {
    const { markExecuted } = await import("../../../../scripts/block6/paper/idempotency-store");
    const orders = [{ orderId: "o1", clientOrderId: "rs3m-2026-08-dia-buy", symbol: "DIA", side: "buy" as const, notional: 100000, qty: undefined, status: "filled", submittedAt: "t", filledAt: "t2", filledAvgPrice: 500, filledQty: 200 }];

    await markExecuted("2026-08", orders);

    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining("2026-08"), { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [path, content] = writeFileSyncMock.mock.calls[0] as [string, string];
    expect(path).toContain("executed.json");
    const parsed = JSON.parse(content) as { decisionMonth: string; orders: unknown[] };
    expect(parsed.decisionMonth).toBe("2026-08");
    expect(parsed.orders).toEqual(orders);
  });
});

describe("readExecutedMarker", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns undefined when no marker exists", async () => {
    existsSyncMock.mockReturnValue(false);
    const { readExecutedMarker } = await import("../../../../scripts/block6/paper/idempotency-store");

    expect(readExecutedMarker("2026-08")).toBeUndefined();
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it("parses and returns the marker when it exists", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({ decisionMonth: "2026-08", executedAt: "t", orders: [] }));
    const { readExecutedMarker } = await import("../../../../scripts/block6/paper/idempotency-store");

    expect(readExecutedMarker("2026-08")).toEqual({ decisionMonth: "2026-08", executedAt: "t", orders: [] });
  });
});
