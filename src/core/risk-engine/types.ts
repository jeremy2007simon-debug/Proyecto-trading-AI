import type { ConsensusResult } from "@/core/consensus-engine/types";
import type { ISOTimestamp, Market } from "@/core/shared/types";

/**
 * Hard risk limits for this system. These are literal defaults, not
 * suggestions: no module may configure them upward at runtime. Widening
 * them requires a deliberate code change and review, never a settings
 * screen.
 */
export interface RiskRulesConfig {
  /** Max % of account equity risked on a single trade. */
  maxRiskPerTradePct: number;
  /** Max % of account equity that may be lost in a single day before trading halts. */
  maxDailyLossPct: number;
  /** Max number of trades the system may open in a single day. */
  maxTradesPerDay: number;
  /** A stop loss is mandatory on every BUY/SELL — never optional. */
  readonly stopLossRequired: true;
  /** Martingale-style position escalation after a loss is forbidden. */
  readonly allowMartingale: false;
  /** Adding to a losing open position is forbidden. */
  readonly allowAveragingDown: false;
}

export const DEFAULT_RISK_RULES: RiskRulesConfig = {
  maxRiskPerTradePct: 0.5,
  maxDailyLossPct: 1,
  maxTradesPerDay: 2,
  stopLossRequired: true,
  allowMartingale: false,
  allowAveragingDown: false,
};

export type RiskRuleId =
  | "MAX_RISK_PER_TRADE"
  | "MAX_DAILY_LOSS"
  | "MAX_TRADES_PER_DAY"
  | "STOP_LOSS_REQUIRED"
  | "NO_MARTINGALE"
  | "NO_AVERAGING_DOWN"
  | "KILL_SWITCH"
  | "MINIMUM_RISK_REWARD"
  | "SAMPLE_QUALITY_SUFFICIENT";

/** Single rule outcome, persisted verbatim into `risk_events.details`. */
export interface RiskRuleEvaluation {
  rule: RiskRuleId;
  passed: boolean;
  detail: string;
}

/** Minimal open-position shape the Risk Engine needs to enforce averaging-down protection. */
export interface OpenPositionSummary {
  market: Market;
  direction: "BUY" | "SELL";
  entryPrice: number;
  positionSize: number;
}

export interface RiskEvaluationInput {
  candidate: ConsensusResult;
  /** Entry/stop/target proposed by the dominant contributing strategy. Stop loss is mandatory for BUY/SELL. */
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  /** Minimum acceptable risk/reward ratio for this system instance (configurable, e.g. 1.5). */
  minRiskReward: number;
  accountEquity: number;
  openPositions: readonly OpenPositionSummary[];
  tradesTakenToday: number;
  realizedPnlPctToday: number;
  /** True only when the contributing strategies have sufficient historical sample size. */
  sampleQualitySufficient: boolean;
}

/**
 * Result of a Risk Engine evaluation. `approved` is the ONLY signal that
 * may turn a consensus candidate into a `final_signals` row with
 * direction BUY/SELL — every other module treats this as final.
 */
export interface RiskDecision {
  approved: boolean;
  rejectionReason?: string;
  /** Computed by Position Sizing from accountEquity, maxRiskPerTradePct, entry, stopLoss. */
  positionSize?: number;
  riskAmount?: number;
  rulesEvaluated: RiskRuleEvaluation[];
  evaluatedAt: ISOTimestamp;
}

/**
 * Contract for the Risk Engine. This is the single choke point of the
 * whole pipeline: Strategy Manager and Consensus Engine may produce a
 * BUY/SELL candidate, but only `RiskEngine.evaluate()` can approve it
 * for `final_signals` / paper trading. No other module may bypass it.
 */
export interface RiskEngine {
  readonly id: string;
  readonly rules: RiskRulesConfig;

  evaluate(input: RiskEvaluationInput): RiskDecision;

  isKillSwitchActive(): boolean;
  /** Activating the kill switch must also emit a `risk_events` row (KILL_SWITCH_ACTIVATED). */
  activateKillSwitch(reason: string): void;
  deactivateKillSwitch(): void;
}

/**
 * Contract for the Position Sizing module. Never returns a fixed,
 * arbitrary size — always derives it from account equity, risk %, and
 * the entry/stop distance.
 */
export interface PositionSizingInput {
  accountEquity: number;
  riskPct: number;
  entry: number;
  stopLoss: number;
}

export interface PositionSizingResult {
  positionSize: number;
  riskAmount: number;
  stopDistance: number;
}

export interface PositionSizer {
  calculate(input: PositionSizingInput): PositionSizingResult;
}
