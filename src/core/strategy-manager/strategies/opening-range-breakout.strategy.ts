import { ATR_14, VOLUME_AVERAGE_20 } from "@/core/indicators";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import { TIMEFRAME_MINUTES } from "@/core/shared/timeframe";
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
 * Opening Range Breakout — a quantitative HYPOTHESIS (a break of the
 * first N minutes' high/low, confirmed by volume, only on the first bar
 * that clears the level), not a claim of profitability.
 * `compatibleRegimes` is an initial guess pending backtesting validation.
 */
export interface OpeningRangeBreakoutParameters extends StrategyParameters {
  /** Length of the opening range in minutes. MUST be a multiple of the strategy's timeframe (5m/15m/30m are common choices). */
  openingRangeMinutes: number;
  /** ATR14 multiple used as one candidate for the stop loss (the tighter of this and the opposite range boundary is used). */
  atrStopMultiplier: number;
  /** Take-profit distance as a multiple of the initial risk (R). */
  takeProfitRMultiple: number;
  /** Current volume must be at least this multiple of the 20-bar average to confirm the breakout. */
  volumeMultiplier: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
}

export const OPENING_RANGE_BREAKOUT_DEFAULT_PARAMETERS: OpeningRangeBreakoutParameters = {
  openingRangeMinutes: 15,
  atrStopMultiplier: 1.0,
  takeProfitRMultiple: 2.0,
  volumeMultiplier: 1.2,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): OpeningRangeBreakoutParameters {
  return { ...OPENING_RANGE_BREAKOUT_DEFAULT_PARAMETERS, ...parameters } as OpeningRangeBreakoutParameters;
}

// Pure, deterministic — safe to build once at module scope (no I/O; see
// `createNyseCalendar`'s own docs). DST is handled entirely inside the
// calendar (`getSessionStartUTC` derives the session open from Eastern
// wall-clock time), so this strategy never has to special-case it.
const calendar = createNyseCalendar();

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];
  const priorCandle = candles.length >= 2 ? candles[candles.length - 2] : undefined;

  const timeframeMinutes = TIMEFRAME_MINUTES[input.timeframe];
  if (params.openingRangeMinutes % timeframeMinutes !== 0) {
    return buildWaitSignal({
      strategy: openingRangeBreakoutStrategy,
      input,
      explanation: `Misconfigured openingRangeMinutes (${params.openingRangeMinutes}) is not a multiple of the ${input.timeframe} timeframe (${timeframeMinutes}m).`,
      rulesFailed: ["INVALID_OPENING_RANGE_CONFIGURATION"],
    });
  }

  // Determinism-critical: "now" is always the last candle's own
  // timestamp, never `Date.now()` — this is what makes the strategy
  // reproducible for backtesting, not just live evaluation.
  const sessionStartUTC = new Date(calendar.getSessionStartUTC(new Date(lastCandle.timestamp)));
  const openingRangeEndUTC = new Date(sessionStartUTC.getTime() + params.openingRangeMinutes * 60_000);

  if (new Date(lastCandle.timestamp) < openingRangeEndUTC) {
    return buildWaitSignal({
      strategy: openingRangeBreakoutStrategy,
      input,
      explanation: `Opening range still forming (closes at ${openingRangeEndUTC.toISOString()}) — never signaling before it closes.`,
      rulesFailed: ["OPENING_RANGE_FORMING"],
      metadata: { sessionStartUTC: sessionStartUTC.toISOString(), openingRangeEndUTC: openingRangeEndUTC.toISOString() },
    });
  }

  const rangeCandles = candles.filter((c: Candle) => {
    const t = new Date(c.timestamp).getTime();
    return t >= sessionStartUTC.getTime() && t < openingRangeEndUTC.getTime();
  });

  if (rangeCandles.length === 0) {
    return buildWaitSignal({
      strategy: openingRangeBreakoutStrategy,
      input,
      explanation: "Insufficient opening range data: no candles found within the session's opening range window.",
      rulesFailed: ["INSUFFICIENT_OPENING_RANGE_DATA"],
    });
  }

  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);
  const volumeAverage = seriesValueAtOffset(VOLUME_AVERAGE_20.compute(candles), 0);

  if (!atr || !volumeAverage || !priorCandle) {
    return buildWaitSignal({
      strategy: openingRangeBreakoutStrategy,
      input,
      explanation: "Insufficient warmed-up history for Opening Range Breakout (needs ATR14 and VolumeAverage20).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const orHigh = Math.max(...rangeCandles.map((c) => c.high));
  const orLow = Math.min(...rangeCandles.map((c) => c.low));
  const volumeRatio = volumeAverage.value > 0 ? lastCandle.volume / volumeAverage.value : 1;
  const volumeConfirmed = volumeRatio >= params.volumeMultiplier;

  // "First breakout bar" gate: only the bar that FIRST clears the level
  // signals — re-checking the prior bar against the same level prevents
  // re-signaling on every subsequent bar while price stays extended.
  const isFirstUpBreak = lastCandle.close > orHigh && priorCandle.close <= orHigh;
  const isFirstDownBreak = lastCandle.close < orLow && priorCandle.close >= orLow;

  if (!isFirstUpBreak && !isFirstDownBreak) {
    return buildWaitSignal({
      strategy: openingRangeBreakoutStrategy,
      input,
      explanation: `No fresh opening-range breakout: close ${lastCandle.close.toFixed(2)} relative to opening range [${orLow.toFixed(2)}, ${orHigh.toFixed(2)}].`,
      rulesFailed: ["NO_BREAKOUT_SETUP"],
      metadata: { orHigh, orLow },
    });
  }

  const direction: 1 | -1 = isFirstUpBreak ? 1 : -1;

  if (!volumeConfirmed) {
    return buildWaitSignal({
      strategy: openingRangeBreakoutStrategy,
      input,
      explanation: `Price cleared the opening range ${direction === 1 ? "high" : "low"} but volume (${lastCandle.volume}) is below ${params.volumeMultiplier}x the 20-bar average (${volumeAverage.value.toFixed(0)}).`,
      rulesFailed: ["VOLUME_CONFIRMATION"],
      rulesTriggered: ["OPENING_RANGE_BREAKOUT"],
      metadata: { orHigh, orLow, volumeRatio },
    });
  }

  const entry = lastCandle.close;
  const atrStop = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  // The tighter (closer to entry) of the ATR-based stop and the opposite
  // opening-range boundary.
  const stopLoss = direction === 1 ? Math.max(orLow, atrStop) : Math.min(orHigh, atrStop);
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);

  const rulesTriggered = ["OPENING_RANGE_BREAKOUT", "VOLUME_CONFIRMATION"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: openingRangeBreakoutStrategy,
      input,
      explanation: `Opening range breakout confirmed but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
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

  const brokenLevel = direction === 1 ? orHigh : orLow;
  const breakStrengthAtr = atr.value > 0 ? Math.abs(entry - brokenLevel) / atr.value : 0;
  const volumeScoreComponent = clamp((volumeRatio - 1) * 30, 0, 30);
  const breakStrengthComponent = clamp(breakStrengthAtr * 20, 0, 20);
  const rawScoreMagnitude = clamp(50 + volumeScoreComponent + breakStrengthComponent, 0, 100);

  return {
    strategyId: openingRangeBreakoutStrategy.id,
    strategyName: openingRangeBreakoutStrategy.name,
    strategyVersion: openingRangeBreakoutStrategy.version,
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
    explanation: `${direction === 1 ? "Upside" : "Downside"} break of the ${params.openingRangeMinutes}-minute opening range ${direction === 1 ? "high" : "low"} (${brokenLevel.toFixed(2)}), confirmed by volume (${volumeRatio.toFixed(2)}x average).`,
    metadata: { orHigh, orLow, volumeRatio },
  };
}

export const openingRangeBreakoutStrategy: Strategy = {
  id: "opening-range-breakout",
  name: "Opening Range Breakout",
  description:
    "Trades the first decisive break of the session's opening range (default 15 minutes, configurable in multiples of the strategy's timeframe), requiring volume confirmation and firing only on the first bar that clears the level. Never signals before the opening range closes. Quantitative hypothesis pending backtesting validation.",
  version: "1.0.0",
  enabled: true,
  // Widened in Block 4.5 (Phase 7) to test cross-asset robustness — same
  // capability-declaration-only rationale as `supportedTimeframes`
  // below. None of the three added markets are in `ACTIVE_MARKETS`, so
  // the live dashboard (which only ever requests SP500) is unaffected.
  supportedMarkets: ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"],
  // Widened in Block 4.5 (Phase 5) to test timeframe robustness — the
  // rule set itself is timeframe-agnostic (it already validates
  // `openingRangeMinutes % timeframeMinutes === 0` generically). This is
  // a capability declaration only; `generateSignal` is unchanged. Note
  // the real, expected consequence of NOT touching the default
  // parameters: with the default `openingRangeMinutes: 15`, "30m" never
  // produces a signal (15 is not a multiple of 30) — a genuine
  // robustness finding, not a bug. "5m" (first) stays the
  // originally-validated timeframe.
  supportedTimeframes: ["5m", "1m", "15m", "30m"],
  // Initial hypothesis: excludes RANGE/LOW_VOLATILITY/UNKNOWN (an opening
  // range break is a weaker signal when the broader session is already
  // rangebound or too quiet) — pending backtesting validation.
  compatibleRegimes: [
    "BREAKOUT",
    "UPTREND",
    "STRONG_UPTREND",
    "DOWNTREND",
    "STRONG_DOWNTREND",
    "HIGH_VOLATILITY",
  ],
  defaultParameters: OPENING_RANGE_BREAKOUT_DEFAULT_PARAMETERS,
  generateSignal,
  // Block 5 lifecycle marking — see docs/BLOCK4_5_STRATEGY_RESEARCH_REPORT.md.
  // Kept registered (never deleted) for audit; not part of any Block 5
  // research budget.
  family: "LEGACY",
  hypothesis:
    "The first decisive, volume-confirmed break of the opening range captures the start of the session's real directional move.",
  status: "HISTORICAL_REJECTED",
  invalidationConditions: [
    "Break-even transaction cost (~0.53bps) far below the realistic 5bps execution-cost scenario (Block 4.5, Phase 2).",
    "Negative expectancyR out-of-sample and across the full 2016-2026 chronological split (Block 4.5, Phase 6).",
  ],
};
