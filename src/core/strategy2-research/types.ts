/**
 * Block 9.x (Strategy #2 deep backtest) — shared day-result shape for
 * all 5 pre-registered families (`docs/BLOCK9_STRATEGY2_PREREGISTRATION.md`).
 * Same convention as `src/core/us-index-research/*.ts`'s own
 * `*DayResult` types (Block 8.3) — `netReturn` feeds directly into
 * `aggregateDailyToMonthly`/`buildDailyEquityCurve` (reused unmodified
 * from `@/core/us-index-research/daily-series`), so every family here
 * shares the exact same downstream OOS/walk-forward/Monte-Carlo/DSR
 * machinery regardless of its own signal logic.
 */
export interface Strategy2DayResult {
  date: string; // YYYY-MM-DD
  grossReturn: number;
  costDrag: number;
  netReturn: number;
  /** Sum of |weight change| across all legs that day — the turnover unit cost is charged against. */
  turnover: number;
}
