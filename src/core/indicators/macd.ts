import { createEma } from "@/core/indicators/ema";
import type { Candle } from "@/core/market-data/types";
import type { Indicator, MacdValue } from "@/core/indicators/types";

function emaOfSeries(series: readonly number[], period: number): number[] {
  if (series.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];

  let sum = 0;
  for (let i = 0; i < period; i++) sum += series[i];
  let ema = sum / period;
  out.push(ema);

  for (let i = period; i < series.length; i++) {
    ema = series[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

/** MACD = EMA(fast) - EMA(slow); signal = EMA(signalPeriod) of the MACD line; histogram = macd - signal. */
export function createMacd(fast = 12, slow = 26, signalPeriod = 9): Indicator<MacdValue> {
  const fastEma = createEma(fast);
  const slowEma = createEma(slow);

  return {
    id: `macd${fast}_${slow}_${signalPeriod}`,
    name: `MACD(${fast},${slow},${signalPeriod})`,
    warmupPeriod: slow + signalPeriod - 1,

    compute(candles: readonly Candle[]): MacdValue[] {
      if (candles.length < slow + signalPeriod - 1) return [];

      const fastValues = fastEma.compute(candles);
      const slowValues = slowEma.compute(candles);
      const fastByTimestamp = new Map(fastValues.map((v) => [v.timestamp, v.value]));

      const macdLine = slowValues
        .map((slowVal) => {
          const fastVal = fastByTimestamp.get(slowVal.timestamp);
          return fastVal === undefined
            ? null
            : { timestamp: slowVal.timestamp, value: fastVal - slowVal.value };
        })
        .filter((v): v is { timestamp: string; value: number } => v !== null);

      const signalValues = emaOfSeries(
        macdLine.map((m) => m.value),
        signalPeriod,
      );

      const values: MacdValue[] = [];
      for (let i = 0; i < signalValues.length; i++) {
        const macdIndex = i + signalPeriod - 1;
        const macd = macdLine[macdIndex].value;
        const signal = signalValues[i];
        values.push({
          timestamp: macdLine[macdIndex].timestamp,
          macd,
          signal,
          histogram: macd - signal,
        });
      }
      return values;
    },
  };
}

export const MACD_12_26_9 = createMacd(12, 26, 9);
