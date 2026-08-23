import { afterEach, describe, expect, it, vi } from "vitest";
import type { NovaCoreDailyCloseReport } from "@/novacore/reports/daily-close/types";
import { ok } from "@/novacore/reports/daily-close/types";

const existsSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const readFileSyncMock = vi.fn();
const readdirSyncMock = vi.fn();

vi.mock("node:fs", () => {
  const mocked = {
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
    writeFileSync: (...args: unknown[]) => writeFileSyncMock(...args),
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
    readdirSync: (...args: unknown[]) => readdirSyncMock(...args),
  };
  return { ...mocked, default: mocked };
});

function report(date: string): NovaCoreDailyCloseReport {
  return {
    date,
    generatedAt: `${date}T21:30:00.000Z`,
    marketSession: "OPEN_SESSION_CLOSED",
    dataFreshness: "test",
    systemHealth: "HEALTHY",
    portfolio: { paperEquityUsd: ok(100000), dailyPnlUsd: ok(0), dailyPnlPct: ok(0), accumulatedPnlUsd: ok(0), cashUsd: ok(50000), exposureUsd: ok(50000) },
    rs3m: { environment: "PAPER", status: "PAPER_READY", signalToday: ok("DIA"), positionAtClose: ok("DIA"), dailyPnlUsd: ok(0), dailyPnlPct: ok(0), accumulatedPnlUsd: ok(0), ordersToday: ok(0), fillsToday: ok(0), approvalStatus: "NOT_APPLICABLE", guardsStatus: "PASS", lastActivity: ok({ summary: "x", timestamp: date }), health: "HEALTHY" },
    ca: { environment: "SHADOW", status: "SHADOW_READY", signalToday: ok("x"), hypotheticalPositionAtClose: "FLAT", dailyShadowPnlUsd: ok(0), dailyShadowPnlPct: ok(0), accumulatedShadowPnlPct: ok(0), shadowEntryExit: ok("ENTER"), hypotheticalFillPrice: ok(500), costBps: ok(3), guardsStatus: "PASS", forwardDays: 1, shadowTrades: 0 },
    benchmark: { spyClose: ok(500), spyDailyChangeUsd: ok(0), spyDailyChangePct: ok(0), rs3mDailyReturnPct: ok(0), caShadowDailyReturnPct: ok(0), source: "test", asOf: date },
    attention: [],
    humanSummaryEs: "test",
    sourceMetadata: {},
  };
}

describe("Block 10.1 §18/§31 — report-store: idempotency and immutability", () => {
  afterEach(() => vi.clearAllMocks());

  it("writes a report when none exists for that date", async () => {
    existsSyncMock.mockReturnValue(false);
    const { writeReportIfAbsent } = await import("../../../../scripts/block10/daily-report/report-store");
    const result = writeReportIfAbsent(report("2026-09-01"));
    expect(result.written).toBe(true);
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("NEVER overwrites an existing report for the same date — the second write is a silent no-op, not an error", async () => {
    existsSyncMock.mockReturnValue(true);
    const { writeReportIfAbsent } = await import("../../../../scripts/block10/daily-report/report-store");
    const result = writeReportIfAbsent(report("2026-09-01"));
    expect(result.written).toBe(false);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("hasReportForDate reflects existsSync for that exact date's path", async () => {
    existsSyncMock.mockReturnValue(true);
    const { hasReportForDate } = await import("../../../../scripts/block10/daily-report/report-store");
    expect(hasReportForDate("2026-09-01")).toBe(true);
    const [path] = existsSyncMock.mock.calls[0] as [string];
    expect(path).toContain("2026-09-01.json");
  });

  it("readReport returns undefined for a nonexistent date, never throws", async () => {
    existsSyncMock.mockReturnValue(false);
    const { readReport } = await import("../../../../scripts/block10/daily-report/report-store");
    expect(readReport("2026-09-01")).toBeUndefined();
  });

  it("readReport parses the stored JSON back exactly", async () => {
    existsSyncMock.mockReturnValue(true);
    const r = report("2026-09-01");
    readFileSyncMock.mockReturnValue(JSON.stringify(r));
    const { readReport } = await import("../../../../scripts/block10/daily-report/report-store");
    expect(readReport("2026-09-01")).toEqual(r);
  });

  it("listReportDates returns [] when the directory doesn't exist yet", async () => {
    existsSyncMock.mockReturnValue(false);
    const { listReportDates } = await import("../../../../scripts/block10/daily-report/report-store");
    expect(listReportDates()).toEqual([]);
  });

  it("listReportDates strips .json and sorts newest-first", async () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(["2026-09-01.json", "2026-09-03.json", "2026-09-02.json"]);
    const { listReportDates } = await import("../../../../scripts/block10/daily-report/report-store");
    expect(listReportDates()).toEqual(["2026-09-03", "2026-09-02", "2026-09-01"]);
  });
});
