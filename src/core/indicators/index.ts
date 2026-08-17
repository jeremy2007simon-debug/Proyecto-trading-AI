import { ADX_14 } from "@/core/indicators/adx";
import { ATR_14 } from "@/core/indicators/atr";
import { EMA_20, EMA_200, EMA_50, EMA_9 } from "@/core/indicators/ema";
import { MACD_12_26_9 } from "@/core/indicators/macd";
import { REALIZED_VOLATILITY_20 } from "@/core/indicators/realized-volatility";
import { RSI_14 } from "@/core/indicators/rsi";
import { SMA_20 } from "@/core/indicators/sma";
import type { IndicatorSnapshot } from "@/core/indicators/types";
import { createVwap } from "@/core/indicators/vwap";
import { VOLUME_AVERAGE_20 } from "@/core/indicators/volume-average";
import type { Candle } from "@/core/market-data/types";
import type { MarketHoursCalendar } from "@/core/market-hours/types";

export * from "@/core/indicators/adx";
export * from "@/core/indicators/atr";
export * from "@/core/indicators/ema";
export * from "@/core/indicators/macd";
export * from "@/core/indicators/realized-volatility";
export * from "@/core/indicators/rolling-percentile";
export * from "@/core/indicators/rsi";
export * from "@/core/indicators/sma";
export * from "@/core/indicators/volume-average";
export * from "@/core/indicators/vwap";

function last<T>(values: readonly T[]): T | undefined {
  return values.length > 0 ? values[values.length - 1] : undefined;
}

/**
 * Runs the default set of indicators once over `candles` and returns
 * only the latest value of each — the single function the Market Regime
 * Detector and the dashboard call, so every consumer computes on the
 * exact same series instead of duplicating indicator math.
 */
export function computeIndicatorSnapshot(
  candles: readonly Candle[],
  calendar: MarketHoursCalendar,
): IndicatorSnapshot {
  const snapshot: IndicatorSnapshot = {};

  const ema9 = last(EMA_9.compute(candles));
  if (ema9) snapshot.ema9 = ema9.value;

  const ema20 = last(EMA_20.compute(candles));
  if (ema20) snapshot.ema20 = ema20.value;

  const ema50 = last(EMA_50.compute(candles));
  if (ema50) snapshot.ema50 = ema50.value;

  const ema200 = last(EMA_200.compute(candles));
  if (ema200) snapshot.ema200 = ema200.value;

  const sma20 = last(SMA_20.compute(candles));
  if (sma20) snapshot.sma20 = sma20.value;

  const atr14 = last(ATR_14.compute(candles));
  if (atr14) snapshot.atr14 = atr14.value;

  const rsi14 = last(RSI_14.compute(candles));
  if (rsi14) snapshot.rsi14 = rsi14.value;

  const vwap = last(createVwap(calendar).compute(candles));
  if (vwap) snapshot.vwap = vwap;

  const macd = last(MACD_12_26_9.compute(candles));
  if (macd) snapshot.macd = macd;

  const adx14 = last(ADX_14.compute(candles));
  if (adx14) snapshot.adx14 = adx14;

  const averageVolume = last(VOLUME_AVERAGE_20.compute(candles));
  if (averageVolume) snapshot.averageVolume = averageVolume.value;

  const currentCandle = last(candles);
  if (currentCandle) snapshot.currentVolume = currentCandle.volume;

  const realizedVolatility = last(REALIZED_VOLATILITY_20.compute(candles));
  if (realizedVolatility) snapshot.realizedVolatility = realizedVolatility.value;

  return snapshot;
}

function toTimestampMap<T extends { timestamp: string }>(values: T[]): Map<string, T> {
  return new Map(values.map((v) => [v.timestamp, v]));
}

/**
 * Same fields as `computeIndicatorSnapshot`, but for EVERY bar in one
 * linear pass instead of only the latest — each indicator's `.compute()`
 * already returns its full causal series in O(n), so this is just
 * assembling per-timestamp snapshots from those series rather than
 * discarding all but the last value. Exists purely as a performance
 * escape hatch for callers (the backtesting engine) that would otherwise
 * call `computeIndicatorSnapshot` once per bar on a growing prefix — an
 * O(n^2) pattern for something this function computes in O(n).
 */
export function computeIndicatorSnapshotSeries(
  candles: readonly Candle[],
  calendar: MarketHoursCalendar,
): Map<string, IndicatorSnapshot> {
  const ema9Map = toTimestampMap(EMA_9.compute(candles));
  const ema20Map = toTimestampMap(EMA_20.compute(candles));
  const ema50Map = toTimestampMap(EMA_50.compute(candles));
  const ema200Map = toTimestampMap(EMA_200.compute(candles));
  const sma20Map = toTimestampMap(SMA_20.compute(candles));
  const atr14Map = toTimestampMap(ATR_14.compute(candles));
  const rsi14Map = toTimestampMap(RSI_14.compute(candles));
  const vwapMap = toTimestampMap(createVwap(calendar).compute(candles));
  const macdMap = toTimestampMap(MACD_12_26_9.compute(candles));
  const adx14Map = toTimestampMap(ADX_14.compute(candles));
  const volAvgMap = toTimestampMap(VOLUME_AVERAGE_20.compute(candles));
  const rvolMap = toTimestampMap(REALIZED_VOLATILITY_20.compute(candles));

  const series = new Map<string, IndicatorSnapshot>();
  for (const candle of candles) {
    const snapshot: IndicatorSnapshot = {};
    const ema9 = ema9Map.get(candle.timestamp);
    if (ema9) snapshot.ema9 = ema9.value;
    const ema20 = ema20Map.get(candle.timestamp);
    if (ema20) snapshot.ema20 = ema20.value;
    const ema50 = ema50Map.get(candle.timestamp);
    if (ema50) snapshot.ema50 = ema50.value;
    const ema200 = ema200Map.get(candle.timestamp);
    if (ema200) snapshot.ema200 = ema200.value;
    const sma20 = sma20Map.get(candle.timestamp);
    if (sma20) snapshot.sma20 = sma20.value;
    const atr14 = atr14Map.get(candle.timestamp);
    if (atr14) snapshot.atr14 = atr14.value;
    const rsi14 = rsi14Map.get(candle.timestamp);
    if (rsi14) snapshot.rsi14 = rsi14.value;
    const vwap = vwapMap.get(candle.timestamp);
    if (vwap) snapshot.vwap = vwap;
    const macd = macdMap.get(candle.timestamp);
    if (macd) snapshot.macd = macd;
    const adx14 = adx14Map.get(candle.timestamp);
    if (adx14) snapshot.adx14 = adx14;
    const averageVolume = volAvgMap.get(candle.timestamp);
    if (averageVolume) snapshot.averageVolume = averageVolume.value;
    snapshot.currentVolume = candle.volume;
    const realizedVolatility = rvolMap.get(candle.timestamp);
    if (realizedVolatility) snapshot.realizedVolatility = realizedVolatility.value;

    series.set(candle.timestamp, snapshot);
  }
  return series;
}
