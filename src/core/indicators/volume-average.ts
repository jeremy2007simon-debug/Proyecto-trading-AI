import type { Candle } from "@/core/market-data/types";
import type { Indicator, VolumeAverageValue } from "@/core/indicators/types";

/** Trailing simple average of `volume` over `period`. */
export function createVolumeAverage(period: number): Indicator<VolumeAverageValue> {
  return {
    id: `volavg${period}`,
    name: `Volume Average(${period})`,
    warmupPeriod: period,

    compute(candles: readonly Candle[]): VolumeAverageValue[] {
      if (candles.length < period) return [];

      const values: VolumeAverageValue[] = [];
      let windowSum = 0;
      for (let i = 0; i < candles.length; i++) {
        windowSum += candles[i].volume;
        if (i >= period) windowSum -= candles[i - period].volume;
        if (i >= period - 1) {
          values.push({ timestamp: candles[i].timestamp, value: windowSum / period });
        }
      }
      return values;
    },
  };
}

export const VOLUME_AVERAGE_20 = createVolumeAverage(20);
