import { ATR_14, createRollingPercentile, VOLUME_AVERAGE_20 } from "@/core/indicators";
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
 * Block 5, Family C — Volatility Breakout. HYPOTHESIS: a period of range
 * compression (low ATR percentile relative to its own recent history)
 * followed by a decisive break of the prior structure, confirmed by
 * volume, marks the start of a real expansion move. Deliberately NOT
 * anchored to the session open (unlike the legacy Opening Range
 * Breakout) — this is a general compression-then-expansion setup that
 * can fire at any time of day. Not a claim of profitability — pending
 * the Block 5 validation funnel.
 */
export interface VolatilityCompressionBreakoutParameters extends StrategyParameters {
  /** ATR14 must have ranked at or below this percentile (of its trailing baseline) on the bar BEFORE the breakout bar — the Block 5 Stage-3 sensitivity axis (20/30/40). */
  compressionPercentileThreshold: number;
  /** Bars of PRIOR structure (excluding the current bar) used to find the breakout level. Fixed, not swept. */
  lookbackBars: number;
  /** Trailing window for the ATR percentile baseline. Fixed, not swept — same convention as the Market Regime Detector's own baseline. */
  percentileBaselineWindow: number;
  /** Close must clear the prior high/low by at least this many ATRs. */
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

export const VOLATILITY_COMPRESSION_BREAKOUT_DEFAULT_PARAMETERS: VolatilityCompressionBreakoutParameters = {
  compressionPercentileThreshold: 30,
  lookbackBars: 20,
  percentileBaselineWindow: 60,
  breakoutBufferAtrMultiple: 0.25,
  volumeMultiplier: 1.3,
  atrStopMultiplier: 1.2,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): VolatilityCompressionBreakoutParameters {
  return { ...VOLATILITY_COMPRESSION_BREAKOUT_DEFAULT_PARAMETERS, ...parameters } as VolatilityCompressionBreakoutParameters;
}

/** Same "exclude the current bar" convention as the legacy Breakout strategy — see its own docstring for why this is anti-look-ahead-critical. */
function priorStructureWindow(candles: readonly Candle[], lookback: number): Candle[] {
  const end = candles.length - 1;
  const start = Math.max(0, end - lookback);
  return candles.slice(start, end);
}

const atrPercentileIndicator = createRollingPercentile(ATR_14, (v) => v.value, VOLATILITY_COMPRESSION_BREAKOUT_DEFAULT_PARAMETERS.percentileBaselineWindow);

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);
  const volumeAverage = seriesValueAtOffset(VOLUME_AVERAGE_20.compute(candles), 0);
  const priorWindow = priorStructureWindow(candles, params.lookbackBars);
  // The compression check reads the percentile from the bar BEFORE the
  // breakout bar (offset 1), not the breakout bar's own ATR — a breakout
  // bar's true range is often already expanding by construction, so
  // checking "was it compressed right before this bar" is the honest
  // test of the hypothesis, not "is it still compressed on the bar that
  // just broke out."
  const atrPercentilePrior = seriesValueAtOffset(atrPercentileIndicator.compute(candles), 1);

  if (!atr || !volumeAverage || !atrPercentilePrior || priorWindow.length < params.lookbackBars) {
    return buildWaitSignal({
      strategy: volatilityCompressionBreakoutStrategy,
      input,
      explanation: "Insufficient warmed-up history for Volatility Breakout (needs ATR14, its rolling percentile baseline, VolumeAverage20 and a full prior-structure lookback window).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const wasCompressed = atrPercentilePrior.percentile <= params.compressionPercentileThreshold;
  if (!wasCompressed) {
    return buildWaitSignal({
      strategy: volatilityCompressionBreakoutStrategy,
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
  const volumeRatio = volumeAverage.value > 0 ? lastCandle.volume / volumeAverage.value : 1;
  const volumeConfirmed = volumeRatio >= params.volumeMultiplier;

  if (!brokeOutUp && !brokeOutDown) {
    return buildWaitSignal({
      strategy: volatilityCompressionBreakoutStrategy,
      input,
      explanation: `Compression confirmed but no breakout yet: close ${lastCandle.close.toFixed(2)} is within the prior ${params.lookbackBars}-bar range [${priorLow.toFixed(2)}, ${priorHigh.toFixed(2)}] plus buffer.`,
      rulesFailed: ["NO_BREAKOUT_SETUP"],
      rulesTriggered: ["COMPRESSION_PRECONDITION"],
      metadata: { priorHigh, priorLow, atrPercentilePrior: atrPercentilePrior.percentile },
    });
  }

  const direction: 1 | -1 = brokeOutUp ? 1 : -1;
  const brokenLevel = brokeOutUp ? priorHigh : priorLow;

  if (!volumeConfirmed) {
    return buildWaitSignal({
      strategy: volatilityCompressionBreakoutStrategy,
      input,
      explanation: `Compressed range broke out but volume (${lastCandle.volume}) is below ${params.volumeMultiplier}x the 20-bar average (${volumeAverage.value.toFixed(0)}) — likely a false start.`,
      rulesFailed: ["VOLUME_CONFIRMATION"],
      rulesTriggered: ["COMPRESSION_PRECONDITION", "BREAKOUT_LEVEL_CLEARED"],
      metadata: { priorHigh, priorLow, volumeRatio },
    });
  }

  const entry = lastCandle.close;
  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = ["COMPRESSION_PRECONDITION", "BREAKOUT_LEVEL_CLEARED", "VOLUME_CONFIRMATION"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: volatilityCompressionBreakoutStrategy,
      input,
      explanation: `Compression breakout confirmed but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: { candidateEntry: entry, candidateStopLoss: stopLoss, candidateTakeProfit: takeProfit, candidateRiskReward: riskReward },
    });
  }

  const compressionScoreComponent = clamp((params.compressionPercentileThreshold - atrPercentilePrior.percentile) * 1.5, 0, 30);
  const volumeScoreComponent = clamp((volumeRatio - 1) * 20, 0, 20);
  const rawScoreMagnitude = clamp(50 + compressionScoreComponent + volumeScoreComponent, 0, 100);

  return {
    strategyId: volatilityCompressionBreakoutStrategy.id,
    strategyName: volatilityCompressionBreakoutStrategy.name,
    strategyVersion: volatilityCompressionBreakoutStrategy.version,
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
    explanation: `${direction === 1 ? "Upside" : "Downside"} breakout of the prior ${params.lookbackBars}-bar ${direction === 1 ? "high" : "low"} (${brokenLevel.toFixed(2)}) after ATR compression (${atrPercentilePrior.percentile.toFixed(1)}th percentile), confirmed by volume (${volumeRatio.toFixed(2)}x average).`,
    metadata: { priorHigh, priorLow, volumeRatio, atrPercentilePrior: atrPercentilePrior.percentile },
  };
}

export const volatilityCompressionBreakoutStrategy: Strategy = {
  id: "volatility-compression-breakout",
  name: "Volatility Compression Breakout",
  description:
    "Trades a break of prior N-bar structure that follows a period of ATR compression (low percentile rank against its own trailing baseline), confirmed by volume — not anchored to the session open, unlike the legacy Opening Range Breakout. Quantitative hypothesis pending Block 5 validation.",
  version: "1.0.0",
  enabled: true,
  // Widened for Block 5 Stage 7 (cross-asset testing) — same
  // capability-declaration-only rationale established in Block 4.5 for
  // MR/ORB. None of the three added markets are in ACTIVE_MARKETS, so
  // the live dashboard is unaffected. generateSignal is unchanged.
  supportedMarkets: ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"],
  supportedTimeframes: ["15m"],
  compatibleRegimes: ["RANGE", "BREAKOUT", "HIGH_VOLATILITY", "LOW_VOLATILITY"],
  defaultParameters: VOLATILITY_COMPRESSION_BREAKOUT_DEFAULT_PARAMETERS,
  generateSignal,
  family: "VOLATILITY_BREAKOUT",
  hypothesis:
    "A break of prior structure that follows genuine range compression (not just any break) marks the start of a real expansion move, distinct from noise-level breaks in an already-volatile market.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic execution cost (Block 5 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 5 funnel Stage 5).",
  ],
};
