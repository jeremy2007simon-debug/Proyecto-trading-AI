import { trueRange } from "@/core/indicators/atr";
import type { AdxValue, Indicator } from "@/core/indicators/types";
import type { Candle } from "@/core/market-data/types";

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Average Directional Index (Wilder). Needs `period` bars to seed the
 * smoothed +DM/-DM/TR, then another `period` DX values to seed the ADX
 * average itself — hence `warmupPeriod = 2 * period`. No single
 * threshold (e.g. "ADX > 25 = trending") is baked in here; the Market
 * Regime Detector decides how to weigh this value, and thresholds there
 * are configurable, not hardcoded truths.
 */
export function createAdx(period: number): Indicator<AdxValue> {
  return {
    id: `adx${period}`,
    name: `ADX(${period})`,
    warmupPeriod: 2 * period,

    compute(candles: readonly Candle[]): AdxValue[] {
      if (candles.length < 2 * period) return [];

      const rawPlusDM: number[] = [];
      const rawMinusDM: number[] = [];
      const rawTR: number[] = [];
      for (let i = 1; i < candles.length; i++) {
        const upMove = candles[i].high - candles[i - 1].high;
        const downMove = candles[i - 1].low - candles[i].low;
        rawPlusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
        rawMinusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
        rawTR.push(trueRange(candles[i], candles[i - 1]));
      }

      let smPlusDM = sum(rawPlusDM.slice(0, period));
      let smMinusDM = sum(rawMinusDM.slice(0, period));
      let smTR = sum(rawTR.slice(0, period));

      const plusDI: number[] = [smTR > 0 ? (100 * smPlusDM) / smTR : 0];
      const minusDI: number[] = [smTR > 0 ? (100 * smMinusDM) / smTR : 0];

      for (let j = period; j < rawTR.length; j++) {
        smPlusDM = smPlusDM - smPlusDM / period + rawPlusDM[j];
        smMinusDM = smMinusDM - smMinusDM / period + rawMinusDM[j];
        smTR = smTR - smTR / period + rawTR[j];
        plusDI.push(smTR > 0 ? (100 * smPlusDM) / smTR : 0);
        minusDI.push(smTR > 0 ? (100 * smMinusDM) / smTR : 0);
      }

      const dx = plusDI.map((pdi, idx) => {
        const mdi = minusDI[idx];
        const denom = pdi + mdi;
        return denom > 0 ? (100 * Math.abs(pdi - mdi)) / denom : 0;
      });

      if (dx.length < period) return [];

      let adx = sum(dx.slice(0, period)) / period;
      const values: AdxValue[] = [
        {
          timestamp: candles[period + (period - 1)].timestamp,
          adx,
          plusDI: plusDI[period - 1],
          minusDI: minusDI[period - 1],
        },
      ];

      for (let k = period; k < dx.length; k++) {
        adx = (adx * (period - 1) + dx[k]) / period;
        values.push({
          timestamp: candles[period + k].timestamp,
          adx,
          plusDI: plusDI[k],
          minusDI: minusDI[k],
        });
      }
      return values;
    },
  };
}

export const ADX_14 = createAdx(14);
