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
 * Full configuration for one backtest run. Can target a single strategy,
 * several strategies independently, or the full Consensus + Risk
 * pipeline — `mode` decides which.
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
  commission: number;
  slippage: number;
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
  pnlAmount?: number;
  pnlR?: number;
  marketRegimeAtEntry?: MarketRegime;
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
  riskRewardRatio: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdownPct: number;
  netProfit: number;
  returnPct: number;
  sharpeRatio?: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  exposurePct: number;
  tradesPerMonth: number;
  performanceByRegime: Partial<Record<MarketRegime, BacktestMetrics>>;
  performanceByStrategy: Record<string, BacktestMetrics>;
  performanceByHour: Record<number, BacktestMetrics>;
  performanceByWeekday: Record<number, BacktestMetrics>;
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

/**
 * Contract for the Backtesting Engine implementation. Kept independent
 * from Paper Trading and live Strategy evaluation so a backtest can
 * never accidentally write to `paper_trades` or `final_signals`.
 */
export interface BacktestingEngine {
  readonly id: string;

  run(config: BacktestConfig): Promise<BacktestRun>;
  runWalkForward(
    config: BacktestConfig,
    splits: WalkForwardSplit[],
  ): Promise<BacktestRun[]>;
}
