import { describe, expect, it } from "vitest";
import { buildDailyCloseReport, type BuildDailyCloseReportParams } from "@/novacore/reports/daily-close/build-daily-close-report";
import { noData, notConnected, ok } from "@/novacore/reports/daily-close/types";

function baseParams(overrides: Partial<BuildDailyCloseReportParams> = {}): BuildDailyCloseReportParams {
  return {
    date: "2026-09-01",
    generatedAt: "2026-09-01T21:30:00.000Z",
    marketSession: "OPEN_SESSION_CLOSED",
    systemHealth: "HEALTHY",
    dataFreshnessNote: "test",
    portfolio: { equity: ok(100000), cash: ok(50000), exposure: ok(50000), dailyPnlUsd: ok(120), dailyPnlPct: ok(0.12), accumulatedPnlUsd: ok(5000) },
    rs3m: {
      status: "PAPER_READY",
      signalToday: ok("DIA"),
      positionAtClose: ok("DIA"),
      ordersToday: ok(0),
      fillsToday: ok(0),
      approvalStatus: "NOT_APPLICABLE",
      guardsStatus: "PASS",
      lastActivity: noData("none"),
      health: "HEALTHY",
      hashVerified: true,
    },
    ca: {
      status: "SHADOW_READY",
      signalToday: noData("no eval today"),
      hypotheticalPosition: "FLAT",
      dailyPnlPct: noData("no eval today"),
      accumulatedPnlPct: noData("no evidence"),
      entryExit: noData("none"),
      hypotheticalFillPrice: noData("none"),
      costBps: noData("none"),
      guardsStatus: "UNAVAILABLE",
      forwardDays: 0,
      shadowTrades: 0,
      hashVerified: true,
    },
    benchmark: { spyClose: ok(500), spyDailyChangeUsd: ok(2), spyDailyChangePct: ok(0.4), source: "test", asOf: "2026-09-01T21:00:00.000Z" },
    ...overrides,
  };
}

describe("Block 10.1 §9/§13 — buildDailyCloseReport: Paper vs Shadow separation", () => {
  it("C-A's dailyShadowPnlUsd is ALWAYS NO_DATA — never a fabricated dollar figure for a strategy with no assigned capital", () => {
    const report = buildDailyCloseReport(baseParams());
    expect(report.ca.dailyShadowPnlUsd.status).not.toBe("OK");
  });

  it("RS3M's and portfolio's daily/accumulated P&L are the SAME figures (RS3M is the only strategy holding real capital)", () => {
    const report = buildDailyCloseReport(baseParams());
    expect(report.rs3m.dailyPnlUsd).toEqual(report.portfolio.dailyPnlUsd);
    expect(report.rs3m.accumulatedPnlUsd).toEqual(report.portfolio.accumulatedPnlUsd);
  });

  it("never mixes RS3M PAPER and C-A SHADOW into one blended figure — each section keeps its own numbers", () => {
    const report = buildDailyCloseReport(baseParams());
    expect(report.rs3m.environment).toBe("PAPER");
    expect(report.ca.environment).toBe("SHADOW");
  });
});

describe("Block 10.1 §1/§11 — zero vs NO DATA vs NOT CONNECTED", () => {
  it("a confirmed zero orders today renders as OK(0), not NO_DATA", () => {
    const report = buildDailyCloseReport(baseParams({ rs3m: { ...baseParams().rs3m, ordersToday: ok(0) } }));
    expect(report.rs3m.ordersToday).toEqual(ok(0));
  });

  it("an unreachable broker renders portfolio equity as NOT_CONNECTED, never a silent zero", () => {
    const report = buildDailyCloseReport(baseParams({ portfolio: { equity: notConnected("no creds"), cash: notConnected("no creds"), exposure: notConnected("no creds"), dailyPnlUsd: notConnected("no creds"), dailyPnlPct: notConnected("no creds"), accumulatedPnlUsd: notConnected("no creds") } }));
    expect(report.portfolio.paperEquityUsd.status).toBe("NOT_CONNECTED");
    expect(report.portfolio.paperEquityUsd.status).not.toBe("OK");
  });

  it("a genuinely missing daily eval renders NO_DATA, distinct from NOT_CONNECTED", () => {
    const report = buildDailyCloseReport(baseParams());
    expect(report.ca.signalToday.status).toBe("NO_DATA");
  });
});

describe("Block 10.1 §9/§15/§36 — attention list derivation", () => {
  it("no attention items on a fully healthy, all-verified day", () => {
    const report = buildDailyCloseReport(baseParams());
    expect(report.attention).toEqual([]);
  });

  it("flags APPROVAL_REQUIRED when RS3M's approval status is REQUIRED", () => {
    const report = buildDailyCloseReport(baseParams({ rs3m: { ...baseParams().rs3m, approvalStatus: "REQUIRED" } }));
    expect(report.attention.some((a) => a.type === "APPROVAL_REQUIRED")).toBe(true);
  });

  it("flags BROKER_UNAVAILABLE when portfolio equity is NOT_CONNECTED", () => {
    const report = buildDailyCloseReport(baseParams({ portfolio: { ...baseParams().portfolio, equity: notConnected("down") } }));
    expect(report.attention.some((a) => a.type === "BROKER_UNAVAILABLE")).toBe(true);
  });

  it("flags SHADOW_BLOCKED when C-A's guards are BLOCKED", () => {
    const report = buildDailyCloseReport(baseParams({ ca: { ...baseParams().ca, guardsStatus: "BLOCKED" } }));
    expect(report.attention.some((a) => a.type === "SHADOW_BLOCKED")).toBe(true);
  });

  it("flags HASH_MISMATCH for either strategy independently", () => {
    const rs3mBad = buildDailyCloseReport(baseParams({ rs3m: { ...baseParams().rs3m, hashVerified: false } }));
    expect(rs3mBad.attention.filter((a) => a.type === "HASH_MISMATCH")).toHaveLength(1);

    const caBad = buildDailyCloseReport(baseParams({ ca: { ...baseParams().ca, hashVerified: false } }));
    expect(caBad.attention.filter((a) => a.type === "HASH_MISMATCH")).toHaveLength(1);

    const bothBad = buildDailyCloseReport(baseParams({ rs3m: { ...baseParams().rs3m, hashVerified: false }, ca: { ...baseParams().ca, hashVerified: false } }));
    expect(bothBad.attention.filter((a) => a.type === "HASH_MISMATCH")).toHaveLength(2);
  });

  it("a partial strategy failure (C-A down) still generates a report with RS3M's data intact — never suppresses the whole report", () => {
    const report = buildDailyCloseReport(baseParams({ ca: { ...baseParams().ca, guardsStatus: "BLOCKED", signalToday: noData("DATA_STALE") } }));
    expect(report.rs3m.status).toBe("PAPER_READY");
    expect(report.rs3m.positionAtClose.status).toBe("OK");
    expect(report.attention.some((a) => a.type === "SHADOW_BLOCKED")).toBe(true);
  });
});

describe("Block 10.1 §10 — human-readable Spanish summary", () => {
  it("always produces a non-empty string, and never claims causality between strategies and the benchmark", () => {
    const report = buildDailyCloseReport(baseParams());
    expect(report.humanSummaryEs.length).toBeGreaterThan(0);
    expect(report.humanSummaryEs.toLowerCase()).not.toMatch(/porque|debido a|causado por/);
  });

  it("mentions 'Sin órdenes reales' or similar for the C-A shadow line — never implies a real trade happened", () => {
    const report = buildDailyCloseReport(baseParams());
    expect(report.humanSummaryEs).toContain("Sin órdenes reales");
  });
});
