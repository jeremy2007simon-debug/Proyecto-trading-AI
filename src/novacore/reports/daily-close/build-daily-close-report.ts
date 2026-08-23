import type { AttentionItem, DailyReportBenchmarkSection, DailyReportCaSection, DailyReportRs3mSection, MarketSession, NovaCoreDailyCloseReport, ReportValue } from "@/novacore/reports/daily-close/types";
import { noData } from "@/novacore/reports/daily-close/types";

/**
 * Block 10.1 §8/§9/§29 — pure builder for `NovaCoreDailyCloseReport`.
 * Takes ALREADY-FETCHED, already-shaped inputs (the aggregator,
 * `aggregate-daily-close-report.ts`, does every read) and assembles the
 * final report object plus its derived `attention` list and Spanish
 * human summary. No I/O, no strategy logic — pure mapping and a few
 * small derived comparisons.
 *
 * The single Paper broker account backs BOTH `portfolio` (the account
 * totals) and `rs3m` (RS3M is the only strategy holding real capital —
 * C-A is SHADOW, never a broker position) — RS3M's daily/accumulated
 * P&L numbers are therefore the SAME figures as the portfolio's, just
 * re-surfaced under RS3M's own section for at-a-glance reading. C-A's
 * shadow P&L is reported ONLY as a percentage — it has no assigned
 * notional capital, so a dollar figure would be an invented number, not
 * a real one (§1/§11: never fabricate).
 */

export interface BuildDailyCloseReportParams {
  date: string;
  generatedAt: string;
  marketSession: MarketSession;
  systemHealth: NovaCoreDailyCloseReport["systemHealth"];
  dataFreshnessNote: string;

  portfolio: {
    equity: ReportValue<number>;
    cash: ReportValue<number>;
    exposure: ReportValue<number>;
    dailyPnlUsd: ReportValue<number>;
    dailyPnlPct: ReportValue<number>;
    accumulatedPnlUsd: ReportValue<number>;
  };

  rs3m: {
    status: string;
    signalToday: ReportValue<string>;
    positionAtClose: ReportValue<string>;
    ordersToday: ReportValue<number>;
    fillsToday: ReportValue<number>;
    approvalStatus: DailyReportRs3mSection["approvalStatus"];
    guardsStatus: DailyReportRs3mSection["guardsStatus"];
    lastActivity: ReportValue<{ summary: string; timestamp: string }>;
    health: DailyReportRs3mSection["health"];
    hashVerified: boolean;
  };

  ca: {
    status: string;
    signalToday: ReportValue<string>;
    hypotheticalPosition: "FLAT" | "LONG";
    dailyPnlPct: ReportValue<number>;
    accumulatedPnlPct: ReportValue<number>;
    entryExit: ReportValue<"ENTER" | "EXIT">;
    hypotheticalFillPrice: ReportValue<number>;
    costBps: ReportValue<number>;
    guardsStatus: DailyReportCaSection["guardsStatus"];
    forwardDays: number;
    shadowTrades: number;
    hashVerified: boolean;
  };

  benchmark: {
    spyClose: ReportValue<number>;
    spyDailyChangeUsd: ReportValue<number>;
    spyDailyChangePct: ReportValue<number>;
    source: string;
    asOf: string | undefined;
  };
}

function fmtPct(v: ReportValue<number>): string {
  return v.status === "OK" ? `${v.value >= 0 ? "+" : ""}${v.value.toFixed(2)}%` : "sin datos";
}
function fmtUsd(v: ReportValue<number>): string {
  return v.status === "OK" ? `${v.value >= 0 ? "+" : ""}$${Math.abs(v.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "sin datos";
}

function buildAttention(params: BuildDailyCloseReportParams): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (params.rs3m.approvalStatus === "REQUIRED") {
    items.push({ type: "APPROVAL_REQUIRED", message: "RS3M tiene una señal pendiente de aprobación manual. No se ha enviado ninguna orden.", strategyId: "RS3M_CANDIDATE_V1" });
  }
  if (params.portfolio.equity.status === "NOT_CONNECTED") {
    items.push({ type: "BROKER_UNAVAILABLE", message: `Cuenta Paper no disponible: ${params.portfolio.equity.reason}`, strategyId: "RS3M_CANDIDATE_V1" });
  }
  if (params.rs3m.guardsStatus === "BLOCKED") {
    items.push({ type: "STALE_DATA", message: "Al menos un guard de RS3M está en estado BLOCKED.", strategyId: "RS3M_CANDIDATE_V1" });
  }
  if (params.ca.guardsStatus === "BLOCKED") {
    items.push({ type: "SHADOW_BLOCKED", message: "La evaluación shadow de C-A fue bloqueada hoy por un guard.", strategyId: "CA_CANDIDATE_V1" });
  }
  if (!params.rs3m.hashVerified) {
    items.push({ type: "HASH_MISMATCH", message: "El hash de RS3M_CANDIDATE_V1 no coincide con el valor esperado.", strategyId: "RS3M_CANDIDATE_V1" });
  }
  if (!params.ca.hashVerified) {
    items.push({ type: "HASH_MISMATCH", message: "El hash de CA_CANDIDATE_V1 no coincide con el valor esperado.", strategyId: "CA_CANDIDATE_V1" });
  }
  if (params.rs3m.health !== "HEALTHY") {
    items.push({ type: "HEALTH_ISSUE", message: `Salud de RS3M: ${params.rs3m.health}.`, strategyId: "RS3M_CANDIDATE_V1" });
  }
  if (params.systemHealth !== "HEALTHY") {
    items.push({ type: "HEALTH_ISSUE", message: `Salud del sistema NovaCore: ${params.systemHealth}.` });
  }

  return items;
}

function buildHumanSummaryEs(params: BuildDailyCloseReportParams, attention: AttentionItem[]): string {
  const lines: string[] = [];

  if (params.portfolio.dailyPnlUsd.status === "OK") {
    lines.push(`NovaCore cerró el día con ${fmtUsd(params.portfolio.dailyPnlUsd)} (${fmtPct(params.portfolio.dailyPnlPct)}).`);
  } else {
    lines.push(`NovaCore cerró el día — resultado consolidado sin datos (${params.portfolio.dailyPnlUsd.reason}).`);
  }

  const rs3mPos = params.rs3m.positionAtClose.status === "OK" ? params.rs3m.positionAtClose.value : "sin datos";
  lines.push(`RS3M (Paper): ${fmtUsd(params.portfolio.dailyPnlUsd)} hoy. ${params.rs3m.signalToday.status === "OK" ? `Señal: ${params.rs3m.signalToday.value}.` : "Sin señal nueva hoy."} Posición: ${rs3mPos}.`);

  const caPos = params.ca.hypotheticalPosition;
  lines.push(
    `C-A (Shadow): ${params.ca.dailyPnlPct.status === "OK" ? `${fmtPct(params.ca.dailyPnlPct)} hipotético hoy` : "sin señal nueva hoy"}. Posición simulada: ${caPos}. Sin órdenes reales.`,
  );

  if (params.benchmark.spyDailyChangePct.status === "OK") {
    lines.push(`SPY: ${fmtPct(params.benchmark.spyDailyChangePct)}.`);
  }

  if (attention.length === 0) {
    lines.push("No hay incidencias.");
  } else {
    lines.push(attention.map((a) => a.message).join(" "));
  }

  return lines.join("\n\n");
}

export function buildDailyCloseReport(params: BuildDailyCloseReportParams): NovaCoreDailyCloseReport {
  const attention = buildAttention(params);

  const portfolio: NovaCoreDailyCloseReport["portfolio"] = {
    paperEquityUsd: params.portfolio.equity,
    dailyPnlUsd: params.portfolio.dailyPnlUsd,
    dailyPnlPct: params.portfolio.dailyPnlPct,
    accumulatedPnlUsd: params.portfolio.accumulatedPnlUsd,
    cashUsd: params.portfolio.cash,
    exposureUsd: params.portfolio.exposure,
  };

  const rs3m: DailyReportRs3mSection = {
    environment: "PAPER",
    status: params.rs3m.status,
    signalToday: params.rs3m.signalToday,
    positionAtClose: params.rs3m.positionAtClose,
    dailyPnlUsd: params.portfolio.dailyPnlUsd,
    dailyPnlPct: params.portfolio.dailyPnlPct,
    accumulatedPnlUsd: params.portfolio.accumulatedPnlUsd,
    ordersToday: params.rs3m.ordersToday,
    fillsToday: params.rs3m.fillsToday,
    approvalStatus: params.rs3m.approvalStatus,
    guardsStatus: params.rs3m.guardsStatus,
    lastActivity: params.rs3m.lastActivity,
    health: params.rs3m.health,
  };

  const ca: DailyReportCaSection = {
    environment: "SHADOW",
    status: params.ca.status,
    signalToday: params.ca.signalToday,
    hypotheticalPositionAtClose: params.ca.hypotheticalPosition,
    dailyShadowPnlUsd: noData("C-A shadow tiene asignado capital nocional cero — solo el porcentaje es un dato real. Un valor en dólares aquí sería inventado."),
    dailyShadowPnlPct: params.ca.dailyPnlPct,
    accumulatedShadowPnlPct: params.ca.accumulatedPnlPct,
    shadowEntryExit: params.ca.entryExit,
    hypotheticalFillPrice: params.ca.hypotheticalFillPrice,
    costBps: params.ca.costBps,
    guardsStatus: params.ca.guardsStatus,
    forwardDays: params.ca.forwardDays,
    shadowTrades: params.ca.shadowTrades,
  };

  const benchmark: DailyReportBenchmarkSection = {
    spyClose: params.benchmark.spyClose,
    spyDailyChangeUsd: params.benchmark.spyDailyChangeUsd,
    spyDailyChangePct: params.benchmark.spyDailyChangePct,
    rs3mDailyReturnPct: params.portfolio.dailyPnlPct,
    caShadowDailyReturnPct: params.ca.dailyPnlPct,
    source: params.benchmark.source,
    asOf: params.benchmark.asOf,
  };

  const humanSummaryEs = buildHumanSummaryEs(params, attention);

  return {
    date: params.date,
    generatedAt: params.generatedAt,
    marketSession: params.marketSession,
    dataFreshness: params.dataFreshnessNote,
    systemHealth: params.systemHealth,
    portfolio,
    rs3m,
    ca,
    benchmark,
    attention,
    humanSummaryEs,
    sourceMetadata: {
      "portfolio equity/cash": "Alpaca PAPER API via src/novacore/broker/alpaca-paper-broker-adapter.ts (live read-only), diffed against results/block10/daily-reports/rs3m-equity-marks.jsonl (this report engine's own daily equity-mark ledger)",
      "rs3m signal/position/approval/guards": "src/novacore/execution-center/adapters/rs3m-execution-adapter.ts, rs3m-guards-adapter.ts, results/block6/forward/ledger.jsonl (all read-only)",
      "ca shadow evidence": "results/block10/ca-forward/** (read-only, append-only)",
      "spy benchmark": params.benchmark.source,
      "candidate hashes": "src/core/paper-trading/rs3m/candidate.ts, src/core/ca-shadow/candidate.ts (recomputed and compared against pinned tripwires, never re-derived from a mutable source)",
    },
  };
}
