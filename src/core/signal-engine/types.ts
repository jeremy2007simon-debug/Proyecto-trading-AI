import type { ConsensusResult } from "@/core/consensus-engine/types";
import type { MarketRegime } from "@/core/market-regime/types";
import type { RiskDecision } from "@/core/risk-engine/types";
import type {
  ISOTimestamp,
  Market,
  SignalDirection,
  Timeframe,
} from "@/core/shared/types";

/**
 * The single output of the whole pipeline
 * (Market Data -> Regime -> Strategies -> Consensus -> Risk -> Final Signal).
 * A `FinalSignal` is BUY or SELL only when `risk.approved` is true; if the
 * Risk Engine rejects the candidate, `direction` MUST be forced to "WAIT"
 * regardless of what the Consensus Engine produced.
 */
export interface FinalSignal {
  id: string;
  market: Market;
  timeframe: Timeframe;
  timestamp: ISOTimestamp;
  marketRegime: MarketRegime;

  direction: SignalDirection;
  price: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;

  consensus: ConsensusResult;
  risk: RiskDecision;

  /** Populated by the AI Layer purely as explanation — never used to decide direction. */
  aiExplanation?: string;
}

/**
 * Minimum, non-negotiable conditions before a candidate may be emitted
 * as BUY/SELL. Any failure here forces WAIT. This mirrors the "Minimum
 * Quality Conditions" section of the product spec and is meant to be
 * checked explicitly (and logged) rather than implied.
 */
export interface SignalQualityGate {
  consensusThresholdMet: boolean;
  riskEngineApproved: boolean;
  marketDataValid: boolean;
  killSwitchInactive: boolean;
  noInternalError: boolean;
  sampleQualitySufficient: boolean;
  stopLossDefined: boolean;
  minimumRiskRewardMet: boolean;
}

export function isSignalEmittable(gate: SignalQualityGate): boolean {
  return Object.values(gate).every(Boolean);
}

/**
 * Contract for the Final Signal Engine: combines Market Regime, Strategy
 * Manager output (via Consensus Engine) and the Risk Engine decision into
 * one `FinalSignal`. This is the only module allowed to construct a
 * `FinalSignal`.
 */
export interface SignalEngine {
  readonly id: string;

  buildFinalSignal(input: {
    consensus: ConsensusResult;
    risk: RiskDecision;
    entry?: number;
    stopLoss?: number;
    takeProfit?: number;
  }): FinalSignal;
}
