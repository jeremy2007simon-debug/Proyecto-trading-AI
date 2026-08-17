import { ADX_14, ATR_14, EMA_50 } from "@/core/indicators";
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
 * Block 5, Family A — Momentum/Trend. HYPOTHESIS: when an N-bar rate of
 * change is positive, the medium-term (EMA50) trend is sloping the same
 * direction, and ADX confirms the move isn't chop, the move tends to
 * continue over the following bars. Not a claim of profitability —
 * pending the Block 5 validation funnel. Distinct from the legacy Trend
 * Following strategy (EMA20/50/200 stack alignment + fixed structure
 * lookback): this one is driven by a plain price rate-of-change and a
 * single EMA, deliberately simpler.
 */
export interface MomentumTrendParameters extends StrategyParameters {
  /** Bars back used to compute the rate of change — the Block 5 Stage-3 sensitivity axis (10/20/40). */
  rocLookbackBars: number;
  /** Bars back EMA50 is compared against to confirm it's still sloping in the trend direction. Fixed, not swept — round-number convention. */
  emaSlopeLookback: number;
  /** Minimum ADX14 required to treat the move as a real trend, not chop. */
  adxTrendThreshold: number;
  /** ATR14 multiple used to place the stop loss. */
  atrStopMultiplier: number;
  /** Take-profit distance as a multiple of the initial risk (R). */
  takeProfitRMultiple: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
}

export const MOMENTUM_TREND_DEFAULT_PARAMETERS: MomentumTrendParameters = {
  rocLookbackBars: 20,
  emaSlopeLookback: 5,
  adxTrendThreshold: 20,
  atrStopMultiplier: 1.5,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): MomentumTrendParameters {
  return { ...MOMENTUM_TREND_DEFAULT_PARAMETERS, ...parameters } as MomentumTrendParameters;
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  // Excludes the current bar from its own reference point — `roc`
  // compares against a bar strictly in the past, never itself.
  const rocReferenceIndex = candles.length - 1 - params.rocLookbackBars;
  const rocReferenceCandle = rocReferenceIndex >= 0 ? candles[rocReferenceIndex] : undefined;

  const ema50 = seriesValueAtOffset(EMA_50.compute(candles), 0);
  const ema50Prior = seriesValueAtOffset(EMA_50.compute(candles), params.emaSlopeLookback);
  const adx = seriesValueAtOffset(ADX_14.compute(candles), 0);
  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);

  if (!rocReferenceCandle || !ema50 || !ema50Prior || !adx || !atr || rocReferenceCandle.close <= 0) {
    return buildWaitSignal({
      strategy: momentumTrendStrategy,
      input,
      explanation: "Insufficient warmed-up history for Momentum Trend (needs EMA50, ADX14, ATR14 and the ROC lookback window).",
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
      strategy: momentumTrendStrategy,
      input,
      explanation: `No confirmed momentum: ${params.rocLookbackBars}-bar ROC ${(roc * 100).toFixed(2)}%, EMA50 slope ${emaSlopeUp ? "up" : emaSlopeDown ? "down" : "flat"}, ADX ${adx.adx.toFixed(1)} vs threshold ${params.adxTrendThreshold}.`,
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
      strategy: momentumTrendStrategy,
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
    strategyId: momentumTrendStrategy.id,
    strategyName: momentumTrendStrategy.name,
    strategyVersion: momentumTrendStrategy.version,
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
    explanation: `${direction === 1 ? "Bullish" : "Bearish"} momentum: ${params.rocLookbackBars}-bar ROC ${(roc * 100).toFixed(2)}%, EMA50 sloping ${direction === 1 ? "up" : "down"}, ADX ${adx.adx.toFixed(1)} confirms.`,
    metadata: { roc, ema50: ema50.value, adx: adx.adx },
  };
}

export const momentumTrendStrategy: Strategy = {
  id: "momentum-trend",
  name: "Momentum Trend",
  description:
    "Trades continuation of a medium-term move when the N-bar rate of change, EMA50 slope, and ADX all agree on direction and strength. Quantitative hypothesis pending Block 5 validation.",
  version: "1.0.0",
  enabled: true,
  // Widened for Block 5 Stage 7 (cross-asset testing) — same
  // capability-declaration-only rationale established in Block 4.5 for
  // MR/ORB. None of the three added markets are in ACTIVE_MARKETS, so
  // the live dashboard is unaffected. generateSignal is unchanged.
  supportedMarkets: ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"],
  supportedTimeframes: ["1h"],
  compatibleRegimes: ["STRONG_UPTREND", "UPTREND", "STRONG_DOWNTREND", "DOWNTREND"],
  defaultParameters: MOMENTUM_TREND_DEFAULT_PARAMETERS,
  generateSignal,
  family: "MOMENTUM_TREND",
  hypothesis:
    "Positive N-bar rate of change confirmed by EMA50 slope and ADX trend strength tends to continue over the following bars.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic execution cost (Block 5 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 5 funnel Stage 5).",
  ],
};
