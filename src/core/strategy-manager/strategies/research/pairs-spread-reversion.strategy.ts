import { computeRiskReward, DEFAULT_MINIMUM_RISK_REWARD } from "@/core/strategy-manager/risk-reward";
import { buildWaitSignal } from "@/core/strategy-manager/signal-helpers";
import { clamp } from "@/core/strategy-manager/math";
import type { Candle } from "@/core/market-data/types";
import type {
  Strategy,
  StrategyEvaluationInput,
  StrategyParameters,
  StrategySignal,
} from "@/core/strategy-manager/types";

/**
 * Block 5, Family G — Pairs/Relative Value. HYPOTHESIS: the price RATIO
 * of two highly-correlated, liquid ETFs (e.g. SPY/QQQ) mean-reverts when
 * it strays several standard deviations from its own recent rolling
 * average — WITHOUT assuming formal cointegration (the calling research
 * script checks daily-return correlation as a lightweight relatedness
 * sanity check before running this, documented as an approximation, not
 * a rigorous cointegration test). Not a claim of profitability — pending
 * the Block 5 validation funnel.
 *
 * IMPORTANT — this strategy takes whatever `Candle[]` it's given and has
 * no idea it represents a ratio: the calling script synthesizes a
 * "candle" series whose OHLC are all the ratio price (`open=high=low=close
 * = priceA/priceB`, `volume=0`) and runs it through the REAL event-driven
 * engine unmodified — see `docs/BLOCK5_STRATEGY_DISCOVERY_REPORT.md` for
 * the full construction. `market`/`timeframe` on the resulting
 * `BacktestConfig` are placeholders (the engine only needs them to gate
 * `supportedMarkets`/`supportedTimeframes`); the actual pair identity is
 * tracked in the research script's own experiment metadata, not through
 * the `Market` enum, which has no concept of a synthetic spread
 * instrument.
 *
 * Uses a z-score of the ratio against its own rolling mean/stdev instead
 * of ATR-based stops/targets: a synthetic ratio "candle" has zero
 * intrabar range by construction, so ATR would only ever reflect
 * close-to-close change — z-score-based levels are the more honest,
 * purpose-built choice here.
 */
export interface PairsSpreadReversionParameters extends StrategyParameters {
  /** |z-score| at or beyond which the ratio counts as extended — the Block 5 Stage-3 sensitivity axis (1.5/2.0). */
  zScoreEntryThreshold: number;
  /** Extra z-score distance (beyond the entry threshold) used to place the stop. Fixed, not swept. */
  zScoreStopBuffer: number;
  /** Trailing bars used for the ratio's rolling mean/stdev. Fixed, not swept. */
  zScoreWindow: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
}

export const PAIRS_SPREAD_REVERSION_DEFAULT_PARAMETERS: PairsSpreadReversionParameters = {
  zScoreEntryThreshold: 2.0,
  zScoreStopBuffer: 1.0,
  zScoreWindow: 60,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): PairsSpreadReversionParameters {
  return { ...PAIRS_SPREAD_REVERSION_DEFAULT_PARAMETERS, ...parameters } as PairsSpreadReversionParameters;
}

/** Trailing window INCLUSIVE of the current bar — same causal convention every indicator in this codebase uses (SMA/EMA/ATR/RSI all include the current bar). */
function rollingMeanStdev(candles: readonly Candle[], window: number): { mean: number; stdev: number } | undefined {
  if (candles.length < window) return undefined;
  const slice = candles.slice(candles.length - window);
  const closes = slice.map((c) => c.close);
  const mean = closes.reduce((s, v) => s + v, 0) / window;
  const variance = closes.reduce((s, v) => s + (v - mean) ** 2, 0) / window;
  return { mean, stdev: Math.sqrt(variance) };
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const stats = rollingMeanStdev(candles, params.zScoreWindow);
  if (!stats || stats.stdev <= 0) {
    return buildWaitSignal({
      strategy: pairsSpreadReversionStrategy,
      input,
      explanation: `Insufficient warmed-up history or zero-variance ratio for Pairs Spread Reversion (needs ${params.zScoreWindow} bars).`,
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const entry = lastCandle.close;
  const z = (entry - stats.mean) / stats.stdev;
  const oversold = z <= -params.zScoreEntryThreshold;
  const overbought = z >= params.zScoreEntryThreshold;

  if (!oversold && !overbought) {
    return buildWaitSignal({
      strategy: pairsSpreadReversionStrategy,
      input,
      explanation: `No qualifying spread extension: z-score ${z.toFixed(2)} within +/-${params.zScoreEntryThreshold}.`,
      rulesFailed: ["NO_SPREAD_EXTENSION"],
      metadata: { zScore: z, rollingMean: stats.mean, rollingStdev: stats.stdev },
    });
  }

  const direction: 1 | -1 = oversold ? 1 : -1;
  // Placed `zScoreStopBuffer` standard deviations BEYOND entry, in the
  // adverse direction (further extension = thesis wrong, get out) —
  // never a fixed z-line relative to the mean. A fixed stop line would
  // sit on the wrong side of entry whenever the actual z-score already
  // overshoots the entry threshold (e.g. a fast, extreme move), silently
  // inverting the trade's risk; anchoring to the actual entry price
  // instead makes that structurally impossible.
  const stopLoss =
    direction === 1 ? entry - params.zScoreStopBuffer * stats.stdev : entry + params.zScoreStopBuffer * stats.stdev;
  const takeProfit = stats.mean;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = ["SPREAD_ZSCORE_EXTENSION"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: pairsSpreadReversionStrategy,
      input,
      explanation: `Spread extension found but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: { candidateEntry: entry, candidateStopLoss: stopLoss, candidateTakeProfit: takeProfit, candidateRiskReward: riskReward, zScore: z },
    });
  }

  const zScoreComponent = clamp((Math.abs(z) - params.zScoreEntryThreshold) * 25, 0, 40);
  const rawScoreMagnitude = clamp(50 + zScoreComponent, 0, 100);

  return {
    strategyId: pairsSpreadReversionStrategy.id,
    strategyName: pairsSpreadReversionStrategy.name,
    strategyVersion: pairsSpreadReversionStrategy.version,
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
    explanation: `Spread ${oversold ? "oversold" : "overbought"}: z-score ${z.toFixed(2)} vs entry threshold +/-${params.zScoreEntryThreshold}, targeting reversion to the rolling mean (${stats.mean.toFixed(4)}).`,
    metadata: { zScore: z, rollingMean: stats.mean, rollingStdev: stats.stdev },
  };
}

export const pairsSpreadReversionStrategy: Strategy = {
  id: "pairs-spread-reversion",
  name: "Pairs Spread Reversion",
  description:
    "Trades reversion of a synthetic price-ratio series (e.g. SPY/QQQ) toward its own rolling mean once it strays a configurable number of standard deviations away — the ratio's z-score, not ATR, drives entry/stop/target. Quantitative hypothesis pending Block 5 validation.",
  version: "1.0.0",
  enabled: true,
  supportedMarkets: ["SP500"],
  supportedTimeframes: ["15m"],
  compatibleRegimes: ["RANGE", "LOW_VOLATILITY"],
  defaultParameters: PAIRS_SPREAD_REVERSION_DEFAULT_PARAMETERS,
  generateSignal,
  family: "PAIRS_RELATIVE_VALUE",
  hypothesis:
    "The price ratio of two highly-correlated, liquid ETFs mean-reverts once it strays several standard deviations from its own recent rolling average, without assuming formal cointegration.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic execution cost (Block 5 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 5 funnel Stage 5).",
  ],
};
