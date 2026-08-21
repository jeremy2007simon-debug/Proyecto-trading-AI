/**
 * Block 8.2 (FX Top-5 Deep Research) — a standalone, ISOLATED
 * portfolio-level research module. Deliberately NOT part of
 * `src/core/backtesting/**` (the single-strategy, intraday
 * event-driven engine RS3M's own verification scripts depend on) —
 * cross-sectional/multi-pair, monthly-rebalance strategies need a
 * different simulation shape (a rebalance-date loop over a basket of
 * instruments with vol-normalized position sizing) that does not fit
 * that engine's `BacktestConfig`/single-strategy-single-market
 * contract. Zero imports from `@/core/backtesting` engine internals or
 * `@/core/paper-trading` — only the generic, asset-agnostic pure-math
 * modules (`monte-carlo.ts`, `deflated-sharpe.ts`) are reused, exactly
 * as they were already designed to be (see those files' own
 * docstrings).
 */

export type Currency = "USD" | "EUR" | "GBP" | "JPY" | "AUD" | "CAD" | "CHF" | "NZD";

export type FxInstrument =
  | "EURUSD"
  | "GBPUSD"
  | "USDJPY"
  | "AUDUSD"
  | "USDCAD"
  | "USDCHF"
  | "NZDUSD"
  | "EURGBP"
  | "EURJPY"
  | "GBPJPY"
  | "AUDJPY";

export interface DailyBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface RateObservation {
  date: string; // YYYY-MM-DD
  value: number; // annualized %, e.g. 3.5 = 3.5%/yr
}

export interface MonthlyPricePoint {
  /** YYYY-MM-DD — the LAST daily bar's date on or before this calendar month's end (causal: never a future bar). */
  monthEnd: string;
  close: number;
  /** Trailing realized volatility (annualized, from daily returns in the `lookbackDays` window ending at `monthEnd`) — undefined until enough daily history exists. */
  trailingAnnualizedVol?: number;
}

export interface MonthlySeries {
  instrument: FxInstrument;
  points: MonthlyPricePoint[];
}

/**
 * Per-leg monthly return, ALREADY sign-adjusted to mean "return of
 * `longCurrency` vs `shortCurrency`" — see `instruments.ts` for the
 * sign convention per instrument (e.g. USDJPY rising means USD
 * strengthening vs JPY, so a "JPY vs USD" reading is the negated
 * price return).
 */
export interface LegReturn {
  monthEnd: string;
  longCurrency: Currency;
  shortCurrency: Currency;
  /** Pure spot return of longCurrency vs shortCurrency over the period ending at `monthEnd`. */
  spotReturn: number;
  /** Interest-rate-differential ("carry") component for the period, monthly-scaled — 0 for families that don't model carry explicitly (see cost-model.ts docstring). */
  carryReturn: number;
}

/** A named, reproducible position-sizing decision for one leg at one rebalance date — the audit trail for "why did we hold this." */
export interface LegPosition {
  monthEnd: string;
  instrument: FxInstrument;
  /** Signed, vol-normalized weight. Positive = long the instrument's base/first currency, negative = short it. */
  weight: number;
  rawSignal: number;
}

export interface PortfolioPeriodResult {
  /** The month the return was REALIZED (i.e. the rebalance-to-rebalance period ending here). */
  monthEnd: string;
  /** The month the POSITION was decided (one rebalance earlier than `monthEnd`) — the correct key to look up a causal, as-of-signal-date regime/carry/value reading against. */
  signalMonthEnd: string;
  grossReturn: number;
  costDrag: number;
  netReturn: number;
  turnover: number;
  activeLegs: number;
  /** Net exposure to USD specifically (sum of signed weights across legs where USD is the quote/base) — needed for §10's exposure/correlation analysis. */
  netUsdExposure: number;
}

export interface PortfolioBacktestResult {
  experimentId: string;
  periods: PortfolioPeriodResult[];
  positions: LegPosition[];
}
