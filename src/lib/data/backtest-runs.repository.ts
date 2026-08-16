import "server-only";

import type { MarketRegime } from "@/core/market-regime/types";
import type {
  BacktestConfig,
  BacktestMetrics,
  BacktestRun,
  BacktestStatus,
  BacktestTrade,
  ExitReason,
} from "@/core/backtesting/types";
import type { Market, SignalDirection, Timeframe } from "@/core/shared/types";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

interface BacktestRunRow {
  id: string;
  name: string;
  market: Market;
  timeframe: Timeframe;
  strategy_ids: string[];
  regime_filter: MarketRegime[] | null;
  date_from: string;
  date_to: string;
  initial_capital: number;
  risk_per_trade_pct: number;
  mode: string;
  cost_config: Record<string, unknown>;
  same_candle_policy: string;
  dataset_split: Record<string, unknown> | null;
  code_version: string | null;
  parameters_snapshot: Record<string, unknown>;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

interface BacktestTradeRow {
  id: string;
  backtest_run_id: string;
  strategy_id: string | null;
  strategy_version: string | null;
  market: Market;
  timeframe: Timeframe;
  direction: SignalDirection;
  entry_price: number;
  stop_loss: number;
  take_profit: number | null;
  exit_price: number | null;
  entry_at: string;
  exit_at: string | null;
  exit_reason: string | null;
  ambiguous_intrabar_exit: boolean;
  pnl_amount: number | null;
  pnl_r: number | null;
  commission_paid: number;
  slippage_paid: number;
  market_regime_at_entry: MarketRegime | null;
  indicators_at_entry: Record<string, unknown> | null;
  rules_triggered: string[];
}

function runToRow(run: BacktestRun): BacktestRunRow {
  const { config } = run;
  return {
    id: run.id,
    name: config.name,
    market: config.market,
    timeframe: config.timeframe,
    strategy_ids: config.strategyIds,
    regime_filter: config.regimeFilter ?? null,
    date_from: config.dateFrom,
    date_to: config.dateTo,
    initial_capital: config.initialCapital,
    risk_per_trade_pct: config.riskPerTradePct,
    mode: config.mode,
    cost_config: config.costs as unknown as Record<string, unknown>,
    same_candle_policy: config.sameCandlePolicy,
    dataset_split: (config.datasetSplit as unknown as Record<string, unknown>) ?? null,
    code_version: null,
    parameters_snapshot: config.strategyParameterOverrides ?? {},
    status: run.status,
    started_at: run.startedAt ?? null,
    completed_at: run.completedAt ?? null,
    error_message: run.errorMessage ?? null,
  };
}

function tradeToRow(backtestRunId: string, trade: BacktestTrade): BacktestTradeRow {
  return {
    id: trade.id,
    backtest_run_id: backtestRunId,
    strategy_id: trade.strategyId ?? null,
    strategy_version: trade.strategyVersion ?? null,
    market: trade.market,
    timeframe: trade.timeframe,
    direction: trade.direction,
    entry_price: trade.entryPrice,
    stop_loss: trade.stopLoss,
    take_profit: trade.takeProfit ?? null,
    exit_price: trade.exitPrice ?? null,
    entry_at: trade.entryAt,
    exit_at: trade.exitAt ?? null,
    exit_reason: trade.exitReason ?? null,
    ambiguous_intrabar_exit: trade.ambiguousIntrabarExit,
    pnl_amount: trade.pnlAmount ?? null,
    pnl_r: trade.pnlR ?? null,
    commission_paid: trade.commissionPaid,
    slippage_paid: trade.slippagePaid,
    market_regime_at_entry: trade.marketRegimeAtEntry ?? null,
    indicators_at_entry: (trade.indicatorsAtEntry as unknown as Record<string, unknown>) ?? null,
    rules_triggered: trade.rulesTriggered,
  };
}

function rowToTrade(row: BacktestTradeRow): BacktestTrade {
  return {
    id: row.id,
    strategyId: row.strategy_id ?? undefined,
    strategyVersion: row.strategy_version ?? undefined,
    market: row.market,
    timeframe: row.timeframe,
    direction: row.direction as BacktestTrade["direction"],
    entryPrice: Number(row.entry_price),
    stopLoss: Number(row.stop_loss),
    takeProfit: row.take_profit !== null ? Number(row.take_profit) : undefined,
    exitPrice: row.exit_price !== null ? Number(row.exit_price) : undefined,
    entryAt: row.entry_at,
    exitAt: row.exit_at ?? undefined,
    exitReason: (row.exit_reason as ExitReason | null) ?? undefined,
    ambiguousIntrabarExit: row.ambiguous_intrabar_exit,
    pnlAmount: row.pnl_amount !== null ? Number(row.pnl_amount) : undefined,
    pnlR: row.pnl_r !== null ? Number(row.pnl_r) : undefined,
    commissionPaid: Number(row.commission_paid),
    slippagePaid: Number(row.slippage_paid),
    // The Block 4.5 spread/slippage breakdown (§1 of the research report)
    // isn't persisted to `backtest_trades` — this repository, and the
    // schema it maps to, predate that breakdown, and neither the
    // dashboard nor the DB-backed orchestrator (`backtest.server.ts`)
    // consume it. The research scripts that DO need it bypass the DB
    // entirely (same convention as `run-backtest-experiment.ts`), so a
    // migration for these four columns isn't warranted yet. Rows read
    // back from the DB honestly report zero breakdown rather than
    // fabricating a split of the combined `slippage_paid` total.
    entrySlippageAmount: 0,
    entrySpreadAmount: 0,
    exitSlippageAmount: 0,
    exitSpreadAmount: 0,
    // Same rationale as the cost breakdown above — `backtest_trades` has
    // no `position_size`/`risk_amount` columns yet, and nothing reads
    // these from a DB-sourced trade in this block.
    positionSize: 0,
    riskAmount: 0,
    marketRegimeAtEntry: row.market_regime_at_entry ?? undefined,
    indicatorsAtEntry: row.indicators_at_entry ?? undefined,
    rulesTriggered: row.rules_triggered ?? [],
  };
}

/**
 * Persists a completed (or failed) `BacktestRun` — the run row itself,
 * every trade, and the computed metrics row — via the service-role
 * client. A run is immutable once written (see the migration's header
 * comment): re-running with different parameters always creates a new
 * `backtest_runs` row, this function never updates an existing one.
 */
export async function insertBacktestRun(run: BacktestRun): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  const { error: runError } = await supabase.from("backtest_runs").insert(runToRow(run));
  if (runError) throw new Error(`Failed to insert backtest run: ${runError.message}`);

  if (run.trades.length > 0) {
    const { error: tradesError } = await supabase
      .from("backtest_trades")
      .insert(run.trades.map((trade) => tradeToRow(run.id, trade)));
    if (tradesError) throw new Error(`Failed to insert backtest trades: ${tradesError.message}`);
  }

  if (run.metrics) {
    await insertPerformanceMetrics(run.id, run.config, run.metrics);
  }
}

/** `performance_metrics` only has top-level aggregate columns (no per-regime/hour/etc breakdown columns) — those breakdowns live in `run.metrics` itself and are recomputed on read from `backtest_trades`, not persisted redundantly here. */
export async function insertPerformanceMetrics(
  backtestRunId: string,
  config: Pick<BacktestConfig, "market" | "timeframe" | "dateFrom" | "dateTo">,
  metrics: BacktestMetrics,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("performance_metrics").insert({
    scope: "BACKTEST",
    backtest_run_id: backtestRunId,
    market: config.market,
    timeframe: config.timeframe,
    period_start: config.dateFrom,
    period_end: config.dateTo,
    total_trades: metrics.totalTrades,
    winning_trades: metrics.winningTrades,
    losing_trades: metrics.losingTrades,
    win_rate: metrics.winRate,
    average_win: metrics.averageWin,
    average_loss: metrics.averageLoss,
    profit_factor: metrics.profitFactor,
    expectancy: metrics.expectancy,
    average_r: metrics.averageR,
    max_drawdown_pct: metrics.maxDrawdownPct,
    max_drawdown_amount: metrics.maxDrawdownAmount,
    sharpe_ratio: metrics.sharpeRatio ?? null,
    sortino_ratio: metrics.sortinoRatio ?? null,
    consecutive_wins: metrics.consecutiveWins,
    consecutive_losses: metrics.consecutiveLosses,
    net_pnl: metrics.netProfit,
    gross_profit: metrics.averageWin * metrics.winningTrades,
    gross_loss: Math.abs(metrics.averageLoss) * metrics.losingTrades,
  });
  if (error) throw new Error(`Failed to insert performance metrics: ${error.message}`);
}

export async function getBacktestRun(id: string): Promise<BacktestRun | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("backtest_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to read backtest run: ${error.message}`);
  if (!data) return undefined;

  const row = data as BacktestRunRow;
  const trades = await getBacktestTrades(id);

  const config: BacktestConfig = {
    name: row.name,
    market: row.market,
    timeframe: row.timeframe,
    mode: row.mode as BacktestConfig["mode"],
    strategyIds: row.strategy_ids,
    regimeFilter: row.regime_filter ?? undefined,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    initialCapital: Number(row.initial_capital),
    riskPerTradePct: Number(row.risk_per_trade_pct),
    commission: 0,
    slippage: 0,
    costs: row.cost_config as unknown as BacktestConfig["costs"],
    sameCandlePolicy: row.same_candle_policy as BacktestConfig["sameCandlePolicy"],
    datasetSplit: row.dataset_split as unknown as BacktestConfig["datasetSplit"],
  };

  return {
    id: row.id,
    config,
    status: row.status as BacktestStatus,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    trades,
  };
}

export async function getBacktestTrades(backtestRunId: string): Promise<BacktestTrade[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("backtest_trades")
    .select("*")
    .eq("backtest_run_id", backtestRunId)
    .order("entry_at", { ascending: true });
  if (error) throw new Error(`Failed to read backtest trades: ${error.message}`);
  return ((data ?? []) as BacktestTradeRow[]).map(rowToTrade);
}
