import type { MarketRegime } from "@/core/market-regime/types";
import type { StrategySignal } from "@/core/strategy-manager/types";
import type {
  ISOTimestamp,
  Market,
  SignalDirection,
  Timeframe,
} from "@/core/shared/types";

/**
 * Everything the Consensus Engine needs to fold N independent strategy
 * signals into one decision. `weights` are the regime-adjusted weights
 * computed by the Strategy Manager (base weight zeroed out for any
 * strategy whose `compatibleRegimes` excludes the current regime) — the
 * Consensus Engine itself never decides compatibility, it only combines.
 */
export interface ConsensusEngineInput {
  market: Market;
  timeframe: Timeframe;
  timestamp: ISOTimestamp;
  marketRegime: MarketRegime;
  signals: StrategySignal[];
  /** strategyId -> weight already adjusted for regime compatibility. */
  weights: Record<string, number>;
}

/** How much a single strategy contributed to the final consensus. */
export interface StrategyContribution {
  strategyId: string;
  signal: SignalDirection;
  baseWeight: number;
  /** 0 when the strategy is not compatible with `marketRegime`. */
  regimeAdjustedWeight: number;
  rawScore: number;
}

/**
 * Output of the Consensus Engine. `consensusScore` is an internal
 * agreement measure on a -100..+100 scale — NOT a probability and must
 * never be presented to the user as a confidence percentage.
 */
export interface ConsensusResult {
  market: Market;
  timeframe: Timeframe;
  timestamp: ISOTimestamp;
  marketRegime: MarketRegime;

  /** -100 (strong SELL consensus) .. 0 (WAIT) .. +100 (strong BUY consensus). */
  consensusScore: number;

  /** Fractional weights of the three directions; sum to 1. */
  buyWeight: number;
  sellWeight: number;
  waitWeight: number;

  /**
   * 0 (unanimous) .. 1 (buyWeight === sellWeight, maximum contradiction).
   * Computed as 2 * min(buyWeight, sellWeight). Used by the Signal Engine
   * to bias toward WAIT when strong opposing signals coexist.
   */
  conflictScore: number;

  direction: SignalDirection;
  contributions: StrategyContribution[];
  participatingStrategyIds: string[];
}

/**
 * Contract for the consensus implementation. Deliberately NOT a simple
 * majority vote — see `ConsensusResult` and the weighting inputs above.
 */
export interface ConsensusEngine {
  readonly id: string;

  evaluate(input: ConsensusEngineInput): ConsensusResult;
}
