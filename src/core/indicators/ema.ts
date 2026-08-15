import type { Candle } from "@/core/market-data/types";
import type { EmaValue, Indicator } from "@/core/indicators/types";

/**
 * Exponential Moving Average. Seeded with the simple average of the
 * first `period` closes (a common, well-defined convention — EMA
 * seeding is not universally standardized, so this choice is called out
 * explicitly rather than left implicit).
 */
export function createEma(period: number): Indicator<EmaValue> {
  return {
    id: `ema${period}`,
    name: `EMA(${period})`,
    warmupPeriod: period,

    compute(candles: readonly Candle[]): EmaValue[] {
      if (candles.length < period) return [];

      const k = 2 / (period + 1);
      const values: EmaValue[] = [];

      let sum = 0;
      for (let i = 0; i < period; i++) sum += candles[i].close;
      let ema = sum / period;
      values.push({ timestamp: candles[period - 1].timestamp, value: ema });

      for (let i = period; i < candles.length; i++) {
        ema = candles[i].close * k + ema * (1 - k);
        values.push({ timestamp: candles[i].timestamp, value: ema });
      }
      return values;
    },
  };
}

export const EMA_9 = createEma(9);
export const EMA_20 = createEma(20);
export const EMA_50 = createEma(50);
export const EMA_200 = createEma(200);
