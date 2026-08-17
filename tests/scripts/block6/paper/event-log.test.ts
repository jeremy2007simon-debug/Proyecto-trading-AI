import { afterEach, describe, expect, it, vi } from "vitest";

const appendFileSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();

vi.mock("node:fs", () => {
  const mocked = {
    appendFileSync: (...args: unknown[]) => appendFileSyncMock(...args),
    mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
  };
  return { ...mocked, default: mocked };
});

describe("appendEvent", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ensures the output directory exists before writing", async () => {
    const { appendEvent } = await import("../../../../scripts/block6/paper/event-log");
    appendEvent("SIGNAL_COMPUTED", { decisionMonthKey: "2026-08" });

    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining("results/block6/paper"), { recursive: true });
  });

  it("appends one JSON line per event, with the type/timestamp/detail shape", async () => {
    const { appendEvent } = await import("../../../../scripts/block6/paper/event-log");
    appendEvent("NO_OP_NOT_TRADING_DAY", { today: { year: 2026, month: 8, day: 15 } });

    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    const [path, content] = appendFileSyncMock.mock.calls[0] as [string, string];
    expect(path).toContain("events.log");
    expect(content.endsWith("\n")).toBe(true);

    const parsed = JSON.parse(content.trim()) as { type: string; timestamp: string; detail: unknown };
    expect(parsed.type).toBe("NO_OP_NOT_TRADING_DAY");
    expect(parsed.detail).toEqual({ today: { year: 2026, month: 8, day: 15 } });
    expect(() => new Date(parsed.timestamp).toISOString()).not.toThrow();
  });

  it("writes a separate line for each call (never overwrites)", async () => {
    const { appendEvent } = await import("../../../../scripts/block6/paper/event-log");
    appendEvent("ORDERS_SUBMITTED", { decisionMonthKey: "2026-08" });
    appendEvent("ERROR", { message: "x" });

    expect(appendFileSyncMock).toHaveBeenCalledTimes(2);
  });
});
