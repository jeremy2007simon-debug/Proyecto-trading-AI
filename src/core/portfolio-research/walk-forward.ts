/**
 * Block 8.2 — month-count-based walk-forward windows (the monthly
 * analog of `core/backtesting/walk-forward.ts`'s bar-count windows,
 * reimplemented rather than imported for the same dependency-isolation
 * reason as `oos-split.ts`). Sized for THIS research's real available
 * history (~180 months minus per-signal warmup, not Block 8's ~2-3
 * years) — smaller than Block 8's own window config, fitted to what the
 * data actually supports, never tuned to make more windows "pass."
 */
export interface MonthlyWalkForwardConfig {
  trainMonths: number;
  forwardMonths: number;
  stepMonths: number;
}

export const DEFAULT_MONTHLY_WALK_FORWARD: MonthlyWalkForwardConfig = { trainMonths: 60, forwardMonths: 12, stepMonths: 12 };

export interface MonthlyWalkForwardWindow<T> {
  windowIndex: number;
  train: T[];
  forward: T[];
}

export function buildMonthlyWalkForwardWindows<T>(items: readonly T[], config: MonthlyWalkForwardConfig = DEFAULT_MONTHLY_WALK_FORWARD): MonthlyWalkForwardWindow<T>[] {
  const windowSize = config.trainMonths + config.forwardMonths;
  const windows: MonthlyWalkForwardWindow<T>[] = [];
  let start = 0;
  let windowIndex = 0;
  while (start + windowSize <= items.length) {
    const trainEnd = start + config.trainMonths;
    windows.push({ windowIndex, train: items.slice(start, trainEnd) as T[], forward: items.slice(trainEnd, start + windowSize) as T[] });
    start += config.stepMonths;
    windowIndex += 1;
  }
  return windows;
}
