import { ADX_14 } from "@/core/indicators/adx";
import { ATR_14 } from "@/core/indicators/atr";
import { EMA_20, EMA_9 } from "@/core/indicators/ema";
import { MACD_12_26_9 } from "@/core/indicators/macd";
import { REALIZED_VOLATILITY_20 } from "@/core/indicators/realized-volatility";
import { createRollingPercentile } from "@/core/indicators/rolling-percentile";
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

/**
 * Trailing window (bars) used to rank the current ATR / realized
 * volatility against their own recent history (see
 * `createRollingPercentile`). Configurable via `createRuleBasedRegimeDetector`'s
 * `baselineWindow` option; not claimed to be optimal — a reasonable
 * research-phase default, to be revisited once backtesting exists.
 */
const DEFAULT_BASELINE_WINDOW = 60;

const STRONG_ADX_THRESHOLD = 35;
const TREND_ADX_THRESHOLD = 20;
const HIGH_VOL_THRESHOLD = 80;
const LOW_VOL_THRESHOLD = 20;
const RANGE_SCORE_THRESHOLD = 60;
const BREAKOUT_SCORE_THRESHOLD = 60;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  /** 0-100 rank of this bar's realized volatility within the trailing `baselineWindow`. */
  volatilityPercentile: number;
  /** 0-100 rank of this bar's ATR within the trailing `baselineWindow`. */
  atrPercentile: number;
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
 * of its inputs — `volatilityPercentile`/`atrPercentile` are each bar's
 * own rolling-window percentile (see `createRollingPercentile`), so
 * unlike a whole-series baseline they never shift depending on how much
 * extra history the caller requested beyond what the window needs.
 */
function classifyBar(bar: BarInputs): RawClassification {
  const emaAlignment = bar.ema9 > bar.ema20 ? 1 : -1;
  const diSign = bar.plusDI === bar.minusDI ? 0 : bar.plusDI > bar.minusDI ? 1 : -1;
  const trendScore = clamp(emaAlignment * 30 + diSign * bar.adx * 0.7, -100, 100);

  const volatilityScore = clamp(bar.volatilityPercentile, 0, 100);

  const brokeOutUp = bar.close > bar.priorHigh;
  const brokeOutDown = bar.close < bar.priorLow;
  const volumeRatio = bar.averageVolume > 0 ? bar.currentVolume / bar.averageVolume : 1;
  // ATR expansion bonus/penalty around the 50th percentile (its own
  // recent median), mirroring the old ratio-around-1.0 shape but
  // derived from a proper rolling baseline instead of a whole-series one.
  const atrExpansionTerm = (bar.atrPercentile - 50) * 0.5;
  const breakoutScore =
    brokeOutUp || brokeOutDown
      ? clamp(50 + (volumeRatio - 1) * 25 + atrExpansionTerm, 0, 100)
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

function insufficientHistoryResultAt(
  input: RegimeDetectionInput,
  timestamp: string,
  candleCount: number,
  minHistory: number,
): RegimeDetectionResult {
  return {
    market: input.market,
    timeframe: input.timeframe,
    timestamp,
    regime: "UNKNOWN",
    confidenceScore: 0,
    rulesEvaluated: [
      {
        rule: "SUFFICIENT_HISTORY",
        passed: false,
        value: `${candleCount}/${minHistory} required candles`,
        weight: 1,
      },
    ],
    indicatorsSnapshot: input.indicators,
  };
}

function insufficientHistoryResult(input: RegimeDetectionInput, minHistory: number): RegimeDetectionResult {
  const { candles } = input;
  const timestamp = candles.length > 0 ? candles[candles.length - 1].timestamp : new Date().toISOString();
  return insufficientHistoryResultAt(input, timestamp, candles.length, minHistory);
}

export interface RuleBasedRegimeDetectorConfig {
  /**
   * Trailing window (bars) for the ATR / realized-volatility rolling
   * percentile baselines. See `createRollingPercentile` and the
   * `DEFAULT_BASELINE_WINDOW` doc comment. Configurable per the
   * requirement that this baseline never be a fixed, unconfigurable
   * value — not claimed optimal.
   */
  baselineWindow?: number;
}

/**
 * Rule-based, deterministic Market Regime Detector. No generative model
 * is involved anywhere in this file — every classification traces back
 * to candles and the indicator series computed from them.
 */
export function createRuleBasedRegimeDetector(
  config: RuleBasedRegimeDetectorConfig = {},
): MarketRegimeDetector {
  const baselineWindow = config.baselineWindow ?? DEFAULT_BASELINE_WINDOW;
  const volatilityPercentileIndicator = createRollingPercentile(
    REALIZED_VOLATILITY_20,
    (v) => v.value,
    baselineWindow,
  );
  const atrPercentileIndicator = createRollingPercentile(ATR_14, (v) => v.value, baselineWindow);

  function computeMinHistory(): number {
    return (
      Math.max(
        EMA_9.warmupPeriod,
        EMA_20.warmupPeriod,
        ATR_14.warmupPeriod,
        ADX_14.warmupPeriod,
        RSI_14.warmupPeriod,
        MACD_12_26_9.warmupPeriod,
        VOLUME_AVERAGE_20.warmupPeriod,
        REALIZED_VOLATILITY_20.warmupPeriod,
        volatilityPercentileIndicator.warmupPeriod,
        atrPercentileIndicator.warmupPeriod,
        BREAKOUT_LOOKBACK + 1,
      ) +
      CONFIRMATION_BARS -
      1
    );
  }

  /**
   * Computes the confirmed regime AT EVERY BAR in ONE linear pass over
   * `candles`, instead of the O(n) work `detect()` does being repeated
   * O(n) times (once per bar) by a naive caller — which would make
   * anything that needs a per-bar regime series (the backtesting engine)
   * effectively O(n^2). Every indicator series and the confirmation-bar
   * hysteresis walk below are computed exactly ONCE here; `detect()` is
   * simply this function's last element, so its public behavior is
   * unchanged bit-for-bit — this is a pure internal factoring, not a
   * behavior change.
   */
  function detectSeries(input: RegimeDetectionInput): RegimeDetectionResult[] {
    const { candles } = input;
    const maxWarmup =
      computeMinHistory() - CONFIRMATION_BARS + 1;
    const minHistory = computeMinHistory();

    if (candles.length < minHistory) {
      return [insufficientHistoryResult(input, minHistory)];
    }

    const ema9Map = toTimestampMap(EMA_9.compute(candles));
    const ema20Map = toTimestampMap(EMA_20.compute(candles));
    const atrMap = toTimestampMap(ATR_14.compute(candles));
    const adxMap = toTimestampMap(ADX_14.compute(candles));
    const rsiMap = toTimestampMap(RSI_14.compute(candles));
    const macdMap = toTimestampMap(MACD_12_26_9.compute(candles));
    const volAvgMap = toTimestampMap(VOLUME_AVERAGE_20.compute(candles));
    const rvolMap = toTimestampMap(REALIZED_VOLATILITY_20.compute(candles));
    const volatilityPercentileMap = toTimestampMap(volatilityPercentileIndicator.compute(candles));
    const atrPercentileMap = toTimestampMap(atrPercentileIndicator.compute(candles));

    const rawSeries: (RawClassification & { timestamp: string; adx: number })[] = [];

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
      const volatilityPercentile = volatilityPercentileMap.get(c.timestamp);
      const atrPercentile = atrPercentileMap.get(c.timestamp);
      if (
        !ema9 || !ema20 || !atr || !adx || !rsi || !macd || !volAvg || !rvol ||
        !volatilityPercentile || !atrPercentile
      ) {
        continue;
      }

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
        volatilityPercentile: volatilityPercentile.percentile,
        atrPercentile: atrPercentile.percentile,
        averageVolume: volAvg.value,
        currentVolume: c.volume,
        priorHigh,
        priorLow,
      };

      rawSeries.push({ ...classifyBar(bar), timestamp: c.timestamp, adx: adx.adx });
    }

    if (rawSeries.length === 0) {
      return [insufficientHistoryResult(input, minHistory)];
    }

    // Confirmation-bar hysteresis (see CONFIRMATION_BARS doc comment
    // above): walk the raw classification series forward and only
    // "confirm" a regime once it has held for CONFIRMATION_BARS
    // consecutive bars, damping single-bar noise without any state
    // external to this call. State only ever flows forward (never looks
    // ahead), so the confirmed regime at position k depends solely on
    // rawSeries[0..k] — this is what makes per-bar results below valid
    // regardless of how much MORE data follows in `candles`.
    let confirmedRegime: MarketRegime = "UNKNOWN";
    let previousConfirmedRegime: MarketRegime | undefined;
    let streakValue: MarketRegime | null = null;
    let streakCount = 0;
    const results: RegimeDetectionResult[] = [];

    rawSeries.forEach((entry, rawIndex) => {
      streakCount = entry.regime === streakValue ? streakCount + 1 : 1;
      streakValue = entry.regime;
      if (streakCount >= CONFIRMATION_BARS && entry.regime !== confirmedRegime) {
        previousConfirmedRegime = confirmedRegime;
        confirmedRegime = entry.regime;
      }

      // Matches detect()'s upfront `candles.length < minHistory` gate,
      // applied per-position: fewer than CONFIRMATION_BARS raw
      // classifications means an equivalent-length standalone `detect()`
      // call on this exact prefix would refuse to classify at all
      // (insufficient history), not merely report an unconfirmed
      // regime via hysteresis. Keeping this in lockstep with `detect()`
      // is what makes `detectSeries` genuinely prefix-stable per bar.
      if (rawIndex < CONFIRMATION_BARS - 1) {
        results.push(insufficientHistoryResultAt(input, entry.timestamp, maxWarmup + rawIndex, minHistory));
        return;
      }

      results.push({
        market: input.market,
        timeframe: input.timeframe,
        timestamp: entry.timestamp,
        regime: confirmedRegime,
        previousRegime: previousConfirmedRegime,
        confidenceScore: regimeConfidence(confirmedRegime, entry.scores, entry.adx),
        rulesEvaluated: entry.rules,
        indicatorsSnapshot: input.indicators,
        scores: entry.scores,
      });
    });

    return results;
  }

  return {
    id: "rule-based",

    detect(input: RegimeDetectionInput): RegimeDetectionResult {
      const series = detectSeries(input);
      return series[series.length - 1];
    },

    detectSeries,
  };
}
