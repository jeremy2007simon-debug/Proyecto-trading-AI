import { ATR_14, EMA_20, RSI_14 } from "@/core/indicators";
import { clamp } from "@/core/strategy-manager/math";
import { computeRiskReward, DEFAULT_MINIMUM_RISK_REWARD } from "@/core/strategy-manager/risk-reward";
import { seriesValueAtOffset } from "@/core/strategy-manager/series-lookup";
import { buildWaitSignal } from "@/core/strategy-manager/signal-helpers";
import type { Strategy, StrategyEvaluationInput, StrategyParameters, StrategySignal } from "@/core/strategy-manager/types";

/**
 * Block 8, Forex Family E — Controlled Mean Reversion. HYPOTHESIS: when
 * price has stretched an unusually large distance (in ATRs) from a
 * short EMA AND RSI14 confirms an extreme, in a RANGE/LOW_VOLATILITY
 * regime, FX pairs often revert back toward that EMA rather than
 * continuing to extend. This is an INDEPENDENT hypothesis, NOT a reuse
 * of the mean-reversion strategy already rejected for SPY (Block 4/4.5)
 * — different market, different logic, its own funnel run from
 * scratch. Risk is STRICTLY bounded per point 8 of the Block 8 brief:
 * a single fixed-size entry with a hard ATR stop, take-profit capped at
 * the EMA target — never martingale, never grid, never averaging down,
 * never a widened stop after entry.
 */
export interface FxMeanReversionParameters extends StrategyParameters {
  /** Price must be at least this many ATRs from EMA20 to qualify — the Block 8 sensitivity axis. */
  zScoreEntryThreshold: number;
  rsiOverboughtThreshold: number;
  rsiOversoldThreshold: number;
  atrStopMultiplier: number;
  /** Take-profit distance as a multiple of the initial risk (R), capped to never exceed the distance back to EMA20 (see `generateSignal`) — reversion trades don't reward chasing further than the mean itself. */
  takeProfitRMultiple: number;
  minimumRiskReward: number;
}

export const FX_MEAN_REVERSION_DEFAULT_PARAMETERS: FxMeanReversionParameters = {
  zScoreEntryThreshold: 2.0,
  rsiOverboughtThreshold: 70,
  rsiOversoldThreshold: 30,
  atrStopMultiplier: 1.0,
  takeProfitRMultiple: 1.5,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): FxMeanReversionParameters {
  return { ...FX_MEAN_REVERSION_DEFAULT_PARAMETERS, ...parameters } as FxMeanReversionParameters;
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const ema20 = seriesValueAtOffset(EMA_20.compute(candles), 0);
  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);
  const rsi = seriesValueAtOffset(RSI_14.compute(candles), 0);

  if (!ema20 || !atr || !rsi || atr.value <= 0) {
    return buildWaitSignal({
      strategy: fxMeanReversionStrategy,
      input,
      explanation: "Insufficient warmed-up history for FX Controlled Mean Reversion (needs EMA20, ATR14 and RSI14).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const entry = lastCandle.close;
  const distanceAtr = (entry - ema20.value) / atr.value; // signed: positive = stretched above EMA, negative = stretched below
  const stretchedAboveMean = distanceAtr >= params.zScoreEntryThreshold;
  const stretchedBelowMean = distanceAtr <= -params.zScoreEntryThreshold;

  let direction: 1 | -1 | 0 = 0;
  // Stretched ABOVE mean + RSI overbought -> expect reversion DOWN (SELL).
  if (stretchedAboveMean && rsi.value >= params.rsiOverboughtThreshold) direction = -1;
  // Stretched BELOW mean + RSI oversold -> expect reversion UP (BUY).
  else if (stretchedBelowMean && rsi.value <= params.rsiOversoldThreshold) direction = 1;

  if (direction === 0) {
    return buildWaitSignal({
      strategy: fxMeanReversionStrategy,
      input,
      explanation: `No mean-reversion setup: price is ${distanceAtr.toFixed(2)} ATRs from EMA20 (need >= ${params.zScoreEntryThreshold} in magnitude), RSI14 ${rsi.value.toFixed(1)}.`,
      rulesFailed: ["NO_STRETCH_SETUP"],
      metadata: { distanceAtr, ema20: ema20.value, rsi: rsi.value },
    });
  }

  // Hard ATR stop, single fixed-size entry — never widened, never
  // averaged, never a grid. Take-profit targets back toward EMA20, but
  // never further than the standard R-multiple target, whichever is
  // closer — a reversion trade should not reward overshooting the mean.
  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const rMultipleTarget = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const takeProfit =
    direction === 1 ? Math.min(rMultipleTarget, ema20.value) : Math.max(rMultipleTarget, ema20.value);
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = ["MEAN_REVERSION_STRETCH", "RSI_EXTREME_CONFIRMATION"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: fxMeanReversionStrategy,
      input,
      explanation: `Mean-reversion setup found but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: { candidateEntry: entry, candidateStopLoss: stopLoss, candidateTakeProfit: takeProfit, candidateRiskReward: riskReward },
    });
  }

  const stretchScoreComponent = clamp((Math.abs(distanceAtr) - params.zScoreEntryThreshold) * 15, 0, 30);
  const rsiExtremeComponent = direction === 1
    ? clamp((params.rsiOversoldThreshold - rsi.value) * 1.5, 0, 20)
    : clamp((rsi.value - params.rsiOverboughtThreshold) * 1.5, 0, 20);
  const rawScoreMagnitude = clamp(50 + stretchScoreComponent + rsiExtremeComponent, 0, 100);

  return {
    strategyId: fxMeanReversionStrategy.id,
    strategyName: fxMeanReversionStrategy.name,
    strategyVersion: fxMeanReversionStrategy.version,
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
    explanation: `Price stretched ${distanceAtr.toFixed(2)} ATRs ${direction === 1 ? "below" : "above"} EMA20, RSI14 ${rsi.value.toFixed(1)} confirms extreme — reverting toward the mean.`,
    metadata: { distanceAtr, ema20: ema20.value, rsi: rsi.value },
  };
}

export const fxMeanReversionStrategy: Strategy = {
  id: "fx-mean-reversion",
  name: "FX Controlled Mean Reversion",
  description:
    "Trades a reversion toward EMA20 when price has stretched an unusual distance (in ATRs) from it, confirmed by an RSI14 extreme, only in RANGE/LOW_VOLATILITY regimes. Single fixed-size entry, hard ATR stop, take-profit capped at the mean — never martingale, never grid, never averaging down. Independent hypothesis from the mean-reversion strategy already rejected for SPY. Quantitative hypothesis pending Block 8 validation.",
  version: "1.0.0",
  enabled: true,
  supportedMarkets: ["FOREX_EURUSD", "FOREX_GBPUSD", "FOREX_USDJPY", "FOREX_AUDUSD"],
  supportedTimeframes: ["15m", "30m", "1h", "4h"],
  compatibleRegimes: ["RANGE", "LOW_VOLATILITY"],
  defaultParameters: FX_MEAN_REVERSION_DEFAULT_PARAMETERS,
  generateSignal,
  family: "MEAN_REVERSION",
  hypothesis:
    "In a RANGE/LOW_VOLATILITY regime, an FX pair stretched an unusual ATR-normalized distance from a short EMA, with RSI14 confirming an extreme, tends to revert toward that EMA.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic FX execution cost (Block 8 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 8 funnel Stage 5).",
  ],
};
