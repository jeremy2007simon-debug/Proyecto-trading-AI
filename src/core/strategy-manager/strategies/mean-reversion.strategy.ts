import { ATR_14, EMA_20, RSI_14 } from "@/core/indicators";
import { createVwap } from "@/core/indicators/vwap";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
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
 * Mean Reversion — a quantitative HYPOTHESIS (RSI extreme + price
 * meaningfully extended from EMA20 in ATR terms + confirming VWAP side),
 * not a claim of profitability. `compatibleRegimes` is a fixed
 * `["RANGE", "LOW_VOLATILITY"]` — this is the ONLY guard against firing
 * during a strong directional trend; the strategy deliberately does not
 * duplicate any regime check internally (the Strategy Manager already
 * enforces `compatibleRegimes` before `generateSignal` is ever called).
 */
export interface MeanReversionParameters extends StrategyParameters {
  /** RSI14 at or below this is considered oversold. */
  rsiOversold: number;
  /** RSI14 at or above this is considered overbought. */
  rsiOverbought: number;
  /** Price must be extended from EMA20 by at least this many ATRs to qualify as a reversion candidate. */
  atrDistanceThreshold: number;
  /** ATR14 multiple used to place the stop loss. */
  atrStopMultiplier: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
}

export const MEAN_REVERSION_DEFAULT_PARAMETERS: MeanReversionParameters = {
  rsiOversold: 30,
  rsiOverbought: 70,
  atrDistanceThreshold: 1.5,
  atrStopMultiplier: 1.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): MeanReversionParameters {
  return { ...MEAN_REVERSION_DEFAULT_PARAMETERS, ...parameters } as MeanReversionParameters;
}

// Pure, deterministic — safe to build once at module scope (no I/O; see
// `createNyseCalendar`'s own docs).
const calendar = createNyseCalendar();
const vwapIndicator = createVwap(calendar);

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const ema20 = seriesValueAtOffset(EMA_20.compute(candles), 0);
  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);
  const rsi = seriesValueAtOffset(RSI_14.compute(candles), 0);
  const vwapNow = seriesValueAtOffset(vwapIndicator.compute(candles), 0);

  if (!ema20 || !atr || !rsi || !vwapNow || atr.value <= 0) {
    return buildWaitSignal({
      strategy: meanReversionStrategy,
      input,
      explanation: "Insufficient warmed-up history for Mean Reversion (needs EMA20, ATR14, RSI14 and VWAP).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const entry = lastCandle.close;
  const distanceFromEmaAtr = Math.abs(ema20.value - entry) / atr.value;

  const oversoldBounce =
    rsi.value <= params.rsiOversold &&
    (ema20.value - entry) / atr.value >= params.atrDistanceThreshold &&
    vwapNow.distancePct <= 0;
  const overboughtFade =
    rsi.value >= params.rsiOverbought &&
    (entry - ema20.value) / atr.value >= params.atrDistanceThreshold &&
    vwapNow.distancePct >= 0;

  if (!oversoldBounce && !overboughtFade) {
    return buildWaitSignal({
      strategy: meanReversionStrategy,
      input,
      explanation: `No mean-reversion setup: RSI14 ${rsi.value.toFixed(1)} is not at an extreme with price extended >= ${params.atrDistanceThreshold} ATRs from EMA20 on the confirming VWAP side.`,
      rulesFailed: ["NO_REVERSION_SETUP"],
      metadata: { rsi: rsi.value, distanceFromEmaAtr, vwapDistancePct: vwapNow.distancePct },
    });
  }

  const direction: 1 | -1 = oversoldBounce ? 1 : -1;
  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const takeProfit = ema20.value;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = ["RSI_EXTREME", "ATR_EXTENSION", "VWAP_SIDE_CONFIRMATION"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: meanReversionStrategy,
      input,
      explanation: `Reversion setup found but risk:reward ${riskReward.toFixed(2)} (target is EMA20, not an arbitrary R-multiple) is below the minimum ${params.minimumRiskReward}.`,
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

  const rsiExtremeComponent =
    direction === 1
      ? clamp((params.rsiOversold - rsi.value) * 2, 0, 40)
      : clamp((rsi.value - params.rsiOverbought) * 2, 0, 40);
  const extensionComponent = clamp((distanceFromEmaAtr - params.atrDistanceThreshold) * 20, 0, 40);
  const rawScoreMagnitude = clamp(20 + rsiExtremeComponent + extensionComponent, 0, 100);

  return {
    strategyId: meanReversionStrategy.id,
    strategyName: meanReversionStrategy.name,
    strategyVersion: meanReversionStrategy.version,
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
    explanation: `${direction === 1 ? "Oversold bounce" : "Overbought fade"}: RSI14 ${rsi.value.toFixed(1)}, price ${distanceFromEmaAtr.toFixed(2)} ATRs from EMA20 (${ema20.value.toFixed(2)}), VWAP distance ${vwapNow.distancePct.toFixed(2)}% confirms.`,
    metadata: { rsi: rsi.value, distanceFromEmaAtr, vwapDistancePct: vwapNow.distancePct },
  };
}

export const meanReversionStrategy: Strategy = {
  id: "mean-reversion",
  name: "Mean Reversion",
  description:
    "Trades a bounce back toward EMA20 when RSI14 is at an extreme, price is meaningfully extended (in ATR terms) from EMA20, and VWAP distance confirms the same side. Take-profit targets EMA20 itself rather than an arbitrary R-multiple. Quantitative hypothesis pending backtesting validation.",
  version: "1.0.0",
  enabled: true,
  // Widened in Block 4.5 (Phase 7) to test cross-asset robustness — same
  // capability-declaration-only rationale as `supportedTimeframes`
  // below. None of the three added markets are in `ACTIVE_MARKETS`, so
  // the live dashboard (which only ever requests SP500) is unaffected.
  supportedMarkets: ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"],
  // Widened in Block 4.5 (Phase 5) to test timeframe robustness — the
  // rule set itself is fully timeframe-agnostic (EMA20/ATR14/RSI14/VWAP
  // all recompute generically from whatever candles they're given), so
  // this is a capability declaration only; `generateSignal` is
  // unchanged. "15m" (first) stays the originally-validated timeframe.
  supportedTimeframes: ["15m", "5m", "30m", "1h"],
  // Fixed, not just an initial guess: mean reversion is only evaluated
  // while the regime detector confirms RANGE or LOW_VOLATILITY — this is
  // the strategy's ONLY guard against fading a genuine strong trend, per
  // design (no redundant internal regime check).
  compatibleRegimes: ["RANGE", "LOW_VOLATILITY"],
  defaultParameters: MEAN_REVERSION_DEFAULT_PARAMETERS,
  generateSignal,
  // Block 5 lifecycle marking — see docs/BLOCK4_5_STRATEGY_RESEARCH_REPORT.md.
  // Kept registered (never deleted) for audit; not part of any Block 5
  // research budget.
  family: "LEGACY",
  hypothesis:
    "RSI extreme + price meaningfully extended from EMA20 in ATR terms + confirming VWAP side reverts toward EMA20.",
  status: "HISTORICAL_REJECTED",
  invalidationConditions: [
    "Break-even transaction cost (~0.90bps) far below the realistic 5bps execution-cost scenario (Block 4.5, Phase 2).",
    "Negative expectancyR out-of-sample and across the full 2016-2026 chronological split (Block 4.5, Phase 6).",
  ],
};
