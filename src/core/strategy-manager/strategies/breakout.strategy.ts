import { ATR_14, VOLUME_AVERAGE_20 } from "@/core/indicators";
import { clamp } from "@/core/strategy-manager/math";
import { computeRiskReward, DEFAULT_MINIMUM_RISK_REWARD } from "@/core/strategy-manager/risk-reward";
import { seriesValueAtOffset } from "@/core/strategy-manager/series-lookup";
import { buildWaitSignal } from "@/core/strategy-manager/signal-helpers";
import type { Candle } from "@/core/market-data/types";
import type {
  Strategy,
  StrategyEvaluationInput,
  StrategyParameters,
  StrategySignal,
} from "@/core/strategy-manager/types";

/**
 * Breakout — a quantitative HYPOTHESIS (price clears prior structure by
 * more than a noise buffer, confirmed by volume AND intrabar range
 * expansion), not a claim of profitability. `compatibleRegimes` below is
 * an initial guess pending backtesting validation.
 */
export interface BreakoutParameters extends StrategyParameters {
  /** Bars of PRIOR structure (excluding the current bar) used to find the breakout level. */
  lookbackBars: number;
  /** Close must clear the prior high/low by at least this many ATRs — filters noise-level "breakouts". */
  breakoutBufferAtrMultiple: number;
  /** Current volume must be at least this multiple of the 20-bar average to confirm real participation. */
  volumeMultiplier: number;
  /** ATR14 multiple used to place the stop loss. */
  atrStopMultiplier: number;
  /** Take-profit distance as a multiple of the initial risk (R). */
  takeProfitRMultiple: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
}

export const BREAKOUT_DEFAULT_PARAMETERS: BreakoutParameters = {
  lookbackBars: 20,
  breakoutBufferAtrMultiple: 0.25,
  volumeMultiplier: 1.3,
  atrStopMultiplier: 1.2,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): BreakoutParameters {
  return { ...BREAKOUT_DEFAULT_PARAMETERS, ...parameters } as BreakoutParameters;
}

/**
 * The `lookbackBars` candles strictly BEFORE the current (last) one.
 * Excluding the current bar from its own breakout level is the anti-
 * look-ahead-critical part of this strategy: a rolling high/low that
 * accidentally included the current bar would make `close > priorHigh`
 * structurally impossible (since `close <= high` always holds), silently
 * disabling the strategy — see the dedicated no-look-ahead test.
 */
function priorStructureWindow(candles: readonly Candle[], lookback: number): Candle[] {
  const end = candles.length - 1;
  const start = Math.max(0, end - lookback);
  return candles.slice(start, end);
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);
  const volumeAverage = seriesValueAtOffset(VOLUME_AVERAGE_20.compute(candles), 0);
  const priorWindow = priorStructureWindow(candles, params.lookbackBars);

  if (!atr || !volumeAverage || priorWindow.length < params.lookbackBars) {
    return buildWaitSignal({
      strategy: breakoutStrategy,
      input,
      explanation: "Insufficient warmed-up history for Breakout (needs ATR14, VolumeAverage20 and a full prior-structure lookback window).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const priorHigh = Math.max(...priorWindow.map((c) => c.high));
  const priorLow = Math.min(...priorWindow.map((c) => c.low));
  const buffer = params.breakoutBufferAtrMultiple * atr.value;

  const brokeOutUp = lastCandle.close > priorHigh + buffer;
  const brokeOutDown = lastCandle.close < priorLow - buffer;
  const volumeRatio = volumeAverage.value > 0 ? lastCandle.volume / volumeAverage.value : 1;
  const volumeConfirmed = volumeRatio >= params.volumeMultiplier;
  const barRange = lastCandle.high - lastCandle.low;
  const rangeExpansionRatio = atr.value > 0 ? barRange / atr.value : 0;
  const rangeExpanded = barRange >= atr.value;

  if (!brokeOutUp && !brokeOutDown) {
    return buildWaitSignal({
      strategy: breakoutStrategy,
      input,
      explanation: `No breakout: close ${lastCandle.close.toFixed(2)} is within the prior ${params.lookbackBars}-bar range [${priorLow.toFixed(2)}, ${priorHigh.toFixed(2)}] plus buffer.`,
      rulesFailed: ["NO_BREAKOUT_SETUP"],
      metadata: { priorHigh, priorLow, buffer },
    });
  }

  const direction: 1 | -1 = brokeOutUp ? 1 : -1;
  const brokenLevel = brokeOutUp ? priorHigh : priorLow;

  if (!volumeConfirmed) {
    return buildWaitSignal({
      strategy: breakoutStrategy,
      input,
      explanation: `Price cleared ${brokeOutUp ? "the prior high" : "the prior low"} (${brokenLevel.toFixed(2)}) but volume (${lastCandle.volume}) is below ${params.volumeMultiplier}x the 20-bar average (${volumeAverage.value.toFixed(0)}) — likely a false breakout.`,
      rulesFailed: ["VOLUME_CONFIRMATION"],
      rulesTriggered: ["BREAKOUT_LEVEL_CLEARED"],
      metadata: { priorHigh, priorLow, volumeRatio },
    });
  }

  if (!rangeExpanded) {
    return buildWaitSignal({
      strategy: breakoutStrategy,
      input,
      explanation: `Price cleared ${brokeOutUp ? "the prior high" : "the prior low"} with volume confirmation, but the bar's own range (${barRange.toFixed(2)}) has not expanded to at least ATR14 (${atr.value.toFixed(2)}).`,
      rulesFailed: ["RANGE_EXPANSION"],
      rulesTriggered: ["BREAKOUT_LEVEL_CLEARED", "VOLUME_CONFIRMATION"],
      metadata: { priorHigh, priorLow, rangeExpansionRatio },
    });
  }

  const entry = lastCandle.close;
  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);

  const rulesTriggered = ["BREAKOUT_LEVEL_CLEARED", "VOLUME_CONFIRMATION", "RANGE_EXPANSION"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: breakoutStrategy,
      input,
      explanation: `Breakout confirmed but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: {
        candidateEntry: entry,
        candidateStopLoss: stopLoss,
        candidateTakeProfit: takeProfit,
        candidateRiskReward: riskReward,
      },
    });
  }

  const volumeScoreComponent = clamp((volumeRatio - 1) * 25, 0, 25);
  const expansionScoreComponent = clamp((rangeExpansionRatio - 1) * 25, 0, 25);
  const rawScoreMagnitude = clamp(50 + volumeScoreComponent + expansionScoreComponent, 0, 100);

  return {
    strategyId: breakoutStrategy.id,
    strategyName: breakoutStrategy.name,
    strategyVersion: breakoutStrategy.version,
    signal: direction === 1 ? "BUY" : "SELL",
    timestamp: lastCandle.timestamp,
    market: input.market,
    timeframe: input.timeframe,
    marketRegime: input.marketRegime,
    price: lastCandle.close,
    entry,
    stopLoss,
    takeProfit,
    riskReward,
    rawScore: direction * rawScoreMagnitude,
    rulesTriggered,
    rulesFailed: [],
    explanation: `${direction === 1 ? "Upside" : "Downside"} breakout of the prior ${params.lookbackBars}-bar ${direction === 1 ? "high" : "low"} (${brokenLevel.toFixed(2)}), confirmed by volume (${volumeRatio.toFixed(2)}x average) and range expansion (${rangeExpansionRatio.toFixed(2)}x ATR).`,
    metadata: { priorHigh, priorLow, volumeRatio, rangeExpansionRatio },
  };
}

export const breakoutStrategy: Strategy = {
  id: "breakout",
  name: "Breakout",
  description:
    "Trades a decisive break of the prior N-bar high/low, requiring the close to clear the level by an ATR-scaled buffer plus volume and intrabar range expansion confirmation — never firing on price alone. Quantitative hypothesis pending backtesting validation.",
  version: "1.0.0",
  enabled: true,
  supportedMarkets: ["SP500"],
  supportedTimeframes: ["15m"],
  // Initial hypothesis: breakouts are most meaningful either while still
  // classified as RANGE (the setup right before a confirmed move) or once
  // the regime detector has already confirmed BREAKOUT/HIGH_VOLATILITY —
  // pending backtesting validation.
  compatibleRegimes: ["RANGE", "BREAKOUT", "HIGH_VOLATILITY"],
  defaultParameters: BREAKOUT_DEFAULT_PARAMETERS,
  generateSignal,
};
