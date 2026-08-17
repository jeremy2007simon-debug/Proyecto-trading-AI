import { ATR_14, EMA_20, EMA_50, EMA_200 } from "@/core/indicators";
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
 * Block 5, Family B — Pullback in Trend. HYPOTHESIS: in an established
 * trend (EMA50 vs EMA200), a temporary pullback toward EMA50 that does
 * NOT break the larger EMA200 structure, followed by a confirming
 * re-entry bar (closes back above/below EMA20, in the direction of the
 * bigger trend), offers a better entry than chasing the move. Not a claim
 * of profitability — pending the Block 5 validation funnel.
 */
export interface TrendPullbackParameters extends StrategyParameters {
  /** How close (in ATRs) price must have pulled back to EMA50 to qualify — the Block 5 Stage-3 sensitivity axis (0.5/1.0/1.5). */
  pullbackDepthAtrMultiple: number;
  /** ATR14 multiple used to place the stop loss. */
  atrStopMultiplier: number;
  /** Take-profit distance as a multiple of the initial risk (R). */
  takeProfitRMultiple: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
}

export const TREND_PULLBACK_DEFAULT_PARAMETERS: TrendPullbackParameters = {
  pullbackDepthAtrMultiple: 1.0,
  atrStopMultiplier: 1.5,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): TrendPullbackParameters {
  return { ...TREND_PULLBACK_DEFAULT_PARAMETERS, ...parameters } as TrendPullbackParameters;
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
      strategy: trendPullbackStrategy,
      input,
      explanation: "Insufficient warmed-up history for Trend Pullback (needs EMA20, EMA50, EMA200 and ATR14).",
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
      strategy: trendPullbackStrategy,
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
      strategy: trendPullbackStrategy,
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
    strategyId: trendPullbackStrategy.id,
    strategyName: trendPullbackStrategy.name,
    strategyVersion: trendPullbackStrategy.version,
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
    explanation: `${direction === 1 ? "Bullish" : "Bearish"} pullback re-entry: EMA50/EMA200 ${direction === 1 ? "uptrend" : "downtrend"}, price pulled back to ${distanceFromEma50Atr.toFixed(2)} ATRs from EMA50, re-entry bar confirms.`,
    metadata: { ema50: ema50.value, ema200: ema200.value, distanceFromEma50Atr },
  };
}

export const trendPullbackStrategy: Strategy = {
  id: "trend-pullback",
  name: "Trend Pullback",
  description:
    "Trades a re-entry after a shallow pullback toward EMA50 within an established EMA50/EMA200 trend, requiring the larger trend structure (EMA200) to stay intact and a confirming re-entry bar back above/below EMA20. Quantitative hypothesis pending Block 5 validation.",
  version: "1.0.0",
  enabled: true,
  // Widened for Block 5 Stage 7 (cross-asset testing) — same
  // capability-declaration-only rationale established in Block 4.5 for
  // MR/ORB. None of the three added markets are in ACTIVE_MARKETS, so
  // the live dashboard is unaffected. generateSignal is unchanged.
  supportedMarkets: ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"],
  supportedTimeframes: ["1h"],
  compatibleRegimes: ["STRONG_UPTREND", "UPTREND", "STRONG_DOWNTREND", "DOWNTREND"],
  defaultParameters: TREND_PULLBACK_DEFAULT_PARAMETERS,
  generateSignal,
  family: "PULLBACK_TREND",
  hypothesis:
    "A shallow pullback that doesn't break the larger trend structure, followed by a confirming re-entry bar, offers a better entry than chasing the move.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic execution cost (Block 5 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 5 funnel Stage 5).",
  ],
};
