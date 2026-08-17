import { ATR_14, RSI_14 } from "@/core/indicators";
import { getEasternWallClockParts } from "@/core/market-hours/nyse-calendar";
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

/** 09:30 ET in minutes since midnight — regular session open. */
const REGULAR_START_MIN = 9 * 60 + 30;
/** 16:00 ET in minutes since midnight — regular session close. */
const REGULAR_END_MIN = 16 * 60;

/**
 * Block 5, Family E — Intraday Seasonality. HYPOTHESIS: short-term
 * momentum in the final minutes of the regular session (institutional
 * rebalancing / closing-auction flows) tends to continue through the
 * close, more reliably than momentum measured at an arbitrary time of
 * day. Deliberately gated by a SINGLE time-of-day window (not many
 * hourly buckets) to avoid turning every minute into a parameter. Not a
 * claim of profitability — pending the Block 5 validation funnel.
 */
export interface SessionMomentumParameters extends StrategyParameters {
  /** Minutes before the 16:00 ET close that count as the "closing window" — the Block 5 Stage-3 sensitivity axis (30/45/60). */
  closingWindowMinutes: number;
  /** Bars back used to measure momentum within the window. Fixed, not swept. */
  momentumLookbackBars: number;
  /** ATR14 multiple used to place the stop loss. */
  atrStopMultiplier: number;
  /** Take-profit distance as a multiple of the initial risk (R). */
  takeProfitRMultiple: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
}

export const SESSION_MOMENTUM_DEFAULT_PARAMETERS: SessionMomentumParameters = {
  closingWindowMinutes: 60,
  momentumLookbackBars: 3,
  atrStopMultiplier: 1.0,
  takeProfitRMultiple: 1.5,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): SessionMomentumParameters {
  return { ...SESSION_MOMENTUM_DEFAULT_PARAMETERS, ...parameters } as SessionMomentumParameters;
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const parts = getEasternWallClockParts(new Date(lastCandle.timestamp));
  const minuteOfDay = parts.hour * 60 + parts.minute;
  const closingWindowStart = REGULAR_END_MIN - params.closingWindowMinutes;
  const inClosingWindow = minuteOfDay >= closingWindowStart && minuteOfDay < REGULAR_END_MIN && minuteOfDay >= REGULAR_START_MIN;

  if (!inClosingWindow) {
    return buildWaitSignal({
      strategy: sessionMomentumStrategy,
      input,
      explanation: `Outside the ${params.closingWindowMinutes}-minute closing window (last bar at ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} ET) — never signals outside it.`,
      rulesFailed: ["OUTSIDE_CLOSING_WINDOW"],
    });
  }

  const momentumReferenceIndex = candles.length - 1 - params.momentumLookbackBars;
  const momentumReferenceCandle = momentumReferenceIndex >= 0 ? candles[momentumReferenceIndex] : undefined;
  const rsi = seriesValueAtOffset(RSI_14.compute(candles), 0);
  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);

  if (!momentumReferenceCandle || !rsi || !atr || atr.value <= 0) {
    return buildWaitSignal({
      strategy: sessionMomentumStrategy,
      input,
      explanation: "Insufficient warmed-up history for Session Momentum (needs RSI14, ATR14 and the momentum lookback window).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const momentum = lastCandle.close - momentumReferenceCandle.close;
  const bullish = momentum > 0 && rsi.value > 50;
  const bearish = momentum < 0 && rsi.value < 50;

  if (!bullish && !bearish) {
    return buildWaitSignal({
      strategy: sessionMomentumStrategy,
      input,
      explanation: `In the closing window but no confirmed momentum: price change ${momentum.toFixed(2)}, RSI14 ${rsi.value.toFixed(1)}.`,
      rulesFailed: ["NO_MOMENTUM_SETUP"],
      metadata: { momentum, rsi: rsi.value, minuteOfDay },
    });
  }

  const direction: 1 | -1 = bullish ? 1 : -1;
  const entry = lastCandle.close;
  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = ["CLOSING_WINDOW", "MOMENTUM_CONFIRMATION"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: sessionMomentumStrategy,
      input,
      explanation: `Closing-window momentum found but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: { candidateEntry: entry, candidateStopLoss: stopLoss, candidateTakeProfit: takeProfit, candidateRiskReward: riskReward },
    });
  }

  const rsiComponent = clamp(Math.abs(rsi.value - 50) * 0.8, 0, 30);
  const rawScoreMagnitude = clamp(50 + rsiComponent, 0, 100);

  return {
    strategyId: sessionMomentumStrategy.id,
    strategyName: sessionMomentumStrategy.name,
    strategyVersion: sessionMomentumStrategy.version,
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
    explanation: `${direction === 1 ? "Bullish" : "Bearish"} closing-window momentum: price change ${momentum.toFixed(2)}, RSI14 ${rsi.value.toFixed(1)} confirms, within the last ${params.closingWindowMinutes} minutes of the session.`,
    metadata: { momentum, rsi: rsi.value, minuteOfDay },
  };
}

export const sessionMomentumStrategy: Strategy = {
  id: "session-momentum",
  name: "Session Momentum",
  description:
    "Trades short-term momentum, confirmed by RSI14, but ONLY within a fixed window of minutes before the 16:00 ET close — never outside it. Quantitative hypothesis pending Block 5 validation.",
  version: "1.0.0",
  enabled: true,
  // Widened for Block 5 Stage 7 (cross-asset testing) — same
  // capability-declaration-only rationale established in Block 4.5 for
  // MR/ORB. None of the three added markets are in ACTIVE_MARKETS, so
  // the live dashboard is unaffected. generateSignal is unchanged.
  supportedMarkets: ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"],
  supportedTimeframes: ["5m"],
  compatibleRegimes: [
    "STRONG_UPTREND",
    "UPTREND",
    "STRONG_DOWNTREND",
    "DOWNTREND",
    "RANGE",
    "BREAKOUT",
    "HIGH_VOLATILITY",
    "LOW_VOLATILITY",
  ],
  defaultParameters: SESSION_MOMENTUM_DEFAULT_PARAMETERS,
  generateSignal,
  family: "INTRADAY_SEASONALITY",
  hypothesis:
    "Momentum in the final minutes of the regular session (institutional rebalancing / closing-auction flows) continues through the close more reliably than momentum measured at an arbitrary time of day.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic execution cost (Block 5 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 5 funnel Stage 5).",
  ],
};
