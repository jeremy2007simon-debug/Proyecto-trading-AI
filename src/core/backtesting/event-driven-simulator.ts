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
  DEFAULT_EXECUTION_MODE,
  DEFAULT_LIMIT_ORDER_TIMEOUT_BARS,
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

/** See the usage site (Block 4.5 performance fix) for the full rationale. */
const STRATEGY_LOOKBACK_BARS = 1000;

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

/** Breakdown of a cost-adjusted fill — always kept separate so callers can tell slippage and spread apart (Block 4.5, Phase 1/3) instead of only ever seeing their combined effect on price. */
interface CostAdjustedFill {
  price: number;
  /** $ total for this fill (already multiplied by quantity), pure slippage component. */
  slippageAmount: number;
  /** $ total for this fill (already multiplied by quantity), pure half-spread component. */
  spreadAmount: number;
}

/**
 * Adverse fill adjustment for an ENTRY: a BUY entry pays more (price
 * moves up against you), a SELL entry (opening short) receives less
 * (price moves down against you).
 */
function applyEntryCost(
  price: number,
  direction: "BUY" | "SELL",
  quantity: number,
  costs: ExecutionCostConfig,
): CostAdjustedFill {
  const adverseSign = direction === "BUY" ? 1 : -1;
  const slippagePerUnit = price * costs.slippagePct;
  const spreadPerUnit = costs.halfSpread;
  return {
    price: price + adverseSign * (slippagePerUnit + spreadPerUnit),
    slippageAmount: slippagePerUnit * quantity,
    spreadAmount: spreadPerUnit * quantity,
  };
}

/**
 * Adverse fill adjustment for a market-order-style EXIT (STOP_LOSS or
 * TIME_EXIT): closing a BUY means selling (receive less), closing a
 * SELL means buying back (pay more). TAKE_PROFIT exits do NOT use this
 * — they're treated as a resting limit order filling exactly at its
 * price (see `ExecutionCostConfig` docs).
 */
function applyMarketExitCost(
  price: number,
  direction: "BUY" | "SELL",
  quantity: number,
  costs: ExecutionCostConfig,
): CostAdjustedFill {
  const adverseSign = direction === "BUY" ? -1 : 1;
  const slippagePerUnit = price * costs.slippagePct;
  const spreadPerUnit = costs.halfSpread;
  return {
    price: price + adverseSign * (slippagePerUnit + spreadPerUnit),
    slippageAmount: slippagePerUnit * quantity,
    spreadAmount: spreadPerUnit * quantity,
  };
}

const NO_FILL_COST: Pick<CostAdjustedFill, "slippageAmount" | "spreadAmount"> = { slippageAmount: 0, spreadAmount: 0 };

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
  entrySlippageAmount: number;
  entrySpreadAmount: number;
}

/**
 * A signal that became a resting LIMIT order instead of an immediate
 * fill (`config.executionMode === "LIMIT"`). Lives independently of
 * `OpenPosition` — at most one of the two exists at a time, mirroring
 * "only one position at a time" for the pre-fill state. Checked against
 * candles strictly AFTER `placedAtIndex` only, so a fill decision never
 * uses the signal candle's own future-relative-to-itself data — see
 * the fill-checking loop in `simulateSingleStrategy` for the guarantee.
 */
interface PendingLimitOrder {
  direction: "BUY" | "SELL";
  limitPrice: number;
  stopLoss: number;
  takeProfit?: number;
  placedAtIndex: number;
  strategyId: string;
  strategyVersion: string;
  marketRegimeAtEntry: MarketRegime;
  indicatorsAtEntry: IndicatorSnapshot;
  rulesTriggered: string[];
  riskAmount: number;
  positionSize: number;
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
  const exitFill: CostAdjustedFill = isMarketStyleExit
    ? applyMarketExitCost(rawExitPrice, position.direction, position.positionSize, costs)
    : { price: rawExitPrice, ...NO_FILL_COST };
  const commissionPaid = costs.commissionPerFill * 2; // entry + exit, each a separate fill
  const directionSign = position.direction === "BUY" ? 1 : -1;

  // Algebraic invariant (see docs/BLOCK4_5_STRATEGY_RESEARCH_REPORT.md §1):
  // grossPnlAmount - (commission + all four cost components) === pnlAmount,
  // exactly, since pnlAmount is derived from cost-adjusted prices and
  // grossPnlAmount from raw ones using the same directionSign.
  const grossPnlAmount = (rawExitPrice - position.rawEntryPrice) * position.positionSize * directionSign;
  const pnlAmount = (exitFill.price - position.entryPrice) * position.positionSize * directionSign - commissionPaid;
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
    exitPrice: exitFill.price,
    entryAt: position.entryAt,
    exitAt,
    exitReason,
    ambiguousIntrabarExit: ambiguous,
    positionSize: position.positionSize,
    riskAmount: position.riskAmount,
    grossPnlAmount,
    pnlAmount,
    pnlR,
    commissionPaid,
    slippagePaid:
      position.entrySlippageAmount + position.entrySpreadAmount + exitFill.slippageAmount + exitFill.spreadAmount,
    entrySlippageAmount: position.entrySlippageAmount,
    entrySpreadAmount: position.entrySpreadAmount,
    exitSlippageAmount: exitFill.slippageAmount,
    exitSpreadAmount: exitFill.spreadAmount,
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
  let pendingLimitOrder: PendingLimitOrder | undefined;
  let noFillCount = 0;
  let equity = config.initialCapital;
  let dayState: DayState = createDayState("");
  let dayStartEquity = equity;
  const executionMode = config.executionMode ?? DEFAULT_EXECUTION_MODE;
  const limitOrderTimeoutBars = config.limitOrderTimeoutBars ?? DEFAULT_LIMIT_ORDER_TIMEOUT_BARS;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const dateKey = eastDateKey(new Date(candle.timestamp));
    if (dateKey !== dayState.dateKey) {
      dayState = createDayState(dateKey);
      dayStartEquity = equity;
    }

    // A pending LIMIT order is checked strictly on candles AFTER the one
    // that placed it (`i > pendingLimitOrder.placedAtIndex` is always
    // true here, since it's only ever set at the END of the iteration
    // that created it — see below) — the fill decision never looks at
    // the signal candle's own high/low, which is what makes this
    // no-look-ahead in the same sense as `resolveIntrabarExit`.
    if (pendingLimitOrder) {
      const filled =
        pendingLimitOrder.direction === "BUY"
          ? candle.low <= pendingLimitOrder.limitPrice
          : candle.high >= pendingLimitOrder.limitPrice;

      if (filled) {
        openPosition = {
          direction: pendingLimitOrder.direction,
          entryPrice: pendingLimitOrder.limitPrice,
          rawEntryPrice: pendingLimitOrder.limitPrice,
          stopLoss: pendingLimitOrder.stopLoss,
          takeProfit: pendingLimitOrder.takeProfit,
          entryAt: candle.timestamp,
          positionSize: pendingLimitOrder.positionSize,
          riskAmount: pendingLimitOrder.riskAmount,
          strategyId: pendingLimitOrder.strategyId,
          strategyVersion: pendingLimitOrder.strategyVersion,
          marketRegimeAtEntry: pendingLimitOrder.marketRegimeAtEntry,
          indicatorsAtEntry: pendingLimitOrder.indicatorsAtEntry,
          rulesTriggered: pendingLimitOrder.rulesTriggered,
          // A resting limit order that fills pays neither slippage nor
          // spread — it fills exactly at the price it was resting at.
          entrySlippageAmount: 0,
          entrySpreadAmount: 0,
        };
        dayState.tradesOpened += 1;
        pendingLimitOrder = undefined;
      } else if (i - pendingLimitOrder.placedAtIndex >= limitOrderTimeoutBars) {
        noFillCount += 1;
        pendingLimitOrder = undefined;
      }
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

    if (!openPosition && !pendingLimitOrder) {
      const gate = evaluateDailyRiskGate(dayState, DEFAULT_RISK_RULES);
      if (gate.allowed) {
        // Bounded, not `candles.slice(0, i + 1)`: a strategy's own
        // `generateSignal` recomputes its indicators from scratch on
        // whatever window it's given (unlike the regime/indicator-series
        // precompute above, which is already a single O(n) pass) — an
        // ever-growing window makes the whole simulation O(n²) in candle
        // count, which is intractable for the multi-year, sub-5m-timeframe
        // datasets Block 4.5 requires (confirmed empirically: a single
        // 2-year 15m run took on the order of 20-30 minutes before this
        // fix). `STRATEGY_LOOKBACK_BARS` is generous relative to every
        // indicator MR/ORB actually use (EMA20/ATR14/RSI14 converge
        // within ~100-200 bars; VWAP and the opening-range window are
        // session-anchored and only need the CURRENT session's bars,
        // which — since this window only ever looks backward from "now"
        // — are always among the most recent entries regardless of
        // calendar gaps/weekends). Existing tests (all well under 1000
        // candles) are completely unaffected — this slice is a no-op
        // until a dataset exceeds the bound.
        const candlesSoFar = candles.slice(Math.max(0, i + 1 - STRATEGY_LOOKBACK_BARS), i + 1);
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
            if (executionMode === "MARKET") {
              const entryFill = applyEntryCost(signal.entry, signal.signal, sizing.positionSize, config.costs);
              openPosition = {
                direction: signal.signal,
                entryPrice: entryFill.price,
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
                entrySlippageAmount: entryFill.slippageAmount,
                entrySpreadAmount: entryFill.spreadAmount,
              };
              dayState.tradesOpened += 1;
            } else {
              // LIMIT: rest an order at the signal's own price instead of
              // filling immediately — it may go unfilled (see the
              // fill-check block at the top of this loop).
              pendingLimitOrder = {
                direction: signal.signal,
                limitPrice: signal.entry,
                stopLoss: signal.stopLoss,
                takeProfit: signal.takeProfit,
                placedAtIndex: i,
                strategyId: strategy.id,
                strategyVersion: strategy.version,
                marketRegimeAtEntry: regime,
                indicatorsAtEntry: indicators,
                rulesTriggered: signal.rulesTriggered,
                riskAmount: sizing.riskAmount,
                positionSize: sizing.positionSize,
              };
            }
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
  // A LIMIT order still resting when the dataset ends never got the
  // chance to time out naturally — it's cancelled the same way, never
  // silently dropped from `noFillCount`.
  if (pendingLimitOrder) {
    noFillCount += 1;
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
    noFillCount,
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
