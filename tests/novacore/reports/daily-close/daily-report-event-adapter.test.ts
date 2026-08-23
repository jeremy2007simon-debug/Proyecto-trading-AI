import { afterEach, describe, expect, it, vi } from "vitest";
import type { NovaCoreDailyCloseReport } from "@/novacore/reports/daily-close/types";
import { ok } from "@/novacore/reports/daily-close/types";

const existsSyncMock = vi.fn();
const readdirSyncMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => {
  const mocked = {
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    readdirSync: (...args: unknown[]) => readdirSyncMock(...args),
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
  };
  return { ...mocked, default: mocked };
});

function report(date: string, attention: NovaCoreDailyCloseReport["attention"] = []): NovaCoreDailyCloseReport {
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
    humanSummaryEs: "test",
    sourceMetadata: {},
  };
}

describe("Block 10.1 §15/§17 — getDailyReportEvents", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns [] when no reports exist yet", async () => {
    existsSyncMock.mockReturnValue(false);
    const { getDailyReportEvents } = await import("@/novacore/reports/daily-close/daily-report-event-adapter");
    expect(getDailyReportEvents()).toEqual([]);
  });

  it("derives INFO priority for a clean report, IMPORTANT for one with attention items, CRITICAL for a broker/hash issue", async () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(["2026-09-01.json", "2026-09-02.json", "2026-09-03.json"]);
    const clean = report("2026-09-01", []);
    const withAttention = report("2026-09-02", [{ type: "APPROVAL_REQUIRED", message: "x" }]);
    const critical = report("2026-09-03", [{ type: "BROKER_UNAVAILABLE", message: "x" }]);
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.includes("2026-09-01")) return JSON.stringify(clean);
      if (path.includes("2026-09-02")) return JSON.stringify(withAttention);
      return JSON.stringify(critical);
    });

    const { getDailyReportEvents } = await import("@/novacore/reports/daily-close/daily-report-event-adapter");
    const events = getDailyReportEvents();
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.type === "DAILY_CLOSE_REPORT_READY")).toBe(true);
    const byDate = Object.fromEntries(events.map((e) => [e.detail?.date, e.detail?.priority]));
    expect(byDate["2026-09-01"]).toBe("INFO");
    expect(byDate["2026-09-02"]).toBe("IMPORTANT");
    expect(byDate["2026-09-03"]).toBe("CRITICAL");
  });

  it("never includes a credential-shaped field", async () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(["2026-09-01.json"]);
    readFileSyncMock.mockReturnValue(JSON.stringify(report("2026-09-01")));
    const { getDailyReportEvents } = await import("@/novacore/reports/daily-close/daily-report-event-adapter");
    const serialized = JSON.stringify(getDailyReportEvents()).toLowerCase();
    expect(serialized).not.toMatch(/secretkey|apca-api-secret/);
  });
});
