import { ATR_14, EMA_20, EMA_50, EMA_200 } from "@/core/indicators";
import { clamp } from "@/core/strategy-manager/math";
import { computeRiskReward, DEFAULT_MINIMUM_RISK_REWARD } from "@/core/strategy-manager/risk-reward";
import { seriesValueAtOffset } from "@/core/strategy-manager/series-lookup";
import { buildWaitSignal } from "@/core/strategy-manager/signal-helpers";
import type { Strategy, StrategyEvaluationInput, StrategyParameters, StrategySignal } from "@/core/strategy-manager/types";

/**
 * Block 8, Forex Family B — Pullback in Trend. HYPOTHESIS: within an
 * established FX trend (EMA50 vs EMA200), a shallow pullback toward
 * EMA50 that does NOT break the larger EMA200 structure, followed by a
 * confirming re-entry bar, offers a better entry than chasing the move.
 * Independent implementation, registered for FX markets only — Block
 * 5's `trend-pullback` strategy and its own audited conclusions are
 * untouched.
 */
export interface FxPullbackTrendParameters extends StrategyParameters {
  pullbackDepthAtrMultiple: number;
  atrStopMultiplier: number;
  takeProfitRMultiple: number;
  minimumRiskReward: number;
}

export const FX_PULLBACK_TREND_DEFAULT_PARAMETERS: FxPullbackTrendParameters = {
  pullbackDepthAtrMultiple: 1.0,
  atrStopMultiplier: 1.5,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): FxPullbackTrendParameters {
  return { ...FX_PULLBACK_TREND_DEFAULT_PARAMETERS, ...parameters } as FxPullbackTrendParameters;
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];
  const priorCandle = candles.length >= 2 ? candles[candles.length - 2] : undefined;

  const ema20 = seriesValueAtOffset(EMA_20.compute(candles), 0);
  const ema50 = seriesValueAtOffset(EMA_50.compute(candles), 0);
  const ema200 = seriesValueAtOffset(EMA_200.compute(candles), 0);
  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);

  if (!ema20 || !ema50 || !ema200 || !atr || !priorCandle || atr.value <= 0) {
    return buildWaitSignal({
      strategy: fxPullbackTrendStrategy,
      input,
      explanation: "Insufficient warmed-up history for FX Pullback in Trend (needs EMA20, EMA50, EMA200 and ATR14).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const uptrend = ema50.value > ema200.value;
  const downtrend = ema50.value < ema200.value;
  const entry = lastCandle.close;
  const distanceFromEma50Atr = Math.abs(entry - ema50.value) / atr.value;
  const withinPullbackZone = distanceFromEma50Atr <= params.pullbackDepthAtrMultiple;

  const bullishReentry = lastCandle.close > priorCandle.close && lastCandle.close > ema20.value;
  const bearishReentry = lastCandle.close < priorCandle.close && lastCandle.close < ema20.value;

  let direction: 1 | -1 | 0 = 0;
  if (uptrend && withinPullbackZone && entry > ema200.value && bullishReentry) direction = 1;
  else if (downtrend && withinPullbackZone && entry < ema200.value && bearishReentry) direction = -1;

  if (direction === 0) {
    return buildWaitSignal({
      strategy: fxPullbackTrendStrategy,
      input,
      explanation: `No pullback re-entry setup: trend ${uptrend ? "up" : downtrend ? "down" : "flat"}, distance from EMA50 ${distanceFromEma50Atr.toFixed(2)} ATRs (need <= ${params.pullbackDepthAtrMultiple}), re-entry ${bullishReentry ? "bullish" : bearishReentry ? "bearish" : "none"}.`,
      rulesFailed: ["NO_PULLBACK_SETUP"],
      metadata: { ema50: ema50.value, ema200: ema200.value, distanceFromEma50Atr },
    });
  }

  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = ["TREND_STRUCTURE", "PULLBACK_DEPTH", "REENTRY_CONFIRMATION"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: fxPullbackTrendStrategy,
      input,
      explanation: `Pullback setup found but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: { candidateEntry: entry, candidateStopLoss: stopLoss, candidateTakeProfit: takeProfit, candidateRiskReward: riskReward },
    });
  }

  const depthScoreComponent = clamp((1 - distanceFromEma50Atr / params.pullbackDepthAtrMultiple) * 30, 0, 30);
  const rawScoreMagnitude = clamp(50 + depthScoreComponent, 0, 100);

  return {
    strategyId: fxPullbackTrendStrategy.id,
    strategyName: fxPullbackTrendStrategy.name,
    strategyVersion: fxPullbackTrendStrategy.version,
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
    explanation: `${direction === 1 ? "Bullish" : "Bearish"} FX pullback re-entry: EMA50/EMA200 ${direction === 1 ? "uptrend" : "downtrend"}, price pulled back to ${distanceFromEma50Atr.toFixed(2)} ATRs from EMA50, re-entry bar confirms.`,
    metadata: { ema50: ema50.value, ema200: ema200.value, distanceFromEma50Atr },
  };
}

export const fxPullbackTrendStrategy: Strategy = {
  id: "fx-pullback-trend",
  name: "FX Pullback in Trend",
  description:
    "Trades a re-entry after a shallow pullback toward EMA50 within an established FX EMA50/EMA200 trend, requiring the larger trend structure (EMA200) to stay intact and a confirming re-entry bar. Quantitative hypothesis pending Block 8 validation.",
  version: "1.0.0",
  enabled: true,
  supportedMarkets: ["FOREX_EURUSD", "FOREX_GBPUSD", "FOREX_USDJPY", "FOREX_AUDUSD"],
  supportedTimeframes: ["15m", "30m", "1h", "4h"],
  compatibleRegimes: ["STRONG_UPTREND", "UPTREND", "STRONG_DOWNTREND", "DOWNTREND"],
  defaultParameters: FX_PULLBACK_TREND_DEFAULT_PARAMETERS,
  generateSignal,
  family: "PULLBACK_TREND",
  hypothesis:
    "A shallow FX pullback that doesn't break the larger trend structure, followed by a confirming re-entry bar, offers a better entry than chasing the move.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic FX execution cost (Block 8 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 8 funnel Stage 5).",
  ],
};
