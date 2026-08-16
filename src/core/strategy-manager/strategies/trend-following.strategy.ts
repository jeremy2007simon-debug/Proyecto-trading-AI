import { ADX_14, ATR_14, EMA_20, EMA_50, EMA_200, VOLUME_AVERAGE_20 } from "@/core/indicators";
import { clamp } from "@/core/strategy-manager/math";
import { computeRiskReward, DEFAULT_MINIMUM_RISK_REWARD } from "@/core/strategy-manager/risk-reward";
import { seriesValueAtOffset } from "@/core/strategy-manager/series-lookup";
import { buildWaitSignal } from "@/core/strategy-manager/signal-helpers";
import type {
  Strategy,
  StrategyEvaluationInput,
  StrategyParameters,
  StrategySignal,
} from "@/core/strategy-manager/types";

/**
 * Trend Following — a quantitative HYPOTHESIS (EMA stack alignment +
 * ADX strength + simple price-structure confirmation + volume
 * confirmation), not a claim of profitability. `compatibleRegimes`
 * below is an initial guess pending backtesting validation.
 */
export interface TrendFollowingParameters extends StrategyParameters {
  /** Minimum ADX14 required to treat the move as a real trend, not chop. */
  adxTrendThreshold: number;
  /** Bars back to compare EMA20 against, to confirm it's still sloping in the trend direction. */
  emaSlopeLookback: number;
  /** Bars back to compare close against, as a simple bullish/bearish structure proxy. */
  structureLookback: number;
  /** ATR14 multiple used to place the stop loss. */
  atrStopMultiplier: number;
  /** Take-profit distance as a multiple of the initial risk (R). */
  takeProfitRMultiple: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
  /** Current volume must be at least this fraction of the 20-bar average to confirm the move. */
  minimumVolumeRatio: number;
}

export const TREND_FOLLOWING_DEFAULT_PARAMETERS: TrendFollowingParameters = {
  adxTrendThreshold: 20,
  emaSlopeLookback: 5,
  structureLookback: 10,
  atrStopMultiplier: 1.5,
  takeProfitRMultiple: 2.5,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
  minimumVolumeRatio: 0.5,
};

function resolveParameters(parameters: StrategyParameters): TrendFollowingParameters {
  return { ...TREND_FOLLOWING_DEFAULT_PARAMETERS, ...parameters } as TrendFollowingParameters;
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const ema20 = seriesValueAtOffset(EMA_20.compute(candles), 0);
  const ema50 = seriesValueAtOffset(EMA_50.compute(candles), 0);
  const ema200 = seriesValueAtOffset(EMA_200.compute(candles), 0);
  const ema20Prior = seriesValueAtOffset(EMA_20.compute(candles), params.emaSlopeLookback);
  const adx = seriesValueAtOffset(ADX_14.compute(candles), 0);
  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);
  const volumeAverage = seriesValueAtOffset(VOLUME_AVERAGE_20.compute(candles), 0);
  const structureCandle =
    candles.length > params.structureLookback
      ? candles[candles.length - 1 - params.structureLookback]
      : undefined;

  if (!ema20 || !ema50 || !ema200 || !ema20Prior || !adx || !atr || !volumeAverage || !structureCandle) {
    return buildWaitSignal({
      strategy: trendFollowingStrategy,
      input,
      explanation:
        "Insufficient warmed-up history for Trend Following (needs EMA200, ADX14, ATR14 and the structure lookback).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const bullishAlignment = ema20.value > ema50.value && ema50.value > ema200.value;
  const bearishAlignment = ema20.value < ema50.value && ema50.value < ema200.value;
  const emaSlopeUp = ema20.value > ema20Prior.value;
  const emaSlopeDown = ema20.value < ema20Prior.value;
  const strongEnoughTrend = adx.adx >= params.adxTrendThreshold;
  const bullishStructure = lastCandle.close > structureCandle.close;
  const bearishStructure = lastCandle.close < structureCandle.close;
  const volumeRatio = volumeAverage.value > 0 ? lastCandle.volume / volumeAverage.value : 1;
  const volumeOk = volumeRatio >= params.minimumVolumeRatio;

  let direction: 1 | -1 | 0 = 0;
  if (bullishAlignment && emaSlopeUp && strongEnoughTrend && bullishStructure) direction = 1;
  else if (bearishAlignment && emaSlopeDown && strongEnoughTrend && bearishStructure) direction = -1;

  if (direction === 0) {
    return buildWaitSignal({
      strategy: trendFollowingStrategy,
      input,
      explanation:
        "No aligned EMA20/EMA50/EMA200 trend with sufficient ADX and confirming price structure.",
      rulesFailed: ["NO_TREND_SETUP"],
      metadata: { ema20: ema20.value, ema50: ema50.value, ema200: ema200.value, adx: adx.adx },
    });
  }

  if (!volumeOk) {
    return buildWaitSignal({
      strategy: trendFollowingStrategy,
      input,
      explanation: `Trend structure present but volume (${lastCandle.volume}) is below ${params.minimumVolumeRatio}x the 20-bar average (${volumeAverage.value.toFixed(0)}), too weak to confirm.`,
      rulesFailed: ["VOLUME_CONFIRMATION"],
      rulesTriggered: ["EMA_ALIGNMENT", "EMA_SLOPE", "ADX_TREND_STRENGTH", "STRUCTURE_CONFIRMATION"],
      metadata: { volumeRatio },
    });
  }

  const entry = lastCandle.close;
  const stopLoss =
    direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit =
    direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);

  const rulesTriggered = [
    "EMA_ALIGNMENT",
    "EMA_SLOPE",
    "ADX_TREND_STRENGTH",
    "STRUCTURE_CONFIRMATION",
    "VOLUME_CONFIRMATION",
  ];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: trendFollowingStrategy,
      input,
      explanation: `Trend setup confirmed but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
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

  const adxScoreComponent = clamp(
    ((adx.adx - params.adxTrendThreshold) / (50 - params.adxTrendThreshold)) * 30,
    0,
    30,
  );
  const volumeScoreComponent = clamp((volumeRatio - params.minimumVolumeRatio) * 10, 0, 10);
  const rawScoreMagnitude = clamp(40 + adxScoreComponent + 20 + volumeScoreComponent, 0, 100);

  return {
    strategyId: trendFollowingStrategy.id,
    strategyName: trendFollowingStrategy.name,
    strategyVersion: trendFollowingStrategy.version,
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
    explanation: `${direction === 1 ? "Bullish" : "Bearish"} trend confirmed: EMA20/50/200 aligned and sloping, ADX ${adx.adx.toFixed(1)} >= ${params.adxTrendThreshold}, structure and volume confirm continuation.`,
    metadata: { ema20: ema20.value, ema50: ema50.value, ema200: ema200.value, adx: adx.adx, volumeRatio },
  };
}

export const trendFollowingStrategy: Strategy = {
  id: "trend-following",
  name: "Trend Following",
  description:
    "Follows an established trend when EMA20/EMA50/EMA200 are aligned and sloping in the same direction, ADX confirms trend strength, recent price structure agrees, and volume confirms the move. Quantitative hypothesis pending backtesting validation.",
  version: "1.0.0",
  enabled: true,
  supportedMarkets: ["SP500"],
  supportedTimeframes: ["15m"],
  // Initial hypothesis: this strategy should only run while a directional
  // trend regime is already established — pending backtesting validation.
  compatibleRegimes: ["STRONG_UPTREND", "UPTREND", "STRONG_DOWNTREND", "DOWNTREND"],
  defaultParameters: TREND_FOLLOWING_DEFAULT_PARAMETERS,
  generateSignal,
};
