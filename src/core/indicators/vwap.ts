import type { Candle } from "@/core/market-data/types";
import type { Indicator, VwapValue } from "@/core/indicators/types";
import type { MarketHoursCalendar } from "@/core/market-hours/types";

/**
 * Intraday VWAP, reset at the start of each trading session (per
 * `calendar.getSessionStartUTC`) rather than accumulated across days —
 * mixing sessions would produce a meaningless multi-day average.
 * Requires the instrument's real traded volume; if a future instrument
 * has no reliable volume figure, this indicator should not be trusted
 * for it (document that explicitly at the call site).
 */
export function createVwap(calendar: MarketHoursCalendar): Indicator<VwapValue> {
  return {
    id: "vwap",
    name: "VWAP",
    warmupPeriod: 1,

    compute(candles: readonly Candle[]): VwapValue[] {
      const values: VwapValue[] = [];
      let sessionKey: string | null = null;
      let cumulativePV = 0;
      let cumulativeVolume = 0;

      for (const candle of candles) {
        const key = calendar.getSessionStartUTC(new Date(candle.timestamp));
        if (key !== sessionKey) {
          sessionKey = key;
          cumulativePV = 0;
          cumulativeVolume = 0;
        }

        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        cumulativePV += typicalPrice * candle.volume;
        cumulativeVolume += candle.volume;

        const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : typicalPrice;
        const distancePct = vwap !== 0 ? ((candle.close - vwap) / vwap) * 100 : 0;
        values.push({ timestamp: candle.timestamp, value: vwap, distancePct });
      }
      return values;
    },
  };
}
