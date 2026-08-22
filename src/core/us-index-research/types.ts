/**
 * Block 8.3 (US Index Top-5 Deep Research) — a standalone, ISOLATED
 * research module, same isolation convention as Block 8.2's
 * `portfolio-research/types.ts`: zero imports from
 * `@/core/paper-trading` (RS3M's own execution/candidate code) and zero
 * imports from `@/core/backtesting` engine internals EXCEPT the
 * generic, asset-agnostic pure-math/statistics modules already designed
 * to be reused across research rounds (`deflated-sharpe.ts`,
 * `classification.ts`, `break-even-cost.ts`,
 * `relative-strength.ts`/`benchmarks.ts` for the monthly-rotation
 * shape, `monthly-monte-carlo.ts`) — see each family module's own
 * docstring for exactly which of those it reuses and why.
 *
 * Families 1/3/5 are DAILY-native (a vol-managed/regime/hybrid strategy
 * decides its position once per trading day, at the prior close) —
 * distinct from Block 8.2's MONTHLY-native FX engine, because equity
 * index vol-targeting and regime detection need daily granularity to
 * mean anything. Family 4 (rotation) is monthly-native, same cadence as
 * RS3M, and reuses `relative-strength.ts` directly. Family 2 (intraday
 * momentum) is trade-based and uses the existing event-driven
 * backtesting engine (`@/core/backtesting`) with a new `Strategy`
 * implementation — see `src/core/strategy-manager/strategies/research/
 * vwap-reclaim-momentum.strategy.ts`.
 *
 * Every family ultimately produces a MONTHLY return series (daily
 * families are aggregated to monthly — see `daily-series.ts`'s
 * `aggregateDailyToMonthly`) so all five can share ONE set of
 * statistical machinery (OOS split, walk-forward, Monte Carlo, DSR,
 * sample quality) — all reused UNCHANGED from
 * `@/core/portfolio-research/{oos-split,walk-forward}.ts` (both are
 * already generic over `T[]`, not FX-specific despite their file
 * location) and `@/core/backtesting/research/{deflated-sharpe,
 * monthly-monte-carlo}.ts`.
 */

export interface UsIndexDailyBar {
  /** YYYY-MM-DD, Eastern trading date. */
  date: string;
  open: number;
  high: number;
  low: number;
  /** Raw/unadjusted close — kept for audit/comparison; NEVER used to compute strategy returns (see `data-adjustment.test.ts`). */
  close: number;
  /** Dividend + split adjusted close — the ONLY price series every family's signal/return computation reads. */
  adjClose: number;
  volume: number;
}

export interface UsIndexIntradayBar {
  /** ISO-8601 UTC instant. */
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type UsIndexMarket = "SPY" | "QQQ" | "IWM" | "DIA";

/** One day's realized return + the causal (as-of-yesterday's-close) volatility reading a strategy was allowed to use when deciding TODAY's exposure. */
export interface DailyReturnPoint {
  date: string;
  /** (adjClose[t] / adjClose[t-1]) - 1. `undefined` for the first bar (no prior close). */
  dailyReturn: number | undefined;
  /** Trailing annualized realized volatility (log-return stdev) computed ONLY from bars up to and including `date` — i.e. known BY the close of `date`, usable for tomorrow's exposure decision. `undefined` until the lookback window is full. */
  trailingRealizedVolPct: number | undefined;
  /** ATR(14)-based annualized volatility proxy, same causal convention as `trailingRealizedVolPct`. `undefined` until warmup completes. */
  trailingAtrVolPct: number | undefined;
}

/** A monthly return series, %, e.g. `2.5` = +2.5% — the common currency every family's results are expressed in for OOS/WF/MC/DSR. */
export interface MonthlyReturnSeries {
  months: string[]; // YYYY-MM, chronological
  returnsPct: number[]; // returnsPct[i] realized DURING months[i]
}
