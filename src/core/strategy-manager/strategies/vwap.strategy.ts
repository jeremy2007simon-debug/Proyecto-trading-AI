import { ATR_14, MACD_12_26_9, RSI_14 } from "@/core/indicators";
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
 * VWAP — a quantitative HYPOTHESIS covering three distinct setups
 * (recorded in `metadata.setupType` so each can be evaluated separately
 * once backtesting exists), not a claim of profitability.
 * `compatibleRegimes` below is an initial guess pending validation.
 */
export interface VwapStrategyParameters extends StrategyParameters {
  /** Bars (including current) that must share the same VWAP-side sign for a CONTINUATION setup. */
  continuationLookback: number;
  /** A CONTINUATION setup is rejected once price is already this many % away from VWAP — don't chase an extended move. */
  maxContinuationDistancePct: number;
  /** ATR14 multiple used to place the stop loss for a CONTINUATION setup. */
  atrStopMultiplier: number;
  /** Take-profit distance as a multiple of the initial risk (R). */
  takeProfitRMultiple: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
}

export const VWAP_STRATEGY_DEFAULT_PARAMETERS: VwapStrategyParameters = {
  continuationLookback: 5,
  maxContinuationDistancePct: 1.0,
  atrStopMultiplier: 1.2,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): VwapStrategyParameters {
  return { ...VWAP_STRATEGY_DEFAULT_PARAMETERS, ...parameters } as VwapStrategyParameters;
}

// Pure, deterministic — safe to build once at module scope (no I/O; see
// `createNyseCalendar`'s own docs).
const calendar = createNyseCalendar();
const vwapIndicator = createVwap(calendar);

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const vwapSeries = vwapIndicator.compute(candles);
  const vwapNow = seriesValueAtOffset(vwapSeries, 0);
  const vwapPrev = seriesValueAtOffset(vwapSeries, 1);
  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);
  const rsi = seriesValueAtOffset(RSI_14.compute(candles), 0);
  const macd = seriesValueAtOffset(MACD_12_26_9.compute(candles), 0);
  const priorCandle = candles.length >= 2 ? candles[candles.length - 2] : undefined;

  if (!vwapNow || !vwapPrev || !atr || !rsi || !macd || !priorCandle) {
    return buildWaitSignal({
      strategy: vwapStrategy,
      input,
      explanation: "Insufficient warmed-up history for VWAP (needs at least 2 VWAP values plus ATR14/RSI14/MACD).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  // A new session's first bar always starts a fresh VWAP baseline
  // (distancePct relative only to that one bar), so comparing it against
  // the PREVIOUS session's closing distancePct can look like a sign-flip
  // purely from the reset — not from any genuine price action. Cross
  // detection (RECLAIM/REJECTION) is only meaningful within a single
  // session; skip it right at a session boundary.
  const crossedIntoNewSession =
    calendar.getSessionStartUTC(new Date(lastCandle.timestamp)) !==
    calendar.getSessionStartUTC(new Date(priorCandle.timestamp));

  const bullishMomentum = macd.histogram > 0 || rsi.value > 50;
  const bearishMomentum = macd.histogram < 0 || rsi.value < 50;
  const entry = lastCandle.close;

  let direction: 1 | -1 | 0 = 0;
  let setupType: "VWAP_RECLAIM" | "VWAP_REJECTION" | "VWAP_CONTINUATION" | undefined;
  let stopLoss = 0;
  let rulesTriggered: string[] = [];

  if (!crossedIntoNewSession && vwapPrev.distancePct < 0 && vwapNow.distancePct > 0 && bullishMomentum) {
    direction = 1;
    setupType = "VWAP_RECLAIM";
    stopLoss = vwapNow.value - 0.3 * atr.value;
    rulesTriggered = ["VWAP_CROSS_ABOVE", "MOMENTUM_CONFIRMATION"];
  } else if (!crossedIntoNewSession && vwapPrev.distancePct > 0 && vwapNow.distancePct < 0 && bearishMomentum) {
    direction = -1;
    setupType = "VWAP_REJECTION";
    stopLoss = vwapNow.value + 0.3 * atr.value;
    rulesTriggered = ["VWAP_CROSS_BELOW", "MOMENTUM_CONFIRMATION"];
  } else {
    const persistenceWindow = Array.from({ length: params.continuationLookback }, (_, offset) =>
      seriesValueAtOffset(vwapSeries, offset),
    );
    const persistenceComplete = persistenceWindow.every((v) => v !== undefined);
    const allAboveVwap = persistenceComplete && persistenceWindow.every((v) => v!.distancePct > 0);
    const allBelowVwap = persistenceComplete && persistenceWindow.every((v) => v!.distancePct < 0);
    const withinChaseLimit = Math.abs(vwapNow.distancePct) < params.maxContinuationDistancePct;

    if (allAboveVwap && withinChaseLimit) {
      direction = 1;
      setupType = "VWAP_CONTINUATION";
      stopLoss = entry - atr.value * params.atrStopMultiplier;
      rulesTriggered = ["VWAP_SIDE_PERSISTENCE", "NOT_OVEREXTENDED"];
    } else if (allBelowVwap && withinChaseLimit) {
      direction = -1;
      setupType = "VWAP_CONTINUATION";
      stopLoss = entry + atr.value * params.atrStopMultiplier;
      rulesTriggered = ["VWAP_SIDE_PERSISTENCE", "NOT_OVEREXTENDED"];
    }
  }

  if (direction === 0 || !setupType) {
    return buildWaitSignal({
      strategy: vwapStrategy,
      input,
      explanation: "No VWAP reclaim/rejection cross with momentum confirmation, and no sufficiently persistent, non-extended VWAP-side continuation.",
      rulesFailed: ["NO_VWAP_SETUP"],
      metadata: { vwapValue: vwapNow.value, distancePct: vwapNow.distancePct },
    });
  }

  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: vwapStrategy,
      input,
      explanation: `${setupType} setup found but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: {
        setupType,
        candidateEntry: entry,
        candidateStopLoss: stopLoss,
        candidateTakeProfit: takeProfit,
        candidateRiskReward: riskReward,
      },
    });
  }

  const isFreshCross = setupType !== "VWAP_CONTINUATION";
  const momentumComponent = isFreshCross
    ? clamp(Math.abs(rsi.value - 50) * 0.8, 0, 30) +
      clamp((entry !== 0 ? Math.abs(macd.histogram) / entry : 0) * 100 * 20, 0, 20)
    : 0;
  const proximityComponent = isFreshCross
    ? 0
    : clamp((1 - Math.abs(vwapNow.distancePct) / params.maxContinuationDistancePct) * 20, 0, 20);
  const rawScoreMagnitude = clamp((isFreshCross ? 50 : 30) + momentumComponent + proximityComponent, 0, 100);

  return {
    strategyId: vwapStrategy.id,
    strategyName: vwapStrategy.name,
    strategyVersion: vwapStrategy.version,
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
    explanation: `${setupType}: ${direction === 1 ? "bullish" : "bearish"} VWAP setup at distance ${vwapNow.distancePct.toFixed(2)}% from VWAP (${vwapNow.value.toFixed(2)}).`,
    metadata: { setupType, vwapValue: vwapNow.value, distancePct: vwapNow.distancePct },
  };
}

export const vwapStrategy: Strategy = {
  id: "vwap",
  name: "VWAP",
  description:
    "Trades three distinct VWAP-relative setups: a RECLAIM (crossing back above VWAP with bullish momentum), a REJECTION (crossing back below VWAP with bearish momentum), or a CONTINUATION (price has held one side of VWAP for several bars and isn't yet overextended). Quantitative hypothesis pending backtesting validation.",
  version: "1.0.0",
  enabled: true,
  supportedMarkets: ["SP500"],
  supportedTimeframes: ["15m"],
  // Initial hypothesis: excludes STRONG_UPTREND/STRONG_DOWNTREND (a VWAP
  // reclaim/rejection against a very strong trend is a lower-quality
  // countertrend bet) and LOW_VOLATILITY/UNKNOWN (VWAP distance is not
  // meaningfully informative there) — pending backtesting validation.
  compatibleRegimes: ["UPTREND", "DOWNTREND", "RANGE", "BREAKOUT", "HIGH_VOLATILITY"],
  defaultParameters: VWAP_STRATEGY_DEFAULT_PARAMETERS,
  generateSignal,
  // Block 5 lifecycle marking — see docs/BLOCK4_BACKTESTING_REPORT.md.
  // Kept registered (never deleted) for audit; not part of any Block 5
  // research budget.
  family: "LEGACY",
  hypothesis:
    "Price reclaiming/rejecting VWAP with momentum confirmation, or persistently holding one side without becoming overextended, offers a tradeable edge.",
  status: "HISTORICAL_UNVALIDATED",
  invalidationConditions: [
    "Negative net expectancy at realistic execution cost over the 2-year real SPY backtest (Block 4).",
    "Never taken through Block 4.5's deeper cost-sensitivity/OOS/walk-forward funnel — this status reflects that gap, not an equivalent rejection to Mean Reversion/ORB.",
  ],
};
