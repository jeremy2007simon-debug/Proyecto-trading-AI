import type { Candle } from "@/core/market-data/types";
import { DEFAULT_DATASET_SPLIT, type DatasetSplitConfig, type DatasetSplitPeriod, type DatasetSplitResult } from "@/core/backtesting/types";

export interface DatasetSplitCandles {
  train: Candle[];
  validation: Candle[];
  outOfSample: Candle[];
}

function toPeriod(candles: readonly Candle[]): DatasetSplitPeriod {
  return {
    from: candles[0]?.timestamp ?? "",
    to: candles[candles.length - 1]?.timestamp ?? "",
    candleCount: candles.length,
  };
}

/**
 * Splits `candles` CHRONOLOGICALLY (by index — never shuffled) into
 * train/validation/out-of-sample. Trading data is a time series: mixing
 * bars randomly across the three sets would leak future information
 * into "training" and invalidate any out-of-sample claim. Percentages
 * are normalized if they don't sum to exactly 100 (defensive); any
 * rounding remainder is absorbed into `outOfSample` so `train.length +
 * validation.length + outOfSample.length` always equals `candles.length`
 * exactly.
 */
export function splitCandlesChronologically(
  candles: readonly Candle[],
  config: DatasetSplitConfig = DEFAULT_DATASET_SPLIT,
): DatasetSplitCandles {
  const totalPct = config.trainPct + config.validationPct + config.outOfSamplePct;
  const trainCount = Math.floor(candles.length * (config.trainPct / totalPct));
  const validationCount = Math.floor(candles.length * (config.validationPct / totalPct));

  return {
    train: candles.slice(0, trainCount) as Candle[],
    validation: candles.slice(trainCount, trainCount + validationCount) as Candle[],
    outOfSample: candles.slice(trainCount + validationCount) as Candle[],
  };
}

export function describeDatasetSplit(split: DatasetSplitCandles): DatasetSplitResult {
  return {
    train: toPeriod(split.train),
    validation: toPeriod(split.validation),
    outOfSample: toPeriod(split.outOfSample),
  };
}
