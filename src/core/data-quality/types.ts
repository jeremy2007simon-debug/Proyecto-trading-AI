import type { Candle } from "@/core/market-data/types";
import type { MarketHoursCalendar } from "@/core/market-hours/types";
import type { ISOTimestamp, Market, Timeframe } from "@/core/shared/types";

export type DataQualityRuleId =
  | "NO_DUPLICATE_TIMESTAMPS"
  | "MONOTONIC_TIMESTAMPS"
  | "NO_GAPS_IN_SEQUENCE"
  | "OHLC_INTERNALLY_CONSISTENT"
  | "NO_ZERO_OR_NEGATIVE_PRICES"
  | "VOLUME_NON_NEGATIVE"
  | "WITHIN_EXPECTED_TIMEFRAME_INTERVAL"
  | "NOT_STALE"
  | "SUFFICIENT_SAMPLE_SIZE";

export interface DataQualityRuleEvaluation {
  rule: DataQualityRuleId;
  passed: boolean;
  detail: string;
  affectedCount?: number;
}

export type DataQualityStatus = "PASS" | "WARN" | "FAIL";

export interface DataQualityReport {
  market: Market;
  timeframe: Timeframe;
  evaluatedAt: ISOTimestamp;
  candleCount: number;
  rangeFrom?: ISOTimestamp;
  rangeTo?: ISOTimestamp;
  status: DataQualityStatus;
  rulesEvaluated: DataQualityRuleEvaluation[];
  gapsDetected: number;
  duplicatesDetected: number;
}

export interface DataQualityContext {
  market: Market;
  timeframe: Timeframe;
  calendar: MarketHoursCalendar;
  now: Date;
  /** Overrides the engine's default minimum sample size for the SUFFICIENT_SAMPLE_SIZE rule. */
  minimumSampleSize?: number;
}

/**
 * Contract for the Data Quality Engine. Synchronous and pure, same
 * family as `RiskEngine.evaluate()` — no I/O, no side effects, fully
 * reproducible from its inputs.
 */
export interface DataQualityEngine {
  readonly id: string;
  evaluate(candles: readonly Candle[], context: DataQualityContext): DataQualityReport;
}

/**
 * The single function that answers "is it safe to trade on this data."
 * This is the intended bridge to `SignalQualityGate.marketDataValid`
 * (see `src/core/signal-engine/types.ts`) once a `SignalEngine`
 * implementation exists — that field's value should be
 * `candlesFetchResult.ok && toMarketDataValidFlag(report)`.
 */
export function toMarketDataValidFlag(report: DataQualityReport): boolean {
  return report.status !== "FAIL";
}
