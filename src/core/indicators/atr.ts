import type { Candle } from "@/core/market-data/types";
import type { AtrValue, Indicator } from "@/core/indicators/types";

export function trueRange(current: Candle, previous: Candle): number {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close),
  );
}

/** Average True Range (Wilder smoothing). Needs a previous close, hence `period + 1` warmup. */
export function createAtr(period: number): Indicator<AtrValue> {
  return {
    id: `atr${period}`,
    name: `ATR(${period})`,
    warmupPeriod: period + 1,

    compute(candles: readonly Candle[]): AtrValue[] {
      if (candles.length < period + 1) return [];

      const trueRanges: number[] = [];
      for (let i = 1; i < candles.length; i++) {
        trueRanges.push(trueRange(candles[i], candles[i - 1]));
      }

      let sum = 0;
      for (let j = 0; j < period; j++) sum += trueRanges[j];
      let atr = sum / period;

      const values: AtrValue[] = [{ timestamp: candles[period].timestamp, value: atr }];

      for (let j = period; j < trueRanges.length; j++) {
        atr = (atr * (period - 1) + trueRanges[j]) / period;
        values.push({ timestamp: candles[j + 1].timestamp, value: atr });
      }
      return values;
    },
  };
}

export const ATR_14 = createAtr(14);
