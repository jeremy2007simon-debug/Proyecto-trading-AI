import { ADX_14, ATR_14 } from "@/core/indicators";
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
 * Block 5, Family H — Volatility Regime. HYPOTHESIS: once the Market
 * Regime Detector has confirmed HIGH_VOLATILITY (a causal, no-look-ahead
 * classification — see `rule-based-regime-detector.ts`), directional
 * momentum (confirmed by the ADX directional index) tends to continue
 * rather than mean-revert. This strategy adds ZERO new regime-detection
 * code: `compatibleRegimes: ["HIGH_VOLATILITY"]` reuses the SAME engine
 * gate every other strategy already goes through (`compatibleRegimes`
 * checked in `event-driven-simulator.ts` before `generateSignal` is ever
 * called), so this is purely a rule-set difference, not a new
 * capability. Not a claim of profitability — pending the Block 5
 * validation funnel.
 */
export interface VolatilityRegimeMomentumParameters extends StrategyParameters {
  /** Minimum ADX14 required to take a directional signal — the Block 5 Stage-3 sensitivity axis (20/25/30). */
  adxMinimum: number;
  /** ATR14 multiple used to place the stop loss. */
  atrStopMultiplier: number;
  /** Take-profit distance as a multiple of the initial risk (R). */
  takeProfitRMultiple: number;
  /** Minimum acceptable risk:reward ratio; below this the signal degrades to WAIT. */
  minimumRiskReward: number;
}

export const VOLATILITY_REGIME_MOMENTUM_DEFAULT_PARAMETERS: VolatilityRegimeMomentumParameters = {
  adxMinimum: 25,
  atrStopMultiplier: 1.5,
  takeProfitRMultiple: 2.0,
  minimumRiskReward: DEFAULT_MINIMUM_RISK_REWARD,
};

function resolveParameters(parameters: StrategyParameters): VolatilityRegimeMomentumParameters {
  return { ...VOLATILITY_REGIME_MOMENTUM_DEFAULT_PARAMETERS, ...parameters } as VolatilityRegimeMomentumParameters;
}

function generateSignal(input: StrategyEvaluationInput): StrategySignal {
  const params = resolveParameters(input.parameters);
  const candles = input.candles;
  const lastCandle = candles[candles.length - 1];

  const adx = seriesValueAtOffset(ADX_14.compute(candles), 0);
  const atr = seriesValueAtOffset(ATR_14.compute(candles), 0);

  if (!adx || !atr || atr.value <= 0) {
    return buildWaitSignal({
      strategy: volatilityRegimeMomentumStrategy,
      input,
      explanation: "Insufficient warmed-up history for Volatility Regime Momentum (needs ADX14 and ATR14).",
      rulesFailed: ["INSUFFICIENT_DATA"],
    });
  }

  const strongEnough = adx.adx >= params.adxMinimum;
  const bullish = strongEnough && adx.plusDI > adx.minusDI;
  const bearish = strongEnough && adx.minusDI > adx.plusDI;

  if (!bullish && !bearish) {
    return buildWaitSignal({
      strategy: volatilityRegimeMomentumStrategy,
      input,
      explanation: `No confirmed directional momentum in HIGH_VOLATILITY: ADX ${adx.adx.toFixed(1)} vs threshold ${params.adxMinimum}, +DI ${adx.plusDI.toFixed(1)}, -DI ${adx.minusDI.toFixed(1)}.`,
      rulesFailed: ["NO_DIRECTIONAL_MOMENTUM"],
      metadata: { adx: adx.adx, plusDI: adx.plusDI, minusDI: adx.minusDI },
    });
  }

  const direction: 1 | -1 = bullish ? 1 : -1;
  const entry = lastCandle.close;
  const stopLoss = direction === 1 ? entry - atr.value * params.atrStopMultiplier : entry + atr.value * params.atrStopMultiplier;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit = direction === 1 ? entry + risk * params.takeProfitRMultiple : entry - risk * params.takeProfitRMultiple;
  const riskReward = computeRiskReward(entry, stopLoss, takeProfit);
  const rulesTriggered = ["HIGH_VOLATILITY_REGIME", "DIRECTIONAL_MOMENTUM"];

  if (riskReward < params.minimumRiskReward) {
    return buildWaitSignal({
      strategy: volatilityRegimeMomentumStrategy,
      input,
      explanation: `Directional momentum confirmed but risk:reward ${riskReward.toFixed(2)} is below the minimum ${params.minimumRiskReward}.`,
      rulesFailed: ["MINIMUM_RISK_REWARD"],
      rulesTriggered,
      metadata: { candidateEntry: entry, candidateStopLoss: stopLoss, candidateTakeProfit: takeProfit, candidateRiskReward: riskReward },
    });
  }

  const adxScoreComponent = clamp(((adx.adx - params.adxMinimum) / (50 - params.adxMinimum)) * 40, 0, 40);
  const rawScoreMagnitude = clamp(50 + adxScoreComponent, 0, 100);

  return {
    strategyId: volatilityRegimeMomentumStrategy.id,
    strategyName: volatilityRegimeMomentumStrategy.name,
    strategyVersion: volatilityRegimeMomentumStrategy.version,
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
    explanation: `${direction === 1 ? "Bullish" : "Bearish"} momentum confirmed in a HIGH_VOLATILITY regime: ADX ${adx.adx.toFixed(1)} >= ${params.adxMinimum}, +DI/-DI agree.`,
    metadata: { adx: adx.adx, plusDI: adx.plusDI, minusDI: adx.minusDI },
  };
}

export const volatilityRegimeMomentumStrategy: Strategy = {
  id: "volatility-regime-momentum",
  name: "Volatility Regime Momentum",
  description:
    "Trades directional momentum (confirmed by ADX/+DI/-DI) ONLY while the Market Regime Detector has confirmed HIGH_VOLATILITY — reuses the engine's existing compatibleRegimes gate, no new regime-detection logic. Quantitative hypothesis pending Block 5 validation.",
  version: "1.0.0",
  enabled: true,
  // Widened for Block 5 Stage 7 (cross-asset testing) — same
  // capability-declaration-only rationale established in Block 4.5 for
  // MR/ORB. None of the three added markets are in ACTIVE_MARKETS, so
  // the live dashboard is unaffected. generateSignal is unchanged.
  supportedMarkets: ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"],
  supportedTimeframes: ["30m"],
  compatibleRegimes: ["HIGH_VOLATILITY"],
  defaultParameters: VOLATILITY_REGIME_MOMENTUM_DEFAULT_PARAMETERS,
  generateSignal,
  family: "VOLATILITY_REGIME",
  hypothesis:
    "Once a HIGH_VOLATILITY regime is confirmed (causally, no future information), directional momentum tends to continue rather than mean-revert.",
  status: "ACTIVE_RESEARCH",
  invalidationConditions: [
    "expectancyR <= 0 at zero cost (no gross edge) or at realistic execution cost (Block 5 funnel Stage 2/3).",
    "expectancyR <= 0 out-of-sample (Block 5 funnel Stage 5).",
  ],
};
