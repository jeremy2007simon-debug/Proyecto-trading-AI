import type { Candle } from "@/core/market-data/types";
import type { Indicator, RsiValue } from "@/core/indicators/types";

function toRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Relative Strength Index (Wilder smoothing). Purely a computed value —
 * this module makes no BUY/SELL interpretation of it (e.g. no ">70 =
 * SELL" rule); that judgment belongs to individual strategies.
 */
export function createRsi(period: number): Indicator<RsiValue> {
  return {
    id: `rsi${period}`,
    name: `RSI(${period})`,
    warmupPeriod: period + 1,

    compute(candles: readonly Candle[]): RsiValue[] {
      if (candles.length < period + 1) return [];

      let gainSum = 0;
      let lossSum = 0;
      for (let i = 1; i <= period; i++) {
        const change = candles[i].close - candles[i - 1].close;
        if (change > 0) gainSum += change;
        else lossSum += -change;
      }
      let avgGain = gainSum / period;
      let avgLoss = lossSum / period;

      const values: RsiValue[] = [
        { timestamp: candles[period].timestamp, value: toRsi(avgGain, avgLoss) },
      ];

      for (let i = period + 1; i < candles.length; i++) {
        const change = candles[i].close - candles[i - 1].close;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        values.push({ timestamp: candles[i].timestamp, value: toRsi(avgGain, avgLoss) });
      }
      return values;
    },
  };
}

export const RSI_14 = createRsi(14);
