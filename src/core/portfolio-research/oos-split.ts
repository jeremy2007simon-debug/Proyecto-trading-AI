/**
 * Block 8.2 — chronological (never shuffled) OOS split by MONTH index,
 * same "train/validation/out-of-sample, time-ordered only" principle as
 * `core/backtesting/dataset-split.ts`, reimplemented here (not
 * imported) because it operates on `Candle[]`, not a generic array —
 * this file is deliberately dependency-free from the intraday engine
 * (see `types.ts`'s module docstring). The split point is FROZEN here,
 * in code, before this file was ever used against real portfolio
 * results — 70% train+validation / 30% OOS, reused unchanged for every
 * one of the 24 registered experiments.
 */
export const OOS_HOLDOUT_PCT = 30;

export function splitMonthsChronologically<T>(items: readonly T[]): { inSample: T[]; outOfSample: T[] } {
  const oosCount = Math.floor(items.length * (OOS_HOLDOUT_PCT / 100));
  const splitIndex = items.length - oosCount;
  return { inSample: items.slice(0, splitIndex), outOfSample: items.slice(splitIndex) };
}
