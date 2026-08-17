import { ATR_14 } from "@/core/indicators";
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
 * Block 5, Family D — Gap/Overnight. HYPOTHESIS: a daily opening gap
 * (today's open vs. yesterday's close) beyond a threshold reflects real
 * overnight information flow and tends to continue through the session,
 * rather than immediately fade. Not a claim of profitability — pending
 * the Block 5 validation funnel.
 *
 * EXECUTION-ASSUMPTION CAVEAT (documented, not a bug): like every other
 * strategy in this codebase, `entry` is always the CURRENT (last) candle's
 * close — never its open — so this strategy signals once the gap day's
 * daily bar is complete, trading the REST of the continuation from that
 * day's close onward, not the gap itself intraday. A genuinely
 * open-anchored gap-fade/continuation entry would require a different,
 * intraday-timeframe execution model this engine doesn't have; that is
 * exactly the kind of engine assumption worth surfacing, not silently
 * working around.
 */
export interface GapContinuationParameters extends StrategyParameters {
  /** Minimum |gap| % (today's open vs. yesterday's close) to qualify — the Block 5 Stage-3 sensitivity axis (0.3/0.5/1.0). */
  gapThresholdPct: number;
  /** ATR14 multiple used to place the stop loss. */
  atrStopMultiplier: number;
  /** Take-profit distance as a multiple of the initial risk (R). */
  takeProfitRMultiple: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
}

export const GAP_CONTINUATION_DEFAULT_PARAMETERS: GapContinuationParameters = {
  gapThresholdPct: 0.5,
  atrStopMultiplier: 1.5,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): GapContinuationParameters {
  return { ...GAP_CONTINUATION_DEFAULT_PARAMETERS, ...parameters } as GapContinuationParameters;
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];
  const priorCandle = candles.length >= 2 ? candles[candles.length - 2] : undefined;

  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);

  if (!priorCandle || !atr || priorCandle.close <= 0 || atr.value <= 0) {
    return buildWaitSignal({
      strategy: gapContinuationStrategy,
      input,
      explanation: "Insufficient warmed-up history for Gap Continuation (needs a prior daily candle and ATR14).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const gapPct = ((lastCandle.open - priorCandle.close) / priorCandle.close) * 100;
  const gappedUp = gapPct >= params.gapThresholdPct;
  const gappedDown = gapPct <= -params.gapThresholdPct;

  if (!gappedUp && !gappedDown) {
    return buildWaitSignal({
      strategy: gapContinuationStrategy,
      input,
      explanation: `No qualifying gap: open ${lastCandle.open.toFixed(2)} vs. prior close ${priorCandle.close.toFixed(2)} is a ${gapPct.toFixed(2)}% gap (need |gap| >= ${params.gapThresholdPct}%).`,
      rulesFailed: ["NO_GAP_SETUP"],
      metadata: { gapPct },
    });
  }

  const direction: 1 | -1 = gappedUp ? 1 : -1;
  const entry = lastCandle.close;
  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = ["OPENING_GAP"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: gapContinuationStrategy,
      input,
      explanation: `Gap confirmed but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: { candidateEntry: entry, candidateStopLoss: stopLoss, candidateTakeProfit: takeProfit, candidateRiskReward: riskReward, gapPct },
    });
  }

  const gapScoreComponent = clamp((Math.abs(gapPct) - params.gapThresholdPct) * 20, 0, 40);
  const rawScoreMagnitude = clamp(50 + gapScoreComponent, 0, 100);

  return {
    strategyId: gapContinuationStrategy.id,
    strategyName: gapContinuationStrategy.name,
    strategyVersion: gapContinuationStrategy.version,
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
    explanation: `${gappedUp ? "Gap up" : "Gap down"} continuation: opened ${gapPct.toFixed(2)}% away from the prior close (${priorCandle.close.toFixed(2)}), entering at the gap day's close (${entry.toFixed(2)}).`,
    metadata: { gapPct },
  };
}

export const gapContinuationStrategy: Strategy = {
  id: "gap-continuation",
  name: "Gap Continuation",
  description:
    "Trades in the direction of a daily opening gap (today's open vs. yesterday's close) beyond a percentage threshold. Signals at the gap day's close (this engine's standard entry convention), not intraday at the open — see the execution-assumption note in the source. Quantitative hypothesis pending Block 5 validation.",
  version: "1.0.0",
  enabled: true,
  // Widened for Block 5 Stage 7 (cross-asset testing) — same
  // capability-declaration-only rationale established in Block 4.5 for
  // MR/ORB. None of the three added markets are in ACTIVE_MARKETS, so
  // the live dashboard is unaffected. generateSignal is unchanged.
  supportedMarkets: ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"],
  supportedTimeframes: ["1d"],
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
  defaultParameters: GAP_CONTINUATION_DEFAULT_PARAMETERS,
  generateSignal,
  family: "GAP_OVERNIGHT",
  hypothesis:
    "A daily opening gap beyond a meaningful threshold reflects real overnight information flow and tends to continue through the session rather than immediately fade.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic execution cost (Block 5 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 5 funnel Stage 5).",
  ],
};
