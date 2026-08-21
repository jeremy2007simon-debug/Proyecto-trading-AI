import { ADX_14, ATR_14, createRollingPercentile } from "@/core/indicators";
import { clamp } from "@/core/strategy-manager/math";
import { computeRiskReward, DEFAULT_MINIMUM_RISK_REWARD } from "@/core/strategy-manager/risk-reward";
import { seriesValueAtOffset } from "@/core/strategy-manager/series-lookup";
import { buildWaitSignal } from "@/core/strategy-manager/signal-helpers";
import type { Candle } from "@/core/market-data/types";
import type { Strategy, StrategyEvaluationInput, StrategyParameters, StrategySignal } from "@/core/strategy-manager/types";

/**
 * Block 8, Forex Family C — Volatility Breakout. HYPOTHESIS: a period of
 * range compression (low ATR percentile relative to its own recent
 * history) followed by a decisive break of the prior structure marks
 * the start of a real expansion move.
 *
 * IMPORTANT DIFFERENCE from Block 5's `volatility-compression-breakout`:
 * this FX version does NOT use volume confirmation. Our FX data source
 * (Yahoo's unofficial chart API) reports no real consolidated volume for
 * spot FX (always 0) — a volume filter would either silently disable the
 * strategy entirely or require a fabricated volume proxy, neither of
 * which is acceptable. ADX rising (confirming fresh directional
 * participation) is used as the confirmation signal instead. This is an
 * independent implementation, registered for FX markets only — Block
 * 5's strategy and its own audited conclusions are untouched.
 */
export interface FxVolatilityBreakoutParameters extends StrategyParameters {
  compressionPercentileThreshold: number;
  lookbackBars: number;
  percentileBaselineWindow: number;
  breakoutBufferAtrMultiple: number;
  /** ADX14 must be higher on the breakout bar than `adxRisingLookback` bars ago — confirms fresh directional participation (replaces volume confirmation, unavailable for this FX feed). */
  adxRisingLookback: number;
  atrStopMultiplier: number;
  takeProfitRMultiple: number;
  minimumRiskReward: number;
}

export const FX_VOLATILITY_BREAKOUT_DEFAULT_PARAMETERS: FxVolatilityBreakoutParameters = {
  compressionPercentileThreshold: 30,
  lookbackBars: 20,
  percentileBaselineWindow: 60,
  breakoutBufferAtrMultiple: 0.25,
  adxRisingLookback: 3,
  atrStopMultiplier: 1.2,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): FxVolatilityBreakoutParameters {
  return { ...FX_VOLATILITY_BREAKOUT_DEFAULT_PARAMETERS, ...parameters } as FxVolatilityBreakoutParameters;
}

function priorStructureWindow(candles: readonly Candle[], lookback: number): Candle[] {
  const end = candles.length - 1;
  const start = Math.max(0, end - lookback);
  return candles.slice(start, end);
}

const atrPercentileIndicator = createRollingPercentile(ATR_14, (v) => v.value, FX_VOLATILITY_BREAKOUT_DEFAULT_PARAMETERS.percentileBaselineWindow);

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);
  const adx = seriesValueAtOffset(ADX_14.compute(candles), 0);
  const adxPrior = seriesValueAtOffset(ADX_14.compute(candles), params.adxRisingLookback);
  const priorWindow = priorStructureWindow(candles, params.lookbackBars);
  const atrPercentilePrior = seriesValueAtOffset(atrPercentileIndicator.compute(candles), 1);

  if (!atr || !adx || !adxPrior || !atrPercentilePrior || priorWindow.length < params.lookbackBars) {
    return buildWaitSignal({
      strategy: fxVolatilityBreakoutStrategy,
      input,
      explanation: "Insufficient warmed-up history for FX Volatility Breakout (needs ATR14, its rolling percentile baseline, ADX14 and a full prior-structure lookback window).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const wasCompressed = atrPercentilePrior.percentile <= params.compressionPercentileThreshold;
  if (!wasCompressed) {
    return buildWaitSignal({
      strategy: fxVolatilityBreakoutStrategy,
      input,
      explanation: `No compression precondition: ATR14 was at the ${atrPercentilePrior.percentile.toFixed(1)}th percentile of its trailing ${params.percentileBaselineWindow}-bar range on the prior bar (need <= ${params.compressionPercentileThreshold}).`,
      rulesFailed: ["NOT_COMPRESSED"],
      metadata: { atrPercentilePrior: atrPercentilePrior.percentile },
    });
  }

  const priorHigh = Math.max(...priorWindow.map((c) => c.high));
  const priorLow = Math.min(...priorWindow.map((c) => c.low));
  const buffer = params.breakoutBufferAtrMultiple * atr.value;
  const brokeOutUp = lastCandle.close > priorHigh + buffer;
  const brokeOutDown = lastCandle.close < priorLow - buffer;
  const adxRising = adx.adx > adxPrior.adx;

  if (!brokeOutUp && !brokeOutDown) {
    return buildWaitSignal({
      strategy: fxVolatilityBreakoutStrategy,
      input,
      explanation: `Compression confirmed but no breakout yet: close ${lastCandle.close.toFixed(5)} is within the prior ${params.lookbackBars}-bar range [${priorLow.toFixed(5)}, ${priorHigh.toFixed(5)}] plus buffer.`,
      rulesFailed: ["NO_BREAKOUT_SETUP"],
      rulesTriggered: ["COMPRESSION_PRECONDITION"],
      metadata: { priorHigh, priorLow, atrPercentilePrior: atrPercentilePrior.percentile },
    });
  }

  const direction: 1 | -1 = brokeOutUp ? 1 : -1;
  const brokenLevel = brokeOutUp ? priorHigh : priorLow;

  if (!adxRising) {
    return buildWaitSignal({
      strategy: fxVolatilityBreakoutStrategy,
      input,
      explanation: `Compressed range broke out but ADX14 (${adx.adx.toFixed(1)}) is not rising vs ${params.adxRisingLookback} bars ago (${adxPrior.adx.toFixed(1)}) — likely a false start.`,
      rulesFailed: ["ADX_CONFIRMATION"],
      rulesTriggered: ["COMPRESSION_PRECONDITION", "BREAKOUT_LEVEL_CLEARED"],
      metadata: { priorHigh, priorLow, adx: adx.adx, adxPrior: adxPrior.adx },
    });
  }

  const entry = lastCandle.close;
  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = ["COMPRESSION_PRECONDITION", "BREAKOUT_LEVEL_CLEARED", "ADX_CONFIRMATION"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: fxVolatilityBreakoutStrategy,
      input,
      explanation: `Compression breakout confirmed but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: { candidateEntry: entry, candidateStopLoss: stopLoss, candidateTakeProfit: takeProfit, candidateRiskReward: riskReward },
    });
  }

  const compressionScoreComponent = clamp((params.compressionPercentileThreshold - atrPercentilePrior.percentile) * 1.5, 0, 30);
  const adxScoreComponent = clamp((adx.adx - adxPrior.adx) * 3, 0, 20);
  const rawScoreMagnitude = clamp(50 + compressionScoreComponent + adxScoreComponent, 0, 100);

  return {
    strategyId: fxVolatilityBreakoutStrategy.id,
    strategyName: fxVolatilityBreakoutStrategy.name,
    strategyVersion: fxVolatilityBreakoutStrategy.version,
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
    explanation: `${direction === 1 ? "Upside" : "Downside"} breakout of the prior ${params.lookbackBars}-bar ${direction === 1 ? "high" : "low"} (${brokenLevel.toFixed(5)}) after ATR compression (${atrPercentilePrior.percentile.toFixed(1)}th percentile), confirmed by rising ADX.`,
    metadata: { priorHigh, priorLow, adx: adx.adx, atrPercentilePrior: atrPercentilePrior.percentile },
  };
}

export const fxVolatilityBreakoutStrategy: Strategy = {
  id: "fx-volatility-breakout",
  name: "FX Volatility Breakout",
  description:
    "Trades a break of prior N-bar structure that follows a period of ATR compression, confirmed by rising ADX (volume confirmation is unavailable for this FX data source). Quantitative hypothesis pending Block 8 validation.",
  version: "1.0.0",
  enabled: true,
  supportedMarkets: ["FOREX_EURUSD", "FOREX_GBPUSD", "FOREX_USDJPY", "FOREX_AUDUSD"],
  supportedTimeframes: ["15m", "30m", "1h", "4h"],
  compatibleRegimes: ["RANGE", "BREAKOUT", "HIGH_VOLATILITY", "LOW_VOLATILITY"],
  defaultParameters: FX_VOLATILITY_BREAKOUT_DEFAULT_PARAMETERS,
  generateSignal,
  family: "VOLATILITY_BREAKOUT",
  hypothesis:
    "A break of prior structure that follows genuine FX range compression, confirmed by rising ADX, marks the start of a real expansion move rather than noise.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic FX execution cost (Block 8 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 8 funnel Stage 5).",
  ],
};
