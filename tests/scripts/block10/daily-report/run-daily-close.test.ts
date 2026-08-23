import { afterEach, describe, expect, it, vi } from "vitest";
import type { NovaCoreDailyCloseReport } from "@/novacore/reports/daily-close/types";
import { ok } from "@/novacore/reports/daily-close/types";

const runCaShadowRoutineMock = vi.fn();
const aggregateDailyCloseReportMock = vi.fn();
const hasReportForDateMock = vi.fn();
const writeReportIfAbsentMock = vi.fn();
const deliverDailyReportMock = vi.fn();

vi.mock("../../../../scripts/block10/ca-shadow/run-ca-shadow-routine", () => ({
  runCaShadowRoutine: (...args: unknown[]) => runCaShadowRoutineMock(...args),
}));
vi.mock("@/novacore/reports/daily-close/aggregate-daily-close-report", () => ({
  aggregateDailyCloseReport: (...args: unknown[]) => aggregateDailyCloseReportMock(...args),
}));
vi.mock("../../../../scripts/block10/daily-report/report-store", () => ({
  hasReportForDate: (...args: unknown[]) => hasReportForDateMock(...args),
  writeReportIfAbsent: (...args: unknown[]) => writeReportIfAbsentMock(...args),
}));
vi.mock("../../../../scripts/block10/daily-report/delivery/novacore-in-app-provider", () => ({
  deliverDailyReport: (...args: unknown[]) => deliverDailyReportMock(...args),
}));

function stubReport(date: string, attention: NovaCoreDailyCloseReport["attention"] = []): NovaCoreDailyCloseReport {
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
    attention,
    humanSummaryEs: "resumen de prueba",
    sourceMetadata: {},
  };
}

describe("Block 10.1 §21/§22/§23/§31 — runDailyCloseReport orchestration", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns NOT_TRADING_DAY on a market holiday, without ever running C-A or building a report (§22: no fake trading-day report)", async () => {
    const { runDailyCloseReport } = await import("../../../../scripts/block10/daily-report/run-daily-close");
    // 2026-01-01 New Year's Day.
    const outcome = await runDailyCloseReport({ now: new Date("2026-01-01T21:00:00.000Z") });
    expect(outcome.kind).toBe("NOT_TRADING_DAY");
    expect(runCaShadowRoutineMock).not.toHaveBeenCalled();
    expect(aggregateDailyCloseReportMock).not.toHaveBeenCalled();
  });

  it("returns BEFORE_CLOSE before 16:00 ET, without running C-A", async () => {
    const { runDailyCloseReport } = await import("../../../../scripts/block10/daily-report/run-daily-close");
    const outcome = await runDailyCloseReport({ now: new Date("2026-01-15T20:00:00.000Z") });
    expect(outcome.kind).toBe("BEFORE_CLOSE");
    expect(runCaShadowRoutineMock).not.toHaveBeenCalled();
  });

  it("returns ALREADY_REPORTED (idempotent) when a report already exists for the date, without running C-A a second time", async () => {
    hasReportForDateMock.mockReturnValue(true);
    const { runDailyCloseReport } = await import("../../../../scripts/block10/daily-report/run-daily-close");
    const outcome = await runDailyCloseReport({ now: new Date("2026-01-15T21:01:00.000Z") });
    expect(outcome.kind).toBe("ALREADY_REPORTED");
    expect(runCaShadowRoutineMock).not.toHaveBeenCalled();
  });

  it("§21 ordering: runs C-A's shadow evaluation BEFORE aggregating the report", async () => {
    hasReportForDateMock.mockReturnValue(false);
    const callOrder: string[] = [];
    runCaShadowRoutineMock.mockImplementation(async () => {
      callOrder.push("ca");
      return { kind: "PROCESSED" };
    });
    aggregateDailyCloseReportMock.mockImplementation(async () => {
      callOrder.push("report");
      return stubReport("2026-01-15");
    });
    writeReportIfAbsentMock.mockReturnValue({ written: true });
    deliverDailyReportMock.mockResolvedValue(undefined);

    const { runDailyCloseReport } = await import("../../../../scripts/block10/daily-report/run-daily-close");
    const outcome = await runDailyCloseReport({ now: new Date("2026-01-15T21:01:00.000Z") });

    expect(outcome.kind).toBe("GENERATED");
    expect(callOrder).toEqual(["ca", "report"]);
  });

  it("§23 partial failure: still generates a report even when C-A's own evaluation errors out", async () => {
    hasReportForDateMock.mockReturnValue(false);
    runCaShadowRoutineMock.mockResolvedValue({ kind: "ERROR", message: "boom" });
    aggregateDailyCloseReportMock.mockResolvedValue(stubReport("2026-01-15", [{ type: "SHADOW_BLOCKED", message: "x" }]));
    writeReportIfAbsentMock.mockReturnValue({ written: true });
    deliverDailyReportMock.mockResolvedValue(undefined);

    const { runDailyCloseReport } = await import("../../../../scripts/block10/daily-report/run-daily-close");
    const outcome = await runDailyCloseReport({ now: new Date("2026-01-15T21:01:00.000Z") });
    expect(outcome.kind).toBe("GENERATED");
  });

  it("delivers with CRITICAL priority when the report has a hash/broker attention item", async () => {
    hasReportForDateMock.mockReturnValue(false);
    runCaShadowRoutineMock.mockResolvedValue({ kind: "PROCESSED" });
    aggregateDailyCloseReportMock.mockResolvedValue(stubReport("2026-01-15", [{ type: "BROKER_UNAVAILABLE", message: "x" }]));
    writeReportIfAbsentMock.mockReturnValue({ written: true });
    deliverDailyReportMock.mockResolvedValue(undefined);

    const { runDailyCloseReport } = await import("../../../../scripts/block10/daily-report/run-daily-close");
    await runDailyCloseReport({ now: new Date("2026-01-15T21:01:00.000Z") });
    expect(deliverDailyReportMock).toHaveBeenCalledWith(expect.objectContaining({ priority: "CRITICAL" }));
  });

  it("a race where writeReportIfAbsent reports written:false is treated as ALREADY_REPORTED, not an error", async () => {
    hasReportForDateMock.mockReturnValue(false);
    runCaShadowRoutineMock.mockResolvedValue({ kind: "PROCESSED" });
    aggregateDailyCloseReportMock.mockResolvedValue(stubReport("2026-01-15"));
    writeReportIfAbsentMock.mockReturnValue({ written: false, reason: "already exists" });

    const { runDailyCloseReport } = await import("../../../../scripts/block10/daily-report/run-daily-close");
    const outcome = await runDailyCloseReport({ now: new Date("2026-01-15T21:01:00.000Z") });
    expect(outcome.kind).toBe("ALREADY_REPORTED");
    expect(deliverDailyReportMock).not.toHaveBeenCalled();
  });

  it("never throws — an unexpected error resolves to a typed ERROR outcome", async () => {
    hasReportForDateMock.mockReturnValue(false);
    runCaShadowRoutineMock.mockRejectedValue(new Error("simulated failure"));

    const { runDailyCloseReport } = await import("../../../../scripts/block10/daily-report/run-daily-close");
    const outcome = await runDailyCloseReport({ now: new Date("2026-01-15T21:01:00.000Z") });
    expect(outcome.kind).toBe("ERROR");
  });
});
