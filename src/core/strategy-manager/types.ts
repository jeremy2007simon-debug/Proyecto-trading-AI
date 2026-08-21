import type { IndicatorSnapshot } from "@/core/indicators/types";
import type { Candle } from "@/core/market-data/types";
import type { MarketRegime } from "@/core/market-regime/types";
import type {
  ISOTimestamp,
  Market,
  SignalDirection,
  Timeframe,
} from "@/core/shared/types";

/**
 * Strategy-tunable parameters. Kept as a loosely-typed record at the
 * interface level because each strategy defines its own parameter shape
 * (see e.g. `TrendFollowingParameters`); the Strategy Manager only needs
 * to store/validate/update this bag, never interpret it.
 */
export type StrategyParameters = Record<string, number | string | boolean>;

/**
 * Everything a strategy needs to evaluate a single signal. Strategies are
 * pure functions of this input — no I/O, no hidden state, no reaching
 * back into the database themselves. This is what makes them independently
 * testable and backtestable.
 */
export interface StrategyEvaluationInput {
  market: Market;
  timeframe: Timeframe;
  candles: readonly Candle[];
  indicators: IndicatorSnapshot;
  marketRegime: MarketRegime;
  parameters: StrategyParameters;
}

/**
 * The ONE output shape every strategy must return. Fields that don't apply
 * to a given signal (e.g. no entry/stop on a WAIT) must be left undefined —
 * strategies must never fabricate placeholder numbers.
 */
export interface StrategySignal {
  strategyId: string;
  strategyName: string;
  /** The `Strategy.version` that produced this signal — pins the signal to the exact rule set that generated it, so later parameter/rule changes never retroactively reinterpret historical signals. */
  strategyVersion: string;
  signal: SignalDirection;
  timestamp: ISOTimestamp;
  market: Market;
  timeframe: Timeframe;
  marketRegime: MarketRegime;
  price: number;

  /** Required when `signal` is BUY or SELL. */
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;

  /** Internal, strategy-specific score — not a probability. */
  rawScore: number;
  rulesTriggered: string[];
  rulesFailed: string[];
  explanation: string;
  metadata: Record<string, unknown>;
}

/** A `StrategySignal` as persisted (append-only) to `strategy_signals`. */
export interface StrategySignalRecord extends StrategySignal {
  id: string;
  createdAt: ISOTimestamp;
}

/**
 * Which research program a strategy belongs to. `LEGACY` covers the 5
 * strategies backtested in Block 4 / investigated in Block 4.5; every
 * family added from Block 5 onward gets its own tag. Purely a
 * classification label — never read by the engine to change behavior.
 */
export type StrategyFamily =
  | "LEGACY"
  | "MOMENTUM_TREND"
  | "PULLBACK_TREND"
  | "VOLATILITY_BREAKOUT"
  | "GAP_OVERNIGHT"
  | "INTRADAY_SEASONALITY"
  | "RELATIVE_STRENGTH"
  | "PAIRS_RELATIVE_VALUE"
  | "VOLATILITY_REGIME"
  | "MULTI_SIGNAL"
  // Added in Block 8 (Forex Research Lab) — two families with no prior
  // equivalent in the existing union. Purely additive.
  | "SESSION_BREAKOUT"
  | "MEAN_REVERSION";

/**
 * Lifecycle status for a strategy in the Strategy Discovery & Validation
 * Engine (Block 5). `HISTORICAL_REJECTED` = formally taken through a deep
 * validation funnel and rejected (documented evidence exists —
 * `invalidationConditions`); `HISTORICAL_UNVALIDATED` = negative in an
 * earlier block but never taken through the full funnel (weaker evidence,
 * not equated with a formal rejection). The rest mirror the Block 5
 * classification funnel's own labels.
 */
export type StrategyLifecycleStatus =
  | "ACTIVE_RESEARCH"
  | "HISTORICAL_UNVALIDATED"
  | "HISTORICAL_REJECTED"
  | "REJECTED"
  | "RESEARCH"
  | "CANDIDATE"
  | "VALIDATED";

/**
 * Common interface every strategy implements. Adding a new strategy means
 * writing a new class/module that satisfies this interface and registering
 * it with the Strategy Manager — it never requires modifying existing
 * strategies, the Consensus Engine, or the Risk Engine.
 */
export interface Strategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /**
   * Semver-ish version of this strategy's rule set. Bump it whenever the
   * BUY/SELL/WAIT logic (not just a default parameter value) changes, so
   * `StrategySignal.strategyVersion` always identifies exactly which
   * rules produced a given historical signal.
   */
  readonly version: string;
  /**
   * Factory-level default: whether this strategy should be registered
   * enabled. `StrategyRegistration.enabled` is the live, manager-owned
   * override (see `StrategyManager.setEnabled`) — this field only seeds
   * that initial value at `register()` time.
   */
  readonly enabled: boolean;
  readonly supportedMarkets: readonly Market[];
  readonly supportedTimeframes: readonly Timeframe[];
  /** Regimes under which this strategy is considered appropriate to run. */
  readonly compatibleRegimes: readonly MarketRegime[];
  readonly defaultParameters: StrategyParameters;

  /**
   * Research metadata (Block 5, Strategy Discovery & Validation Engine).
   * Optional and additive so pre-Block-5 synthetic test fixtures that
   * build a minimal `Strategy` object still type-check — never read by
   * the engine, purely for classification/reporting. Every REAL strategy
   * (legacy or new) should populate these.
   */
  readonly family?: StrategyFamily;
  /** One or two sentences: the economic/behavioral reason this edge might exist — not "parameter X beat parameter Y". */
  readonly hypothesis?: string;
  readonly status?: StrategyLifecycleStatus;
  /** Concrete, falsifiable conditions that would (or did) invalidate this hypothesis — e.g. "break-even cost below 1bps at realistic execution cost". */
  readonly invalidationConditions?: readonly string[];

  generateSignal(input: StrategyEvaluationInput): StrategySignal;
}

/**
 * Runtime registration record kept by the Strategy Manager. Wraps a
 * `Strategy` implementation with the mutable state the manager controls
 * (enabled flag, live parameters, weight) without the strategy itself
 * knowing about weighting or enablement.
 */
export interface StrategyRegistration {
  strategy: Strategy;
  enabled: boolean;
  parameters: StrategyParameters;
  /** Base weight used by the Consensus Engine before regime adjustment. */
  weight: number;
}

/** Aggregated historical performance for a strategy, used for weighting. */
export interface StrategyPerformanceSummary {
  strategyId: string;
  market: Market;
  timeframe: Timeframe;
  sampleSize: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  averageR: number;
  maxDrawdownPct: number;
  sharpeRatio?: number;
  /** True once `sampleSize` clears the minimum configured for reliable weighting. */
  sampleQualitySufficient: boolean;
  periodStart: ISOTimestamp;
  periodEnd: ISOTimestamp;
}

/**
 * Central registry contract. A single implementation
 * (`InMemoryStrategyManager` today, DB-backed later) is responsible for
 * strategy lifecycle so no other module needs to know how strategies are
 * stored.
 */
export interface StrategyManager {
  register(strategy: Strategy, options?: { weight?: number }): void;
  setEnabled(strategyId: string, enabled: boolean): void;
  setParameters(strategyId: string, parameters: StrategyParameters): void;
  setWeight(strategyId: string, weight: number): void;

  getRegistration(strategyId: string): StrategyRegistration | undefined;
  listRegistrations(market?: Market): StrategyRegistration[];
  listEnabled(market: Market, timeframe: Timeframe): StrategyRegistration[];

  generateSignals(input: StrategyEvaluationInput): StrategySignal[];
}
