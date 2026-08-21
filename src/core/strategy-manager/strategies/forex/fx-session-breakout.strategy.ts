import { ATR_14 } from "@/core/indicators";
import { FX_SESSION_WINDOWS_UTC } from "@/core/market-hours/forex-calendar";
import { clamp } from "@/core/strategy-manager/math";
import { computeRiskReward, DEFAULT_MINIMUM_RISK_REWARD } from "@/core/strategy-manager/risk-reward";
import { seriesValueAtOffset } from "@/core/strategy-manager/series-lookup";
import { buildWaitSignal } from "@/core/strategy-manager/signal-helpers";
import type { Candle } from "@/core/market-data/types";
import type { Strategy, StrategyEvaluationInput, StrategyParameters, StrategySignal } from "@/core/strategy-manager/types";

/**
 * Block 8, Forex Family D — Session Breakout. HYPOTHESIS: the London
 * open, the New York open, and the London/New York overlap each bring a
 * liquidity injection that can resolve the prior (quieter) session's
 * range decisively — a break of that prior range shortly after one of
 * these session opens captures the session's real directional move.
 * Same "first breakout bar only" convention as the legacy Opening Range
 * Breakout strategy, but anchored to an FX session window (see
 * `FX_SESSION_WINDOWS_UTC`, `market-hours/forex-calendar.ts`) instead of
 * a single exchange's regular-hours open. Independent implementation —
 * no existing strategy in this codebase covers FX session structure.
 */
export type FxSessionTarget = "LONDON" | "NEW_YORK" | "LONDON_NEW_YORK_OVERLAP";

export interface FxSessionBreakoutParameters extends StrategyParameters {
  /** Which session window's open to trade the breakout of (see FX_SESSION_WINDOWS_UTC). */
  targetSession: FxSessionTarget;
  /** How many hours immediately before the session's start define the reference range to break out of. */
  referenceRangeHours: number;
  atrBufferMultiple: number;
  atrStopMultiplier: number;
  takeProfitRMultiple: number;
  minimumRiskReward: number;
}

export const FX_SESSION_BREAKOUT_DEFAULT_PARAMETERS: FxSessionBreakoutParameters = {
  targetSession: "LONDON",
  referenceRangeHours: 7,
  atrBufferMultiple: 0.2,
  atrStopMultiplier: 1.2,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): FxSessionBreakoutParameters {
  return { ...FX_SESSION_BREAKOUT_DEFAULT_PARAMETERS, ...parameters } as FxSessionBreakoutParameters;
}

function sessionWindow(target: FxSessionTarget) {
  if (target === "LONDON") return FX_SESSION_WINDOWS_UTC.LONDON;
  if (target === "NEW_YORK") return FX_SESSION_WINDOWS_UTC.NEW_YORK;
  return FX_SESSION_WINDOWS_UTC.LONDON_NEW_YORK_OVERLAP;
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];
  const priorCandle = candles.length >= 2 ? candles[candles.length - 2] : undefined;
  const window = sessionWindow(params.targetSession);

  const lastInstant = new Date(lastCandle.timestamp);
  const sessionStartUTC = new Date(
    Date.UTC(lastInstant.getUTCFullYear(), lastInstant.getUTCMonth(), lastInstant.getUTCDate(), window.startHour),
  );
  const sessionEndUTC = new Date(
    Date.UTC(lastInstant.getUTCFullYear(), lastInstant.getUTCMonth(), lastInstant.getUTCDate(), window.endHour),
  );
  const referenceStartUTC = new Date(sessionStartUTC.getTime() - params.referenceRangeHours * 3_600_000);

  if (lastInstant < sessionStartUTC || lastInstant >= sessionEndUTC) {
    return buildWaitSignal({
      strategy: fxSessionBreakoutStrategy,
      input,
      explanation: `Outside the ${params.targetSession} session window (${window.startHour}:00-${window.endHour}:00 UTC) — never signaling outside it.`,
      rulesFailed: ["OUTSIDE_SESSION_WINDOW"],
      metadata: { sessionStartUTC: sessionStartUTC.toISOString(), sessionEndUTC: sessionEndUTC.toISOString() },
    });
  }

  const referenceCandles = candles.filter((c: Candle) => {
    const t = new Date(c.timestamp).getTime();
    return t >= referenceStartUTC.getTime() && t < sessionStartUTC.getTime();
  });

  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);
  if (!atr || !priorCandle || referenceCandles.length === 0) {
    return buildWaitSignal({
      strategy: fxSessionBreakoutStrategy,
      input,
      explanation: "Insufficient warmed-up history for FX Session Breakout (needs ATR14 and a full reference-range window).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const referenceHigh = Math.max(...referenceCandles.map((c) => c.high));
  const referenceLow = Math.min(...referenceCandles.map((c) => c.low));
  const buffer = params.atrBufferMultiple * atr.value;

  const isFirstUpBreak = lastCandle.close > referenceHigh + buffer && priorCandle.close <= referenceHigh + buffer;
  const isFirstDownBreak = lastCandle.close < referenceLow - buffer && priorCandle.close >= referenceLow - buffer;

  if (!isFirstUpBreak && !isFirstDownBreak) {
    return buildWaitSignal({
      strategy: fxSessionBreakoutStrategy,
      input,
      explanation: `No fresh ${params.targetSession} session breakout: close ${lastCandle.close.toFixed(5)} relative to reference range [${referenceLow.toFixed(5)}, ${referenceHigh.toFixed(5)}].`,
      rulesFailed: ["NO_BREAKOUT_SETUP"],
      metadata: { referenceHigh, referenceLow },
    });
  }

  const direction: 1 | -1 = isFirstUpBreak ? 1 : -1;
  const brokenLevel = direction === 1 ? referenceHigh : referenceLow;

  const entry = lastCandle.close;
  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = [`${params.targetSession}_SESSION_BREAKOUT`];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: fxSessionBreakoutStrategy,
      input,
      explanation: `Session breakout confirmed but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: { candidateEntry: entry, candidateStopLoss: stopLoss, candidateTakeProfit: takeProfit, candidateRiskReward: riskReward },
    });
  }

  const breakStrengthAtr = atr.value > 0 ? Math.abs(entry - brokenLevel) / atr.value : 0;
  const rawScoreMagnitude = clamp(50 + breakStrengthAtr * 20, 0, 100);

  return {
    strategyId: fxSessionBreakoutStrategy.id,
    strategyName: fxSessionBreakoutStrategy.name,
    strategyVersion: fxSessionBreakoutStrategy.version,
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
    explanation: `${direction === 1 ? "Upside" : "Downside"} break of the pre-${params.targetSession} reference range ${direction === 1 ? "high" : "low"} (${brokenLevel.toFixed(5)}) during the ${params.targetSession} window.`,
    metadata: { referenceHigh, referenceLow },
  };
}

export const fxSessionBreakoutStrategy: Strategy = {
  id: "fx-session-breakout",
  name: "FX Session Breakout",
  description:
    "Trades the first decisive break of the reference range immediately preceding a target FX session window (London open, New York open, or their overlap), never signaling outside that window. Quantitative hypothesis pending Block 8 validation.",
  version: "1.0.0",
  enabled: true,
  supportedMarkets: ["FOREX_EURUSD", "FOREX_GBPUSD", "FOREX_USDJPY", "FOREX_AUDUSD"],
  supportedTimeframes: ["15m", "30m", "1h"],
  compatibleRegimes: ["BREAKOUT", "UPTREND", "STRONG_UPTREND", "DOWNTREND", "STRONG_DOWNTREND", "HIGH_VOLATILITY", "RANGE"],
  defaultParameters: FX_SESSION_BREAKOUT_DEFAULT_PARAMETERS,
  generateSignal,
  family: "SESSION_BREAKOUT",
  hypothesis:
    "The liquidity injection at a major FX session open (London, New York, or their overlap) resolves the prior session's range and marks the start of the day's real directional move.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic FX execution cost (Block 8 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 8 funnel Stage 5).",
  ],
};
