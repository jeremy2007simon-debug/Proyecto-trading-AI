import type { IndicatorSnapshot } from "@/core/indicators/types";
import type { Candle } from "@/core/market-data/types";
import type { MarketRegime } from "@/core/market-regime/types";
import type { StrategyParameters } from "@/core/strategy-manager/types";
import type {
  ISOTimestamp,
  Market,
  SignalDirection,
  Timeframe,
} from "@/core/shared/types";

export type BacktestStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
export type ExitReason = "TAKE_PROFIT" | "STOP_LOSS" | "MANUAL_CLOSE" | "TIME_EXIT";

/**
 * Modeled execution frictions. `commissionPerFill` is charged on every
 * fill (entry AND exit each incur it separately); `slippagePct` and
 * `halfSpread` are applied ONLY to entry fills and to STOP_LOSS exits
 * (both treated as urgency/market-order-like fills) — a TAKE_PROFIT
 * exit is treated as a resting limit order that fills exactly at its
 * price, a common and defensible convention, not the only one possible.
 */
export interface ExecutionCostConfig {
  commissionPerFill: number;
  slippagePct: number;
  halfSpread: number;
}

/**
 * `commissionPerFill=0` because the broker being modeled (Alpaca) is
 * zero-commission on equities — the "realistic cost" scenario below
 * therefore comes entirely from slippage + spread, not commission.
 * Neither preset is claimed optimal; they are reasonable research-phase
 * starting points, meant to be compared against each other, not treated
 * as ground truth.
 */
export const ZERO_COST_BASELINE: ExecutionCostConfig = {
  commissionPerFill: 0,
  slippagePct: 0,
  halfSpread: 0,
};

/** 5bps slippage + a $0.005 half-spread — roughly SPY's typical NBBO spread. */
export const REALISTIC_COST_SCENARIO: ExecutionCostConfig = {
  commissionPerFill: 0,
  slippagePct: 0.0005,
  halfSpread: 0.005,
};

/**
 * How to resolve a bar where both the stop loss AND the take profit
 * fall within [low, high] — OHLC alone can never tell which was touched
 * first. `CONSERVATIVE` (the required default) always assumes the
 * UNFAVORABLE outcome; `OPTIMISTIC` always assumes the favorable one.
 * Every such bar is flagged via `BacktestTrade.ambiguousIntrabarExit`
 * regardless of which policy resolved it, so results can be audited.
 */
export type SameCandlePolicy = "CONSERVATIVE" | "OPTIMISTIC";
export const DEFAULT_SAME_CANDLE_POLICY: SameCandlePolicy = "CONSERVATIVE";

/** Chronological (never shuffled) percentage split of a candle series. */
export interface DatasetSplitConfig {
  trainPct: number;
  validationPct: number;
  outOfSamplePct: number;
}
export const DEFAULT_DATASET_SPLIT: DatasetSplitConfig = {
  trainPct: 60,
  validationPct: 20,
  outOfSamplePct: 20,
};

export interface DatasetSplitPeriod {
  from: ISOTimestamp;
  to: ISOTimestamp;
  candleCount: number;
}
export interface DatasetSplitResult {
  train: DatasetSplitPeriod;
  validation: DatasetSplitPeriod;
  outOfSample: DatasetSplitPeriod;
}

/** Bar-count-based walk-forward window sizing (not date-based, so it's timeframe-agnostic). */
export interface WalkForwardConfig {
  trainBars: number;
  validationBars: number;
  forwardBars: number;
  stepBars: number;
}

/**
 * Sample-quality label, purely a function of trade count. Documented
 * thresholds (a reasonable rule of thumb, not claimed statistically
 * optimal): <10 INSUFFICIENT, 10-29 LOW, 30-99 MEDIUM, 100+ HIGH.
 * Every metrics summary this system presents must show this label next
 * to it — a Sharpe ratio computed on 12 trades is not evidence.
 */
export type SampleQualityLabel = "INSUFFICIENT" | "LOW" | "MEDIUM" | "HIGH";

/**
 * Bootstrap-resampling risk analysis over a completed run's realized
 * R-multiples — NOT a forecast of future returns. See
 * `runMonteCarloSimulation`'s docstring for the full disclaimer.
 */
export interface MonteCarloResult {
  numSimulations: number;
  seed: number;
  maxDrawdownPct: { p5: number; p50: number; p95: number };
  endingEquity: { p5: number; p50: number; p95: number };
  losingStreak: { p5: number; p50: number; p95: number };
}

/**
 * Full configuration for one backtest run. Can target a single strategy,
 * several strategies independently, or the full Consensus + Risk
 * pipeline — `mode` decides which. Only `SINGLE_STRATEGY` has a concrete
 * engine implementation as of this block; requesting `MULTI_STRATEGY` or
 * `FULL_CONSENSUS` throws explicitly rather than silently degrading.
 */
export interface BacktestConfig {
  name: string;
  market: Market;
  timeframe: Timeframe;
  mode: "SINGLE_STRATEGY" | "MULTI_STRATEGY" | "FULL_CONSENSUS";
  strategyIds: string[];
  strategyParameterOverrides?: Record<string, StrategyParameters>;
  strategyWeightOverrides?: Record<string, number>;
  regimeFilter?: MarketRegime[];
  dateFrom: ISOTimestamp;
  dateTo: ISOTimestamp;
  initialCapital: number;
  riskPerTradePct: number;
  /** @deprecated superseded by `costs.commissionPerFill` — kept only so existing DB rows/readers don't break; the engine reads `costs`, not this. */
  commission: number;
  /** @deprecated superseded by `costs.slippagePct` — see `commission`. */
  slippage: number;
  costs: ExecutionCostConfig;
  sameCandlePolicy: SameCandlePolicy;
  /** Present only when the caller wants the run split into train/validation/out-of-sample. */
  datasetSplit?: DatasetSplitConfig;
}

/**
 * Walk-forward split of a date range. A parameter set must never be
 * optimized on `validation`/`outOfSample` data and then reported as if
 * tested on unseen data — `outOfSample` is the only period whose results
 * may be presented as evidence of robustness.
 */
export interface WalkForwardSplit {
  training: { from: ISOTimestamp; to: ISOTimestamp };
  validation: { from: ISOTimestamp; to: ISOTimestamp };
  outOfSample: { from: ISOTimestamp; to: ISOTimestamp };
}

export interface BacktestTrade {
  id: string;
  strategyId?: string;
  strategyVersion?: string;
  market: Market;
  timeframe: Timeframe;
  direction: Extract<SignalDirection, "BUY" | "SELL">;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  exitPrice?: number;
  entryAt: ISOTimestamp;
  exitAt?: ISOTimestamp;
  exitReason?: ExitReason;
  /** True when this trade's exit bar touched both stopLoss and takeProfit — see `SameCandlePolicy`. */
  ambiguousIntrabarExit: boolean;
  pnlAmount?: number;
  pnlR?: number;
  commissionPaid: number;
  slippagePaid: number;
  marketRegimeAtEntry?: MarketRegime;
  /** Indicator values the strategy actually saw at entry — audit trail (point 24). */
  indicatorsAtEntry?: IndicatorSnapshot;
  rulesTriggered: string[];
}

/**
 * The full metrics set required by the spec. Optional fields (e.g.
 * `sharpeRatio`) are omitted rather than fabricated when the sample size
 * or data quality doesn't support them.
 */
export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  averageR: number;
  medianR: number;
  riskRewardRatio: number;
  profitFactor: number;
  /** Expectancy in account currency (per trade). */
  expectancy: number;
  /** Expectancy in R (per trade) — the primary cross-strategy-comparable figure (point 13). */
  expectancyR: number;
  maxDrawdownPct: number;
  maxDrawdownAmount: number;
  netProfit: number;
  returnPct: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  exposurePct: number;
  tradesPerMonth: number;
  averageHoldingTimeMs: number;
  sampleQuality: SampleQualityLabel;
  performanceByRegime: Partial<Record<MarketRegime, BacktestMetrics>>;
  performanceByStrategy: Record<string, BacktestMetrics>;
  performanceByHour: Record<number, BacktestMetrics>;
  performanceByWeekday: Record<number, BacktestMetrics>;
  performanceByMonth: Record<string, BacktestMetrics>;
  performanceBySession: Partial<Record<"OPENING" | "MIDDAY" | "CLOSING", BacktestMetrics>>;
}

export interface BacktestRun {
  id: string;
  config: BacktestConfig;
  status: BacktestStatus;
  startedAt?: ISOTimestamp;
  completedAt?: ISOTimestamp;
  errorMessage?: string;
  trades: BacktestTrade[];
  metrics?: BacktestMetrics;
}

export type BacktestFailureCode =
  | "TIMESTAMP_DISORDER"
  | "DUPLICATE_CANDLES"
  | "INSUFFICIENT_WARMUP"
  | "STRATEGY_ERROR"
  | "INDICATOR_CALCULATION_FAILURE"
  | "UNSUPPORTED_MODE";

/**
 * Thrown by the engine whenever a failure condition (point 26) is hit.
 * Never caught-and-ignored internally — the engine either completes a
 * fully valid run or throws this; it never returns a partial result
 * disguised as complete. Orchestrators (`backtest.server.ts`) catch this
 * and record `BacktestRun.status = "FAILED"` with `errorMessage`.
 */
export class BacktestSimulationError extends Error {
  constructor(
    readonly code: BacktestFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "BacktestSimulationError";
  }
}

/**
 * Contract for the Backtesting Engine implementation. Kept independent
 * from Paper Trading and live Strategy evaluation so a backtest can
 * never accidentally write to `paper_trades` or `final_signals`.
 *
 * Synchronous, not I/O-bound: the engine is a pure function of
 * `(config, candles)` — fetching candles from a provider/database is the
 * orchestrator's job (`src/lib/data/backtest.server.ts`), never the
 * engine's. This is a deliberate change from the original interface
 * sketch (`Promise<BacktestRun>`, no `candles` parameter) now that this
 * block gives it its first concrete implementation — nothing depended on
 * the old shape (no implementation existed yet).
 */
export interface BacktestingEngine {
  readonly id: string;

  run(config: BacktestConfig, candles: readonly Candle[]): BacktestRun;
  runWalkForward(
    config: BacktestConfig,
    splits: WalkForwardSplit[],
    candles: readonly Candle[],
  ): BacktestRun[];
}
