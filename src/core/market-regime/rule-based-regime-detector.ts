import { ADX_14 } from "@/core/indicators/adx";
import { ATR_14 } from "@/core/indicators/atr";
import { EMA_20, EMA_9 } from "@/core/indicators/ema";
import { MACD_12_26_9 } from "@/core/indicators/macd";
import { REALIZED_VOLATILITY_20 } from "@/core/indicators/realized-volatility";
import { RSI_14 } from "@/core/indicators/rsi";
import { VOLUME_AVERAGE_20 } from "@/core/indicators/volume-average";
import type {
  MarketRegime,
  MarketRegimeDetector,
  RegimeDetectionInput,
  RegimeDetectionResult,
  RegimeRuleEvaluation,
  RegimeScores,
} from "@/core/market-regime/types";

/**
 * Number of consecutive raw (per-bar) classifications that must agree
 * before the detector "confirms" a regime change. This is the
 * hysteresis mechanism: it needs no state external to `input.candles`
 * (the detector recomputes the trailing raw classifications itself
 * every call), which keeps `detect()` synchronous and stateless per the
 * `MarketRegimeDetector` contract while still damping single-bar noise.
 */
const CONFIRMATION_BARS = 3;

/** Lookback window (bars) used to detect a breakout of prior structure. */
const BREAKOUT_LOOKBACK = 20;

const STRONG_ADX_THRESHOLD = 35;
const TREND_ADX_THRESHOLD = 20;
const HIGH_VOL_THRESHOLD = 80;
const LOW_VOL_THRESHOLD = 20;
const RANGE_SCORE_THRESHOLD = 60;
const BREAKOUT_SCORE_THRESHOLD = 60;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function toTimestampMap<T extends { timestamp: string }>(values: T[]): Map<string, T> {
  return new Map(values.map((v) => [v.timestamp, v]));
}

interface BarInputs {
  close: number;
  ema9: number;
  ema20: number;
  atr: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  rsi: number;
  macdHistogram: number;
  realizedVolatility: number;
  averageVolume: number;
  currentVolume: number;
  priorHigh: number;
  priorLow: number;
}

interface RawClassification {
  regime: MarketRegime;
  scores: RegimeScores;
  rules: RegimeRuleEvaluation[];
}

/**
 * Computes the 5 sub-scores and classifies a single bar. Pure function
 * of its inputs — `medianRVol`/`medianAtr` are the self-relative
 * volatility baselines for the whole window being analyzed (see the
 * caller for why this doesn't introduce look-ahead bias: every value
 * here comes from `input.candles`, which the caller guarantees never
 * extends past "now").
 */
function classifyBar(bar: BarInputs, medianRVol: number, medianAtr: number): RawClassification {
  const emaAlignment = bar.ema9 > bar.ema20 ? 1 : -1;
  const diSign = bar.plusDI === bar.minusDI ? 0 : bar.plusDI > bar.minusDI ? 1 : -1;
  const trendScore = clamp(emaAlignment * 30 + diSign * bar.adx * 0.7, -100, 100);

  const volRatio = medianRVol > 0 ? bar.realizedVolatility / medianRVol : 1;
  const volatilityScore = clamp(volRatio * 50, 0, 100);

  const brokeOutUp = bar.close > bar.priorHigh;
  const brokeOutDown = bar.close < bar.priorLow;
  const volumeRatio = bar.averageVolume > 0 ? bar.currentVolume / bar.averageVolume : 1;
  const atrRatio = medianAtr > 0 ? bar.atr / medianAtr : 1;
  const breakoutScore =
    brokeOutUp || brokeOutDown
      ? clamp(50 + (volumeRatio - 1) * 25 + (atrRatio - 1) * 25, 0, 100)
      : 0;

  const bandWidthPct = bar.close !== 0 ? ((bar.priorHigh - bar.priorLow) / bar.close) * 100 : 0;
  const rangeScore = clamp(100 - bar.adx * 1.2 - bandWidthPct * 2, 0, 100);

  const rsiComponent = (bar.rsi - 50) * 2;
  const macdComponent =
    bar.close !== 0 ? clamp((bar.macdHistogram / bar.close) * 100 * 40, -50, 50) : 0;
  const momentumScore = clamp((rsiComponent + macdComponent) / 2, -100, 100);

  const scores: RegimeScores = { trendScore, volatilityScore, breakoutScore, rangeScore, momentumScore };

  const rules: RegimeRuleEvaluation[] = [
    { rule: "HIGH_VOLATILITY_OVERRIDE", passed: volatilityScore >= HIGH_VOL_THRESHOLD, value: volatilityScore, weight: 1 },
    { rule: "LOW_VOLATILITY_OVERRIDE", passed: volatilityScore <= LOW_VOL_THRESHOLD, value: volatilityScore, weight: 1 },
    { rule: "STRONG_TREND_ADX", passed: bar.adx >= STRONG_ADX_THRESHOLD, value: bar.adx, weight: 1 },
    { rule: "MODERATE_TREND_ADX", passed: bar.adx >= TREND_ADX_THRESHOLD, value: bar.adx, weight: 1 },
    { rule: "TREND_DIRECTION_UP", passed: trendScore > 0, value: trendScore, weight: 1 },
    { rule: "TREND_DIRECTION_DOWN", passed: trendScore < 0, value: trendScore, weight: 1 },
    { rule: "RANGE_CONDITION", passed: rangeScore >= RANGE_SCORE_THRESHOLD, value: rangeScore, weight: 1 },
    { rule: "BREAKOUT_CONDITION", passed: breakoutScore >= BREAKOUT_SCORE_THRESHOLD, value: breakoutScore, weight: 1 },
  ];

  let regime: MarketRegime;
  if (volatilityScore >= HIGH_VOL_THRESHOLD) regime = "HIGH_VOLATILITY";
  else if (volatilityScore <= LOW_VOL_THRESHOLD) regime = "LOW_VOLATILITY";
  else if (bar.adx >= STRONG_ADX_THRESHOLD && trendScore > 0) regime = "STRONG_UPTREND";
  else if (bar.adx >= STRONG_ADX_THRESHOLD && trendScore < 0) regime = "STRONG_DOWNTREND";
  else if (bar.adx >= TREND_ADX_THRESHOLD && trendScore > 0) regime = "UPTREND";
  else if (bar.adx >= TREND_ADX_THRESHOLD && trendScore < 0) regime = "DOWNTREND";
  else if (rangeScore >= RANGE_SCORE_THRESHOLD) regime = "RANGE";
  else if (breakoutScore >= BREAKOUT_SCORE_THRESHOLD) regime = "BREAKOUT";
  else regime = "UNKNOWN";

  return { regime, scores, rules };
}

function regimeConfidence(regime: MarketRegime, scores: RegimeScores, adx: number): number {
  switch (regime) {
    case "HIGH_VOLATILITY":
      return clamp(scores.volatilityScore, 0, 100);
    case "LOW_VOLATILITY":
      return clamp(100 - scores.volatilityScore, 0, 100);
    case "STRONG_UPTREND":
    case "STRONG_DOWNTREND":
      return clamp(adx, 0, 100);
    case "UPTREND":
    case "DOWNTREND":
      return clamp(adx * 2, 0, 100);
    case "RANGE":
      return clamp(scores.rangeScore, 0, 100);
    case "BREAKOUT":
      return clamp(scores.breakoutScore, 0, 100);
    default:
      return 0;
  }
}

function insufficientHistoryResult(input: RegimeDetectionInput, minHistory: number): RegimeDetectionResult {
  const { candles } = input;
  return {
    market: input.market,
    timeframe: input.timeframe,
    timestamp:
      candles.length > 0 ? candles[candles.length - 1].timestamp : new Date().toISOString(),
    regime: "UNKNOWN",
    confidenceScore: 0,
    rulesEvaluated: [
      {
        rule: "SUFFICIENT_HISTORY",
        passed: false,
        value: `${candles.length}/${minHistory} required candles`,
        weight: 1,
      },
    ],
    indicatorsSnapshot: input.indicators,
  };
}

/**
 * Rule-based, deterministic Market Regime Detector. No generative model
 * is involved anywhere in this file — every classification traces back
 * to candles and the indicator series computed from them.
 */
export function createRuleBasedRegimeDetector(): MarketRegimeDetector {
  return {
    id: "rule-based",

    detect(input: RegimeDetectionInput): RegimeDetectionResult {
      const { candles } = input;

      const maxWarmup = Math.max(
        EMA_9.warmupPeriod,
        EMA_20.warmupPeriod,
        ATR_14.warmupPeriod,
        ADX_14.warmupPeriod,
        RSI_14.warmupPeriod,
        MACD_12_26_9.warmupPeriod,
        VOLUME_AVERAGE_20.warmupPeriod,
        REALIZED_VOLATILITY_20.warmupPeriod,
        BREAKOUT_LOOKBACK + 1,
      );
      const minHistory = maxWarmup + CONFIRMATION_BARS - 1;

      if (candles.length < minHistory) {
        return insufficientHistoryResult(input, minHistory);
      }

      const ema9Map = toTimestampMap(EMA_9.compute(candles));
      const ema20Map = toTimestampMap(EMA_20.compute(candles));
      const atrSeries = ATR_14.compute(candles);
      const atrMap = toTimestampMap(atrSeries);
      const adxMap = toTimestampMap(ADX_14.compute(candles));
      const rsiMap = toTimestampMap(RSI_14.compute(candles));
      const macdMap = toTimestampMap(MACD_12_26_9.compute(candles));
      const volAvgMap = toTimestampMap(VOLUME_AVERAGE_20.compute(candles));
      const rvolSeries = REALIZED_VOLATILITY_20.compute(candles);
      const rvolMap = toTimestampMap(rvolSeries);

      const medianRVol = median(rvolSeries.map((v) => v.value));
      const medianAtr = median(atrSeries.map((v) => v.value));

      const rawSeries: RawClassification[] = [];

      for (let i = maxWarmup - 1; i < candles.length; i++) {
        const c = candles[i];
        const ema9 = ema9Map.get(c.timestamp);
        const ema20 = ema20Map.get(c.timestamp);
        const atr = atrMap.get(c.timestamp);
        const adx = adxMap.get(c.timestamp);
        const rsi = rsiMap.get(c.timestamp);
        const macd = macdMap.get(c.timestamp);
        const volAvg = volAvgMap.get(c.timestamp);
        const rvol = rvolMap.get(c.timestamp);
        if (!ema9 || !ema20 || !atr || !adx || !rsi || !macd || !volAvg || !rvol) continue;

        const windowStart = Math.max(0, i - BREAKOUT_LOOKBACK);
        const priorCandles = candles.slice(windowStart, i);
        const priorHigh =
          priorCandles.length > 0 ? Math.max(...priorCandles.map((p) => p.high)) : c.high;
        const priorLow =
          priorCandles.length > 0 ? Math.min(...priorCandles.map((p) => p.low)) : c.low;

        const bar: BarInputs = {
          close: c.close,
          ema9: ema9.value,
          ema20: ema20.value,
          atr: atr.value,
          adx: adx.adx,
          plusDI: adx.plusDI,
          minusDI: adx.minusDI,
          rsi: rsi.value,
          macdHistogram: macd.histogram,
          realizedVolatility: rvol.value,
          averageVolume: volAvg.value,
          currentVolume: c.volume,
          priorHigh,
          priorLow,
        };

        rawSeries.push(classifyBar(bar, medianRVol, medianAtr));
      }

      if (rawSeries.length === 0) {
        return insufficientHistoryResult(input, minHistory);
      }

      // Confirmation-bar hysteresis (see CONFIRMATION_BARS doc comment
      // above): walk the raw classification series forward and only
      // "confirm" a regime once it has held for CONFIRMATION_BARS
      // consecutive bars, damping single-bar noise without any state
      // external to this call.
      let confirmedRegime: MarketRegime = "UNKNOWN";
      let previousConfirmedRegime: MarketRegime | undefined;
      let streakValue: MarketRegime | null = null;
      let streakCount = 0;

      for (const entry of rawSeries) {
        streakCount = entry.regime === streakValue ? streakCount + 1 : 1;
        streakValue = entry.regime;
        if (streakCount >= CONFIRMATION_BARS && entry.regime !== confirmedRegime) {
          previousConfirmedRegime = confirmedRegime;
          confirmedRegime = entry.regime;
        }
      }

      const last = rawSeries[rawSeries.length - 1];
      const lastCandle = candles[candles.length - 1];
      const lastAdx = adxMap.get(lastCandle.timestamp)?.adx ?? 0;

      return {
        market: input.market,
        timeframe: input.timeframe,
        timestamp: lastCandle.timestamp,
        regime: confirmedRegime,
        previousRegime: previousConfirmedRegime,
        confidenceScore: regimeConfidence(confirmedRegime, last.scores, lastAdx),
        rulesEvaluated: last.rules,
        indicatorsSnapshot: input.indicators,
        scores: last.scores,
      };
    },
  };
}
