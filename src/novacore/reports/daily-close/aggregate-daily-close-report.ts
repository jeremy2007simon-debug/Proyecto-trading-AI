import "server-only";

import { buildActivityFeed } from "@/novacore/activity-feed/build-activity-feed";
import { getRs3mExecutionSafety } from "@/novacore/execution-center/adapters/rs3m-guards-adapter";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { getMarketBenchmarkSeries } from "@/novacore/market-context/adapters/market-benchmark-adapter";
import { getNovaCorePortfolioSnapshot } from "@/novacore/portfolio/adapters/rs3m-portfolio-adapter";
import { getRs3mStrategy } from "@/novacore/strategy-hub/adapters/rs3m-adapter";
import { getCaStrategy } from "@/novacore/strategy-hub/adapters/ca-adapter";
import { getCaShadowSnapshot } from "@/novacore/strategy-hub/adapters/ca-shadow-snapshot-adapter";
import type { NovaCoreDailyCloseReport, MarketSession, ReportValue } from "@/novacore/reports/daily-close/types";
import { noData, notConnected, ok } from "@/novacore/reports/daily-close/types";
import { buildDailyCloseReport, type BuildDailyCloseReportParams } from "@/novacore/reports/daily-close/build-daily-close-report";
import { readForwardEvidenceLedger } from "../../../../scripts/block6/paper/forward-evidence-store";
import { readCaForwardLedger } from "../../../../scripts/block10/ca-shadow/evidence-store";
import { readRs3mEquityMarks, appendRs3mEquityMark } from "../../../../scripts/block10/daily-report/rs3m-equity-marks";

/**
 * Block 10.1 §8 — the READ-ONLY aggregation layer for the Daily Close
 * Report. Pulls from every existing NovaCore adapter and evidence store
 * (never a new data source, never strategy logic of its own) and hands
 * a fully-shaped `BuildDailyCloseReportParams` to the pure builder.
 *
 * The ONE piece of state this module writes is a new RS3M equity mark
 * for `date` (via `appendRs3mEquityMark`) — an observational reading of
 * the SAME already-existing, read-only broker snapshot every other
 * NovaCore page already calls, appended to the report engine's OWN
 * ledger (`rs3m-equity-marks.ts`), never to anything under
 * `results/block6/**` or RS3M's own code.
 *
 * CALL THIS ONLY FROM THE DAILY ORCHESTRATOR SCRIPT
 * (`scripts/block10/daily-report/run-daily-close.ts`), never from a
 * NovaCore page/API route. The equity mark it writes is meant to be a
 * genuine END-OF-DAY close mark — calling this mid-session from a page
 * render would permanently record an intraday value as "today's mark"
 * (the write is idempotent per date, so the FIRST call wins and every
 * later one that day is silently skipped) and corrupt every future daily
 * P&L diff computed against that date. A live "right now" glance on
 * Home/Bots must read the existing adapters directly instead.
 */

export interface AggregateDailyCloseReportParams {
  date: string; // YYYY-NM-DD trading date this report covers (determined by the orchestrator's NYSE-calendar check)
  generatedAt: string; // ISO instant
  marketSession: MarketSession;
}

function isoDateOf(timestamp: string | undefined): string | undefined {
  return timestamp?.slice(0, 10);
}

export async function aggregateDailyCloseReport(params: AggregateDailyCloseReportParams): Promise<NovaCoreDailyCloseReport> {
  const { date, generatedAt, marketSession } = params;

  const [rs3mAdapter, caAdapter, execution, safety, health, portfolio, activity] = await Promise.all([
    Promise.resolve(getRs3mStrategy()),
    Promise.resolve(getCaStrategy()),
    getRs3mExecutionSnapshot(),
    getRs3mExecutionSafety(),
    getRs3mHealth(),
    getNovaCorePortfolioSnapshot(),
    Promise.resolve(buildActivityFeed({ limit: 200 })),
  ]);

  const caSnapshot = getCaShadowSnapshot();
  const caDailyEquityRows = readCaForwardLedger("daily-equity");
  const todaysCaRow = caDailyEquityRows.find((r) => r.date === date);
  const todaysCaRowIndex = todaysCaRow ? caDailyEquityRows.indexOf(todaysCaRow) : -1;
  const priorCaRow = todaysCaRowIndex > 0 ? caDailyEquityRows[todaysCaRowIndex - 1] : undefined;

  // --- Portfolio equity / daily P&L (via this report engine's own equity-mark ledger) ---
  let portfolioEquity: ReportValue<number>;
  let portfolioCash: ReportValue<number>;
  let portfolioExposure: ReportValue<number>;
  let dailyPnlUsd: ReportValue<number>;
  let dailyPnlPct: ReportValue<number>;
  let accumulatedPnlUsd: ReportValue<number>;

  if (!portfolio.available) {
    portfolioEquity = notConnected(portfolio.unavailableReason ?? "Cuenta Paper no disponible.");
    portfolioCash = notConnected(portfolio.unavailableReason ?? "Cuenta Paper no disponible.");
    portfolioExposure = notConnected(portfolio.unavailableReason ?? "Cuenta Paper no disponible.");
    dailyPnlUsd = notConnected("Sin lectura de cuenta — no se puede calcular P&L diario.");
    dailyPnlPct = notConnected("Sin lectura de cuenta — no se puede calcular P&L diario.");
    accumulatedPnlUsd = notConnected("Sin lectura de cuenta — no se puede calcular P&L acumulado.");
  } else {
    portfolioEquity = ok(portfolio.totalEquity);
    portfolioCash = ok(portfolio.totalCash);
    portfolioExposure = ok(portfolio.totalEquity - portfolio.totalCash);

    const marks = readRs3mEquityMarks();
    const existingMarkForDate = marks.find((m) => m.date === date);
    if (!existingMarkForDate) {
      appendRs3mEquityMark({ date, equityUsd: portfolio.totalEquity, cashUsd: portfolio.totalCash, recordedAt: generatedAt });
    }
    const allMarks = existingMarkForDate ? marks : [...marks, { date, equityUsd: portfolio.totalEquity, cashUsd: portfolio.totalCash, recordedAt: generatedAt }];
    const sortedMarks = [...allMarks].sort((a, b) => a.date.localeCompare(b.date));
    const todayIndex = sortedMarks.findIndex((m) => m.date === date);
    const priorMark = todayIndex > 0 ? sortedMarks[todayIndex - 1] : undefined;
    const firstMark = sortedMarks[0];

    if (priorMark) {
      const diff = portfolio.totalEquity - priorMark.equityUsd;
      dailyPnlUsd = ok(diff);
      dailyPnlPct = ok(priorMark.equityUsd > 0 ? (diff / priorMark.equityUsd) * 100 : 0);
    } else {
      dailyPnlUsd = noData("No hay una marca de equity del día anterior — este es el primer Daily Close Report registrado.");
      dailyPnlPct = noData("No hay una marca de equity del día anterior — este es el primer Daily Close Report registrado.");
    }
    accumulatedPnlUsd = ok(portfolio.totalEquity - firstMark.equityUsd);
  }

  // --- RS3M signal/position/orders today ---
  const ledger = readForwardEvidenceLedger();
  const todaysRs3mRow = ledger.find((r) => isoDateOf(r.timestamp) === date);
  const signalToday: ReportValue<string> = todaysRs3mRow ? ok(todaysRs3mRow.winner ?? "CASH") : noData("Sin registro de dry-run de RS3M para hoy todavía.");
  const positionAtClose: ReportValue<string> = ok(execution.currentPosition.symbol ?? execution.currentPosition.state);

  const todaysOrders = portfolio.available ? portfolio.recentOrders.filter((o) => isoDateOf(o.submittedAt) === date) : [];
  const ordersToday: ReportValue<number> = portfolio.available ? ok(todaysOrders.length) : notConnected("Sin lectura de cuenta.");
  const fillsToday: ReportValue<number> = portfolio.available ? ok(todaysOrders.filter((o) => o.status === "filled").length) : notConnected("Sin lectura de cuenta.");

  const approvalStatusMap: Record<string, BuildDailyCloseReportParams["rs3m"]["approvalStatus"]> = { REQUIRED: "REQUIRED", APPROVED: "GRANTED", NOT_APPROVED: "NOT_APPLICABLE", "N/A": "NOT_APPLICABLE" };
  const rs3mActivity = activity.filter((e) => e.strategyId === "RS3M_CANDIDATE_V1");
  const lastActivity: ReportValue<{ summary: string; timestamp: string }> = rs3mActivity[0] ? ok({ summary: rs3mActivity[0].summary, timestamp: rs3mActivity[0].timestamp }) : noData("Sin eventos registrados para RS3M todavía.");

  // --- C-A signal/entry-exit today ---
  const caSignalToday: ReportValue<string> = todaysCaRow?.signal?.sufficientHistory ? ok(todaysCaRow.signal.triggered ? "TRIGGERED" : "SIN DISPARO") : noData("Sin evaluación shadow de C-A para hoy todavía.");
  const caEntryExit: ReportValue<"ENTER" | "EXIT"> = todaysCaRow && (todaysCaRow.decision === "ENTER" || todaysCaRow.decision === "EXIT") ? ok(todaysCaRow.decision) : noData("Sin entrada/salida hipotética hoy.");
  const caFillPrice: ReportValue<number> = todaysCaRow?.hypotheticalFillPrice !== undefined ? ok(todaysCaRow.hypotheticalFillPrice) : noData("Sin fill hipotético hoy.");
  const caCostBps: ReportValue<number> = todaysCaRow && (todaysCaRow.decision === "ENTER" || todaysCaRow.decision === "EXIT") ? ok(todaysCaRow.costBps) : noData("Sin costo aplicado hoy.");
  const caDailyPnlPct: ReportValue<number> = todaysCaRow ? ok(todaysCaRow.dailyPnlPct * 100) : noData("Sin evaluación shadow de C-A para hoy todavía.");
  const caGuardsStatus: BuildDailyCloseReportParams["ca"]["guardsStatus"] = todaysCaRow ? (todaysCaRow.guardResult.passed ? "PASS" : "BLOCKED") : "UNAVAILABLE";

  // --- SPY benchmark: prefer C-A's own already-fetched daily closes (exact), fall back to the general market benchmark adapter (approximate) ---
  let spyClose: ReportValue<number>;
  let spyDailyChangeUsd: ReportValue<number>;
  let spyDailyChangePct: ReportValue<number>;
  let benchmarkSource: string;
  let benchmarkAsOf: string | undefined;

  if (todaysCaRow?.spyBenchmarkClose !== undefined && priorCaRow?.spyBenchmarkClose !== undefined) {
    const diff = todaysCaRow.spyBenchmarkClose - priorCaRow.spyBenchmarkClose;
    spyClose = ok(todaysCaRow.spyBenchmarkClose);
    spyDailyChangeUsd = ok(diff);
    spyDailyChangePct = ok(priorCaRow.spyBenchmarkClose > 0 ? (diff / priorCaRow.spyBenchmarkClose) * 100 : 0);
    benchmarkSource = `C-A shadow evidence (${todaysCaRow.dataSource}, ${todaysCaRow.dataAdjustment}) — results/block10/ca-forward/daily-equity/ledger.jsonl`;
    benchmarkAsOf = todaysCaRow.dataCutoff;
  } else {
    const series = await getMarketBenchmarkSeries("SP500", "1D");
    if (series.available) {
      spyClose = ok(series.lastValue ?? 0);
      spyDailyChangeUsd = series.absoluteChange !== undefined ? ok(series.absoluteChange) : noData("Sin cambio absoluto disponible.");
      spyDailyChangePct = series.percentChange !== undefined ? ok(series.percentChange) : noData("Sin cambio porcentual disponible.");
      benchmarkSource = series.source;
      benchmarkAsOf = series.lastTimestamp;
    } else {
      spyClose = notConnected(series.unavailableReason ?? "SPY no disponible.");
      spyDailyChangeUsd = notConnected(series.unavailableReason ?? "SPY no disponible.");
      spyDailyChangePct = notConnected(series.unavailableReason ?? "SPY no disponible.");
      benchmarkSource = series.source;
      benchmarkAsOf = undefined;
    }
  }

  const dataFreshnessNote = `RS3M: ${portfolio.lastSyncedAt ? `cuenta sincronizada ${portfolio.lastSyncedAt}` : "sin sincronizar"}. C-A: ${todaysCaRow ? `datos al ${todaysCaRow.dataCutoff}` : "sin evaluación hoy"}.`;

  return buildDailyCloseReport({
    date,
    generatedAt,
    marketSession,
    systemHealth: health.status,
    dataFreshnessNote,
    portfolio: { equity: portfolioEquity, cash: portfolioCash, exposure: portfolioExposure, dailyPnlUsd, dailyPnlPct, accumulatedPnlUsd },
    rs3m: {
      status: rs3mAdapter.strategy.status,
      signalToday,
      positionAtClose,
      ordersToday,
      fillsToday,
      approvalStatus: approvalStatusMap[safety.approvalStatus] ?? "UNAVAILABLE",
      guardsStatus: safety.overallStatus,
      lastActivity,
      health: health.status,
      hashVerified: rs3mAdapter.candidateHashVerified,
    },
    ca: {
      status: caAdapter.strategy.status,
      signalToday: caSignalToday,
      hypotheticalPosition: caSnapshot.shadow.currentPosition,
      dailyPnlPct: caDailyPnlPct,
      accumulatedPnlPct: caSnapshot.hasForwardEvidence ? ok(caSnapshot.shadow.realizedShadowPnlPct) : noData("Sin evidencia forward de C-A todavía."),
      entryExit: caEntryExit,
      hypotheticalFillPrice: caFillPrice,
      costBps: caCostBps,
      guardsStatus: caGuardsStatus,
      forwardDays: caSnapshot.shadow.daysProcessed,
      shadowTrades: caSnapshot.shadow.trades,
      hashVerified: caAdapter.candidateHashVerified,
    },
    benchmark: { spyClose, spyDailyChangeUsd, spyDailyChangePct, source: benchmarkSource, asOf: benchmarkAsOf },
  });
}
