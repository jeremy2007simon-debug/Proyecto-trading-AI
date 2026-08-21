import { ADX_14, ATR_14, EMA_50 } from "@/core/indicators";
import { clamp } from "@/core/strategy-manager/math";
import { computeRiskReward, DEFAULT_MINIMUM_RISK_REWARD } from "@/core/strategy-manager/risk-reward";
import { seriesValueAtOffset } from "@/core/strategy-manager/series-lookup";
import { buildWaitSignal } from "@/core/strategy-manager/signal-helpers";
import type { Strategy, StrategyEvaluationInput, StrategyParameters, StrategySignal } from "@/core/strategy-manager/types";

/**
 * Block 8, Forex Family A — Trend/Momentum. HYPOTHESIS: major FX pairs
 * can exhibit directional persistence during certain regimes (central
 * bank policy divergence, risk-on/risk-off flows) — when an N-bar rate
 * of change is positive, the medium-term (EMA50) trend agrees, and ADX
 * confirms the move isn't chop, the move tends to continue. Not a claim
 * of profitability — pending the Block 8 validation funnel. Deliberately
 * mirrors the SHAPE of Block 5's `momentum-trend` strategy (same
 * economic logic translates across asset classes) but is an independent
 * implementation registered only for FX markets — Block 5's strategy and
 * its own audited conclusions are untouched.
 */
export interface FxTrendMomentumParameters extends StrategyParameters {
  rocLookbackBars: number;
  emaSlopeLookback: number;
  adxTrendThreshold: number;
  atrStopMultiplier: number;
  takeProfitRMultiple: number;
  minimumRiskReward: number;
}

export const FX_TREND_MOMENTUM_DEFAULT_PARAMETERS: FxTrendMomentumParameters = {
  rocLookbackBars: 20,
  emaSlopeLookback: 5,
  adxTrendThreshold: 20,
  atrStopMultiplier: 1.5,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): FxTrendMomentumParameters {
  return { ...FX_TREND_MOMENTUM_DEFAULT_PARAMETERS, ...parameters } as FxTrendMomentumParameters;
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const rocReferenceIndex = candles.length - 1 - params.rocLookbackBars;
  const rocReferenceCandle = rocReferenceIndex >= 0 ? candles[rocReferenceIndex] : undefined;

  const ema50 = seriesValueAtOffset(EMA_50.compute(candles), 0);
  const ema50Prior = seriesValueAtOffset(EMA_50.compute(candles), params.emaSlopeLookback);
  const adx = seriesValueAtOffset(ADX_14.compute(candles), 0);
  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);

  if (!rocReferenceCandle || !ema50 || !ema50Prior || !adx || !atr || rocReferenceCandle.close <= 0) {
    return buildWaitSignal({
      strategy: fxTrendMomentumStrategy,
      input,
      explanation: "Insufficient warmed-up history for FX Trend/Momentum (needs EMA50, ADX14, ATR14 and the ROC lookback window).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const roc = (lastCandle.close - rocReferenceCandle.close) / rocReferenceCandle.close;
  const emaSlopeUp = ema50.value > ema50Prior.value;
  const emaSlopeDown = ema50.value < ema50Prior.value;
  const strongEnoughTrend = adx.adx >= params.adxTrendThreshold;

  let direction: 1 | -1 | 0 = 0;
  if (roc > 0 && emaSlopeUp && strongEnoughTrend) direction = 1;
  else if (roc < 0 && emaSlopeDown && strongEnoughTrend) direction = -1;

  if (direction === 0) {
    return buildWaitSignal({
      strategy: fxTrendMomentumStrategy,
      input,
      explanation: `No confirmed momentum: ${params.rocLookbackBars}-bar ROC ${(roc * 100).toFixed(3)}%, EMA50 slope ${emaSlopeUp ? "up" : emaSlopeDown ? "down" : "flat"}, ADX ${adx.adx.toFixed(1)} vs threshold ${params.adxTrendThreshold}.`,
      rulesFailed: ["NO_MOMENTUM_SETUP"],
      metadata: { roc, ema50: ema50.value, adx: adx.adx },
    });
  }

  const entry = lastCandle.close;
  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = ["ROC_MOMENTUM", "EMA_SLOPE_CONFIRMATION", "ADX_TREND_STRENGTH"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: fxTrendMomentumStrategy,
      input,
      explanation: `Momentum setup found but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: { candidateEntry: entry, candidateStopLoss: stopLoss, candidateTakeProfit: takeProfit, candidateRiskReward: riskReward },
    });
  }

  const rocScoreComponent = clamp(Math.abs(roc) * 100 * 15, 0, 30);
  const adxScoreComponent = clamp(((adx.adx - params.adxTrendThreshold) / (50 - params.adxTrendThreshold)) * 30, 0, 30);
  const rawScoreMagnitude = clamp(40 + rocScoreComponent + adxScoreComponent, 0, 100);

  return {
    strategyId: fxTrendMomentumStrategy.id,
    strategyName: fxTrendMomentumStrategy.name,
    strategyVersion: fxTrendMomentumStrategy.version,
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
    explanation: `${direction === 1 ? "Bullish" : "Bearish"} FX momentum: ${params.rocLookbackBars}-bar ROC ${(roc * 100).toFixed(3)}%, EMA50 sloping ${direction === 1 ? "up" : "down"}, ADX ${adx.adx.toFixed(1)} confirms.`,
    metadata: { roc, ema50: ema50.value, adx: adx.adx },
  };
}

export const fxTrendMomentumStrategy: Strategy = {
  id: "fx-trend-momentum",
  name: "FX Trend/Momentum",
  description:
    "Trades continuation of a medium-term FX move when N-bar rate of change, EMA50 slope, and ADX all agree on direction and strength. Quantitative hypothesis pending Block 8 validation.",
  version: "1.0.0",
  enabled: true,
  supportedMarkets: ["FOREX_EURUSD", "FOREX_GBPUSD", "FOREX_USDJPY", "FOREX_AUDUSD"],
  supportedTimeframes: ["15m", "30m", "1h", "4h"],
  compatibleRegimes: ["STRONG_UPTREND", "UPTREND", "STRONG_DOWNTREND", "DOWNTREND"],
  defaultParameters: FX_TREND_MOMENTUM_DEFAULT_PARAMETERS,
  generateSignal,
  family: "MOMENTUM_TREND",
  hypothesis:
    "Positive N-bar rate of change confirmed by EMA50 slope and ADX trend strength tends to continue over the following bars in major FX pairs.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic FX execution cost (Block 8 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 8 funnel Stage 5).",
  ],
};
