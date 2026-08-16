import { computeIndicatorSnapshotSeries } from "@/core/indicators";
import { createNyseCalendar, getEasternWallClockParts } from "@/core/market-hours/nyse-calendar";
import { createRuleBasedRegimeDetector } from "@/core/market-regime/rule-based-regime-detector";
import type { MarketRegime } from "@/core/market-regime/types";
import { createPositionSizer } from "@/core/risk-engine/position-sizer";
import { DEFAULT_RISK_RULES } from "@/core/risk-engine/types";
import { getDefaultStrategyManager } from "@/core/strategy-manager/registry";
import { buildWaitSignal } from "@/core/strategy-manager/signal-helpers";
import type { Strategy, StrategyManager, StrategyRegistration } from "@/core/strategy-manager/types";
import { computeBacktestMetrics } from "@/core/backtesting/metrics";
import { createDayState, evaluateDailyRiskGate, type DayState } from "@/core/backtesting/daily-risk-gate";
import { resolveIntrabarExit } from "@/core/backtesting/same-candle-resolver";
import {
  BacktestSimulationError,
  type BacktestConfig,
  type BacktestingEngine,
  type BacktestRun,
  type BacktestTrade,
  type ExecutionCostConfig,
  type ExitReason,
  type WalkForwardSplit,
} from "@/core/backtesting/types";
import type { Candle } from "@/core/market-data/types";
import type { IndicatorSnapshot } from "@/core/indicators/types";

function eastDateKey(instant: Date): string {
  const parts = getEasternWallClockParts(instant);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function validateCandles(candles: readonly Candle[]): void {
  if (candles.length < 2) {
    throw new BacktestSimulationError(
      "INSUFFICIENT_WARMUP",
      `Not enough candles to simulate anything (${candles.length}).`,
    );
  }
  for (let i = 1; i < candles.length; i++) {
    const prev = new Date(candles[i - 1].timestamp).getTime();
    const curr = new Date(candles[i].timestamp).getTime();
    if (curr === prev) {
      throw new BacktestSimulationError(
        "DUPLICATE_CANDLES",
        `Duplicate candle timestamp at index ${i}: ${candles[i].timestamp}.`,
      );
    }
    if (curr < prev) {
      throw new BacktestSimulationError(
        "TIMESTAMP_DISORDER",
        `Candle at index ${i} (${candles[i].timestamp}) is earlier than the previous candle (${candles[i - 1].timestamp}).`,
      );
    }
  }
}

/**
 * Adverse fill adjustment for an ENTRY: a BUY entry pays more (price
 * moves up against you), a SELL entry (opening short) receives less
 * (price moves down against you).
 */
function applyEntryCost(price: number, direction: "BUY" | "SELL", costs: ExecutionCostConfig): number {
  const adverseSign = direction === "BUY" ? 1 : -1;
  return price + adverseSign * (price * costs.slippagePct + costs.halfSpread);
}

/**
 * Adverse fill adjustment for a market-order-style EXIT (STOP_LOSS or
 * TIME_EXIT): closing a BUY means selling (receive less), closing a
 * SELL means buying back (pay more). TAKE_PROFIT exits do NOT use this
 * — they're treated as a resting limit order filling exactly at its
 * price (see `ExecutionCostConfig` docs).
 */
function applyMarketExitCost(price: number, direction: "BUY" | "SELL", costs: ExecutionCostConfig): number {
  const adverseSign = direction === "BUY" ? -1 : 1;
  return price + adverseSign * (price * costs.slippagePct + costs.halfSpread);
}

interface OpenPosition {
  direction: "BUY" | "SELL";
  entryPrice: number;
  rawEntryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  entryAt: string;
  positionSize: number;
  riskAmount: number;
  strategyId: string;
  strategyVersion: string;
  marketRegimeAtEntry: MarketRegime;
  indicatorsAtEntry: IndicatorSnapshot;
  rulesTriggered: string[];
  entrySlippagePaid: number;
}

function closeTrade(
  position: OpenPosition,
  market: BacktestConfig["market"],
  timeframe: BacktestConfig["timeframe"],
  rawExitPrice: number,
  exitReason: ExitReason,
  ambiguous: boolean,
  exitAt: string,
  costs: ExecutionCostConfig,
): BacktestTrade {
  const isMarketStyleExit = exitReason === "STOP_LOSS" || exitReason === "TIME_EXIT";
  const exitPrice = isMarketStyleExit ? applyMarketExitCost(rawExitPrice, position.direction, costs) : rawExitPrice;
  const exitSlippagePaid = isMarketStyleExit ? Math.abs(exitPrice - rawExitPrice) * position.positionSize : 0;
  const commissionPaid = costs.commissionPerFill * 2; // entry + exit, each a separate fill
  const directionSign = position.direction === "BUY" ? 1 : -1;
  const pnlAmount = (exitPrice - position.entryPrice) * position.positionSize * directionSign - commissionPaid;
  const pnlR = position.riskAmount > 0 ? pnlAmount / position.riskAmount : 0;

  return {
    id: crypto.randomUUID(),
    strategyId: position.strategyId,
    strategyVersion: position.strategyVersion,
    market,
    timeframe,
    direction: position.direction,
    entryPrice: position.entryPrice,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    exitPrice,
    entryAt: position.entryAt,
    exitAt,
    exitReason,
    ambiguousIntrabarExit: ambiguous,
    pnlAmount,
    pnlR,
    commissionPaid,
    slippagePaid: position.entrySlippagePaid + exitSlippagePaid,
    marketRegimeAtEntry: position.marketRegimeAtEntry,
    indicatorsAtEntry: position.indicatorsAtEntry,
    rulesTriggered: position.rulesTriggered,
  };
}

function simulateSingleStrategy(
  config: BacktestConfig,
  candles: readonly Candle[],
  registration: StrategyRegistration,
): BacktestRun {
  const strategy: Strategy = registration.strategy;

  if (!strategy.supportedMarkets.includes(config.market) || !strategy.supportedTimeframes.includes(config.timeframe)) {
    throw new BacktestSimulationError(
      "STRATEGY_ERROR",
      `${strategy.id} does not support ${config.market}/${config.timeframe} (supports ${strategy.supportedMarkets.join(",")} / ${strategy.supportedTimeframes.join(",")}).`,
    );
  }

  validateCandles(candles);

  const startedAt = new Date().toISOString();
  const calendar = createNyseCalendar(config.market);

  let indicatorSeries: Map<string, IndicatorSnapshot>;
  let regimeByTimestamp: Map<string, MarketRegime>;
  try {
    indicatorSeries = computeIndicatorSnapshotSeries(candles, calendar);
    const regimeResults = createRuleBasedRegimeDetector().detectSeries({
      market: config.market,
      timeframe: config.timeframe,
      candles,
      indicators: {},
    });
    regimeByTimestamp = new Map(regimeResults.map((r) => [r.timestamp, r.regime]));
  } catch (error) {
    throw new BacktestSimulationError(
      "INDICATOR_CALCULATION_FAILURE",
      `Failed to precompute indicators/regime series: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const positionSizer = createPositionSizer();
  const trades: BacktestTrade[] = [];
  let openPosition: OpenPosition | undefined;
  let equity = config.initialCapital;
  let dayState: DayState = createDayState("");
  let dayStartEquity = equity;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const dateKey = eastDateKey(new Date(candle.timestamp));
    if (dateKey !== dayState.dateKey) {
      dayState = createDayState(dateKey);
      dayStartEquity = equity;
    }

    if (openPosition) {
      const exit = resolveIntrabarExit(
        { direction: openPosition.direction, stopLoss: openPosition.stopLoss, takeProfit: openPosition.takeProfit },
        candle,
        config.sameCandlePolicy,
      );
      if (exit) {
        const trade = closeTrade(
          openPosition,
          config.market,
          config.timeframe,
          exit.exitPrice,
          exit.exitReason,
          exit.ambiguous,
          candle.timestamp,
          config.costs,
        );
        trades.push(trade);
        equity += trade.pnlAmount!;
        dayState.realizedPnlPct = dayStartEquity > 0 ? ((equity - dayStartEquity) / dayStartEquity) * 100 : 0;
        openPosition = undefined;
      }
    }

    if (!openPosition) {
      const gate = evaluateDailyRiskGate(dayState, DEFAULT_RISK_RULES);
      if (gate.allowed) {
        const candlesSoFar = candles.slice(0, i + 1);
        const regime = regimeByTimestamp.get(candle.timestamp) ?? "UNKNOWN";
        const indicators = indicatorSeries.get(candle.timestamp) ?? {};

        const signal = strategy.compatibleRegimes.includes(regime)
          ? evaluateStrategySafely(strategy, {
              market: config.market,
              timeframe: config.timeframe,
              candles: candlesSoFar,
              indicators,
              marketRegime: regime,
              parameters: registration.parameters,
            })
          : buildWaitSignal({
              strategy,
              input: {
                market: config.market,
                timeframe: config.timeframe,
                candles: candlesSoFar,
                indicators,
                marketRegime: regime,
                parameters: registration.parameters,
              },
              explanation: `${strategy.name} is not evaluated in ${regime} — compatible regimes are ${strategy.compatibleRegimes.join(", ")}.`,
              rulesFailed: ["REGIME_COMPATIBILITY"],
            });

        if (signal.signal !== "WAIT" && signal.entry !== undefined && signal.stopLoss !== undefined) {
          const sizing = positionSizer.calculate({
            accountEquity: equity,
            riskPct: config.riskPerTradePct,
            entry: signal.entry,
            stopLoss: signal.stopLoss,
          });

          if (sizing.positionSize > 0) {
            const entryPrice = applyEntryCost(signal.entry, signal.signal, config.costs);
            openPosition = {
              direction: signal.signal,
              entryPrice,
              rawEntryPrice: signal.entry,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              entryAt: candle.timestamp,
              positionSize: sizing.positionSize,
              riskAmount: sizing.riskAmount,
              strategyId: strategy.id,
              strategyVersion: strategy.version,
              marketRegimeAtEntry: regime,
              indicatorsAtEntry: indicators,
              rulesTriggered: signal.rulesTriggered,
              entrySlippagePaid: Math.abs(entryPrice - signal.entry) * sizing.positionSize,
            };
            dayState.tradesOpened += 1;
          }
        }
      }
    }
  }

  if (openPosition) {
    const lastCandle = candles[candles.length - 1];
    const trade = closeTrade(
      openPosition,
      config.market,
      config.timeframe,
      lastCandle.close,
      "TIME_EXIT",
      false,
      lastCandle.timestamp,
      config.costs,
    );
    trades.push(trade);
    equity += trade.pnlAmount!;
  }

  const periodStart = candles[0]?.timestamp ?? config.dateFrom;
  const periodEnd = candles[candles.length - 1]?.timestamp ?? config.dateTo;
  const metrics = computeBacktestMetrics(trades, config.initialCapital, periodStart, periodEnd);

  return {
    id: crypto.randomUUID(),
    config,
    status: "COMPLETED",
    startedAt,
    completedAt: new Date().toISOString(),
    trades,
    metrics,
  };
}

/** Isolates a strategy that throws — surfaced as a typed failure, never silently swallowed or treated as WAIT. */
function evaluateStrategySafely(
  strategy: Strategy,
  input: Parameters<Strategy["generateSignal"]>[0],
): ReturnType<Strategy["generateSignal"]> {
  try {
    return strategy.generateSignal(input);
  } catch (error) {
    throw new BacktestSimulationError(
      "STRATEGY_ERROR",
      `${strategy.id} threw while evaluating candle at ${input.candles[input.candles.length - 1]?.timestamp}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * The only concrete `BacktestingEngine`. Pure function of `(config,
 * candles)` — no I/O, no Supabase, no provider fetch; that's the
 * orchestrator's job (`src/lib/data/backtest.server.ts`). Only
 * `SINGLE_STRATEGY` mode has an implementation; `MULTI_STRATEGY` and
 * `FULL_CONSENSUS` throw explicitly rather than silently degrading,
 * since neither the Consensus Engine nor its Risk Engine wiring exists
 * yet.
 */
export function createEventDrivenBacktestEngine(
  manager: StrategyManager = getDefaultStrategyManager(),
): BacktestingEngine {
  function resolveSingleStrategyRegistration(config: BacktestConfig): StrategyRegistration {
    if (config.mode !== "SINGLE_STRATEGY") {
      throw new BacktestSimulationError(
        "UNSUPPORTED_MODE",
        `Backtest mode ${config.mode} has no implementation yet — only SINGLE_STRATEGY is supported in this block.`,
      );
    }
    if (config.strategyIds.length !== 1) {
      throw new BacktestSimulationError(
        "UNSUPPORTED_MODE",
        `SINGLE_STRATEGY mode requires exactly one strategyId, got ${config.strategyIds.length}.`,
      );
    }
    const registration = manager.getRegistration(config.strategyIds[0]);
    if (!registration) {
      throw new BacktestSimulationError("STRATEGY_ERROR", `Unknown strategy id: ${config.strategyIds[0]}`);
    }
    return registration;
  }

  return {
    id: "event-driven",

    run(config: BacktestConfig, candles: readonly Candle[]): BacktestRun {
      const registration = resolveSingleStrategyRegistration(config);
      return simulateSingleStrategy(config, candles, registration);
    },

    runWalkForward(config: BacktestConfig, splits: WalkForwardSplit[], candles: readonly Candle[]): BacktestRun[] {
      const registration = resolveSingleStrategyRegistration(config);
      return splits.map((split) => {
        const from = new Date(split.outOfSample.from).getTime();
        const to = new Date(split.outOfSample.to).getTime();
        const windowCandles = candles.filter((c) => {
          const t = new Date(c.timestamp).getTime();
          return t >= from && t <= to;
        });
        return simulateSingleStrategy(
          { ...config, dateFrom: split.outOfSample.from, dateTo: split.outOfSample.to },
          windowCandles,
          registration,
        );
      });
    },
  };
}
