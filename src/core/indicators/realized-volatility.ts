import type { Candle } from "@/core/market-data/types";
import type { Indicator, RealizedVolatilityValue } from "@/core/indicators/types";

/** Standard deviation of log returns over a trailing window, expressed as a percentage. */
export function createRealizedVolatility(period: number): Indicator<RealizedVolatilityValue> {
  return {
    id: `rvol${period}`,
    name: `Realized Volatility(${period})`,
    warmupPeriod: period + 1,

    compute(candles: readonly Candle[]): RealizedVolatilityValue[] {
      if (candles.length < period + 1) return [];

      const logReturns: number[] = [];
      for (let i = 1; i < candles.length; i++) {
        logReturns.push(Math.log(candles[i].close / candles[i - 1].close));
      }

      const values: RealizedVolatilityValue[] = [];
      for (let end = period; end <= logReturns.length; end++) {
        const window = logReturns.slice(end - period, end);
        const mean = window.reduce((a, b) => a + b, 0) / period;
        const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
        const stdevPct = Math.sqrt(variance) * 100;
        values.push({ timestamp: candles[end].timestamp, value: stdevPct });
      }
      return values;
    },
  };
}

export const REALIZED_VOLATILITY_20 = createRealizedVolatility(20);
