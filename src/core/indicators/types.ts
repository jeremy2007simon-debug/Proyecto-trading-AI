import type { Candle } from "@/core/market-data/types";

/**
 * Common contract for a technical indicator calculator. Each concrete
 * indicator (EMA, ATR, RSI, VWAP, ADX, ...) implements this so the
 * Market Regime Detector and every Strategy can consume indicators
 * without knowing their internal math.
 *
 * Indicators are pure functions over candle history: same candles in,
 * same values out. No side effects, no I/O.
 */
export interface Indicator<TValue> {
  readonly id: string;
  readonly name: string;
  /** Minimum number of candles required before a value can be produced. */
  readonly warmupPeriod: number;

  compute(candles: readonly Candle[]): TValue[];
}

export interface EmaValue {
  timestamp: string;
  value: number;
}

export interface AtrValue {
  timestamp: string;
  value: number;
}

export interface RsiValue {
  timestamp: string;
  value: number;
}

export interface VwapValue {
  timestamp: string;
  value: number;
  distancePct: number;
}

export interface AdxValue {
  timestamp: string;
  adx: number;
  plusDI: number;
  minusDI: number;
}

/**
 * Snapshot of the indicator values a caller (regime detector, strategy)
 * cares about for the most recent candle. Concrete strategies/regime
 * logic declare which subset of this they read; the indicator engine
 * is responsible for computing it once and sharing it, avoiding
 * duplicated computation across strategies.
 */
export interface IndicatorSnapshot {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  atr14?: number;
  rsi14?: number;
  vwap?: VwapValue;
  adx14?: AdxValue;
  realizedVolatility?: number;
  averageVolume?: number;
  currentVolume?: number;
}
