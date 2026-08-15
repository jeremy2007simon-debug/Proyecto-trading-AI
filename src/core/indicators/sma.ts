import type { Candle } from "@/core/market-data/types";
import type { Indicator, SmaValue } from "@/core/indicators/types";

/** Simple Moving Average — trailing arithmetic mean of `close` over `period`. */
export function createSma(period: number): Indicator<SmaValue> {
  return {
    id: `sma${period}`,
    name: `SMA(${period})`,
    warmupPeriod: period,

    compute(candles: readonly Candle[]): SmaValue[] {
      if (candles.length < period) return [];

      const values: SmaValue[] = [];
      let windowSum = 0;
      for (let i = 0; i < candles.length; i++) {
        windowSum += candles[i].close;
        if (i >= period) windowSum -= candles[i - period].close;
        if (i >= period - 1) {
          values.push({ timestamp: candles[i].timestamp, value: windowSum / period });
        }
      }
      return values;
    },
  };
}

export const SMA_20 = createSma(20);
