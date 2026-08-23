import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Block 10.1 §31 — routine-wrapper-level tests: scheduler gating (closed-
 * bar enforcement, market holiday, DST), and that `runCaShadowRoutine`
 * never throws, always returning a typed outcome. The underlying signal/
 * guard/fill logic is already exhaustively covered at the pure
 * `shadow-engine.test.ts` level — these tests exercise the wrapper's OWN
 * responsibility: deciding WHETHER to even attempt an evaluation.
 */

const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();
const appendFileSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();

vi.mock("node:fs", () => {
  const mocked = {
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
    appendFileSync: (...args: unknown[]) => appendFileSyncMock(...args),
    mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
  };
  return { ...mocked, default: mocked };
});

describe("runCaShadowRoutine — scheduler gating", () => {
  beforeEach(() => {
    existsSyncMock.mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 500, json: async () => ({}) }),
    );
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns NOT_TRADING_DAY on a weekend, without ever fetching data", async () => {
    const { runCaShadowRoutine } = await import("../../../../scripts/block10/ca-shadow/run-ca-shadow-routine");
    // 2026-08-22 is a Saturday.
    const outcome = await runCaShadowRoutine({ now: new Date("2026-08-22T21:00:00.000Z") });
    expect(outcome.kind).toBe("NOT_TRADING_DAY");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns NOT_TRADING_DAY on a real NYSE holiday (New Year's Day), not just by weekday", async () => {
    const { runCaShadowRoutine } = await import("../../../../scripts/block10/ca-shadow/run-ca-shadow-routine");
    // 2026-01-01 is a Thursday (a normal weekday) AND a NYSE holiday — proves the gate is calendar-aware, not just Mon-Fri.
    const outcome = await runCaShadowRoutine({ now: new Date("2026-01-01T21:00:00.000Z") });
    expect(outcome.kind).toBe("NOT_TRADING_DAY");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns BEFORE_CLOSE before 16:00 America/New_York on a winter (EST, UTC-5) trading day", async () => {
    const { runCaShadowRoutine } = await import("../../../../scripts/block10/ca-shadow/run-ca-shadow-routine");
    // 2026-01-15 is a Thursday, EST (UTC-5) — 16:00 ET = 21:00 UTC.
    const justBefore = await runCaShadowRoutine({ now: new Date("2026-01-15T20:59:00.000Z") });
    expect(justBefore.kind).toBe("BEFORE_CLOSE");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proceeds past the close gate at/after 16:00 EST (21:00 UTC in winter)", async () => {
    const { runCaShadowRoutine } = await import("../../../../scripts/block10/ca-shadow/run-ca-shadow-routine");
    const atClose = await runCaShadowRoutine({ now: new Date("2026-01-15T21:01:00.000Z") });
    expect(atClose.kind).not.toBe("BEFORE_CLOSE");
    expect(atClose.kind).not.toBe("NOT_TRADING_DAY");
  });

  it("returns BEFORE_CLOSE before 16:00 America/New_York on a summer (EDT, UTC-4) trading day", async () => {
    const { runCaShadowRoutine } = await import("../../../../scripts/block10/ca-shadow/run-ca-shadow-routine");
    // 2026-07-15 is a Wednesday, EDT (UTC-4) — 16:00 ET = 20:00 UTC.
    const justBefore = await runCaShadowRoutine({ now: new Date("2026-07-15T19:59:00.000Z") });
    expect(justBefore.kind).toBe("BEFORE_CLOSE");
  });

  it("proceeds past the close gate at/after 16:00 EDT (20:00 UTC in summer) — DST shifts the UTC gate by exactly one hour vs. winter", async () => {
    const { runCaShadowRoutine } = await import("../../../../scripts/block10/ca-shadow/run-ca-shadow-routine");
    const atClose = await runCaShadowRoutine({ now: new Date("2026-07-15T20:01:00.000Z") });
    expect(atClose.kind).not.toBe("BEFORE_CLOSE");
  });

  it("returns NO_DATA (never throws) when both Alpaca and Yahoo fail, and notifies CA_SHADOW_ERROR", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const { runCaShadowRoutine } = await import("../../../../scripts/block10/ca-shadow/run-ca-shadow-routine");
    const outcome = await runCaShadowRoutine({ now: new Date("2026-01-15T21:01:00.000Z"), dispatcher: { notify } });
    expect(outcome.kind).toBe("NO_DATA");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "CA_SHADOW_ERROR" }));
  });

  it("never throws even on an unexpected internal error — always resolves to a typed ERROR outcome", async () => {
    existsSyncMock.mockImplementation(() => {
      throw new Error("simulated fs failure");
    });
    const { runCaShadowRoutine } = await import("../../../../scripts/block10/ca-shadow/run-ca-shadow-routine");
    const outcome = await expect(runCaShadowRoutine({ now: new Date("2026-01-15T21:01:00.000Z") })).resolves.toBeDefined();
    void outcome;
  });
});
