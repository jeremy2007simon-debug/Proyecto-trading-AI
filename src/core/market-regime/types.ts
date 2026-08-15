import type { Candle } from "@/core/market-data/types";
import type { IndicatorSnapshot } from "@/core/indicators/types";
import type { ISOTimestamp, Market, Timeframe } from "@/core/shared/types";

/**
 * Market regime taxonomy. Classification MUST be produced by deterministic,
 * reproducible quantitative rules (moving-average slope, ATR, realized
 * volatility, VWAP distance, ADX, swing structure, volume, range
 * expansion/contraction, momentum) — never by a generative model. See
 * `docs/ARCHITECTURE.md` for the full rationale.
 */
export type MarketRegime =
  | "STRONG_UPTREND"
  | "UPTREND"
  | "STRONG_DOWNTREND"
  | "DOWNTREND"
  | "RANGE"
  | "BREAKOUT"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "UNKNOWN";

/**
 * The quantitative inputs a regime detector is allowed to use. Every field
 * here must be traceable back to raw candles + indicators — nothing here
 * may come from a subjective or generative source.
 */
export interface RegimeDetectionInput {
  market: Market;
  timeframe: Timeframe;
  candles: readonly Candle[];
  indicators: IndicatorSnapshot;
}

/** One rule that contributed to (or against) the final classification. */
export interface RegimeRuleEvaluation {
  rule: string;
  passed: boolean;
  value: number | string | boolean;
  weight: number;
}

export interface RegimeDetectionResult {
  market: Market;
  timeframe: Timeframe;
  timestamp: ISOTimestamp;
  regime: MarketRegime;
  /** Regime classified immediately before this one, if known. */
  previousRegime?: MarketRegime;
  /** 0-100 internal confidence derived from rule agreement, not a probability. */
  confidenceScore: number;
  rulesEvaluated: RegimeRuleEvaluation[];
  /** Raw indicator readings used, persisted for auditability. */
  indicatorsSnapshot: IndicatorSnapshot;
}

/**
 * Contract for any regime classification implementation. The initial
 * implementation is rule-based (see `RuleBasedRegimeDetector`); this
 * interface is what the rest of the system depends on, so the detector
 * can be swapped or extended without touching Strategy Manager, Consensus
 * Engine, or Risk Engine.
 */
export interface MarketRegimeDetector {
  readonly id: string;

  detect(input: RegimeDetectionInput): RegimeDetectionResult;
}

/**
 * Persisted row shape mirroring the `market_regimes` table — used when
 * reading regime history back for analytics (duration, strategies used,
 * performance obtained, regime changes).
 */
export interface MarketRegimeRecord extends RegimeDetectionResult {
  id: string;
  /** Populated once the next regime change is detected. */
  endedAt?: ISOTimestamp;
  durationSeconds?: number;
}
