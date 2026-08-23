/**
 * Block 10.1 §8/§29 — NovaCore Daily Close Report schema. READ-ONLY
 * aggregation over existing sources (RS3M Paper state/evidence, C-A
 * shadow evidence, SPY benchmark, health, guards) — this module defines
 * shapes only, no strategy logic.
 *
 * `ReportValue<T>` is the schema's answer to §1/§11/§25: a numeric or
 * object field is NEVER silently coerced to 0 or omitted when the truth
 * is "we don't know" — it is always one of exactly three explicit
 * states, so a reader (and a test) can tell "confirmed zero" apart from
 * "the source isn't reachable" apart from "the source is reachable but
 * hasn't produced a result yet".
 */
export type ReportValue<T> = { status: "OK"; value: T } | { status: "NOT_CONNECTED"; reason: string } | { status: "NO_DATA"; reason: string };

export function ok<T>(value: T): ReportValue<T> {
  return { status: "OK", value };
}
export function notConnected<T>(reason: string): ReportValue<T> {
  return { status: "NOT_CONNECTED", reason };
}
export function noData<T>(reason: string): ReportValue<T> {
  return { status: "NO_DATA", reason };
}

export type MarketSession = "OPEN_SESSION_CLOSED" | "MARKET_CLOSED" | "SESSION_INCOMPLETE";

export interface DailyReportPortfolioSummary {
  paperEquityUsd: ReportValue<number>;
  dailyPnlUsd: ReportValue<number>;
  dailyPnlPct: ReportValue<number>;
  accumulatedPnlUsd: ReportValue<number>;
  cashUsd: ReportValue<number>;
  exposureUsd: ReportValue<number>;
}

export interface DailyReportRs3mSection {
  environment: "PAPER";
  status: string;
  signalToday: ReportValue<string>;
  positionAtClose: ReportValue<string>;
  dailyPnlUsd: ReportValue<number>;
  dailyPnlPct: ReportValue<number>;
  accumulatedPnlUsd: ReportValue<number>;
  ordersToday: ReportValue<number>;
  fillsToday: ReportValue<number>;
  approvalStatus: "REQUIRED" | "GRANTED" | "NOT_APPLICABLE" | "UNAVAILABLE";
  guardsStatus: "PASS" | "BLOCKED" | "AWAITING_APPROVAL" | "UNAVAILABLE";
  lastActivity: ReportValue<{ summary: string; timestamp: string }>;
  health: "HEALTHY" | "WARNING" | "DEGRADED" | "ERROR" | "OFFLINE";
}

export interface DailyReportCaSection {
  environment: "SHADOW";
  status: string;
  signalToday: ReportValue<string>;
  hypotheticalPositionAtClose: string; // always known — FLAT/LONG, structurally never "unavailable"
  dailyShadowPnlUsd: ReportValue<number>; // multiplier-based; "USD" is a NAV-normalized figure, see builder doc comment
  dailyShadowPnlPct: ReportValue<number>;
  accumulatedShadowPnlPct: ReportValue<number>;
  shadowEntryExit: ReportValue<"ENTER" | "EXIT">;
  hypotheticalFillPrice: ReportValue<number>;
  costBps: ReportValue<number>;
  guardsStatus: "PASS" | "BLOCKED" | "UNAVAILABLE";
  forwardDays: number;
  shadowTrades: number;
}

export interface DailyReportBenchmarkSection {
  spyClose: ReportValue<number>;
  spyDailyChangeUsd: ReportValue<number>;
  spyDailyChangePct: ReportValue<number>;
  rs3mDailyReturnPct: ReportValue<number>;
  caShadowDailyReturnPct: ReportValue<number>;
  source: string;
  asOf: string | undefined;
}

export type AttentionItemType = "APPROVAL_REQUIRED" | "STALE_DATA" | "BROKER_UNAVAILABLE" | "SHADOW_BLOCKED" | "ORDER_REJECTED" | "PARTIAL_FILL" | "HASH_MISMATCH" | "HEALTH_ISSUE";

export interface AttentionItem {
  type: AttentionItemType;
  message: string;
  strategyId?: string;
}

export interface NovaCoreDailyCloseReport {
  date: string; // YYYY-MM-DD, America/New_York trading date this report covers
  generatedAt: string; // ISO instant
  marketSession: MarketSession;
  dataFreshness: string; // human-readable summary of the freshest data cutoff used
  systemHealth: "HEALTHY" | "WARNING" | "DEGRADED" | "ERROR" | "OFFLINE";

  portfolio: DailyReportPortfolioSummary;
  rs3m: DailyReportRs3mSection;
  ca: DailyReportCaSection;
  benchmark: DailyReportBenchmarkSection;

  attention: AttentionItem[];
  humanSummaryEs: string;

  sourceMetadata: Record<string, string>;
}
