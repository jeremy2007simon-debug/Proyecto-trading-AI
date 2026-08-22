import type { Candle } from "@/core/market-data/types";
import type { Market } from "@/core/shared/types";
import type { DailyReturnPoint, MonthlyReturnSeries, UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";

/** Ticker -> logical `Market`, matching `INSTRUMENT_CONFIGS` (`@/core/market-data/instruments`). Kept local (not re-exported) since only `toAdjustedCandles` needs it. */
export const US_INDEX_TICKER_TO_MARKET: Record<UsIndexMarket, Market> = {
  SPY: "SP500",
  QQQ: "NASDAQ100",
  IWM: "RUSSELL2000",
  DIA: "DOWJONES",
};

const TRADING_DAYS_PER_YEAR = 252;

/**
 * Builds the causal daily-return + trailing-volatility series every
 * Family 1/3/5 signal reads. CAUSAL BY CONSTRUCTION: `trailingRealizedVolPct`
 * and `trailingAtrVolPct` at index `i` are computed ONLY from bars
 * `[i - lookbackDays + 1 .. i]` — never a bar after `i` — so a
 * strategy that decides tomorrow's exposure/signal from `series[i]` can
 * never see tomorrow's own return. `no-lookahead.test.ts` pins this
 * property with an explicit "mutate a future bar, confirm past values
 * are unchanged" check.
 *
 * Always reads `adjClose` (dividend+split adjusted) — never raw
 * `close` — so a return is never contaminated by an unadjusted
 * ex-dividend price drop being mistaken for a real market move (the
 * exact bug class this round's data audit specifically guards against;
 * see `data-adjustment.test.ts`).
 */
export function buildDailyReturnSeries(bars: readonly UsIndexDailyBar[], realizedVolLookbackDays: number, atrLookbackDays = 14): DailyReturnPoint[] {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const points: DailyReturnPoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const dailyReturn = i > 0 && sorted[i - 1].adjClose > 0 ? sorted[i].adjClose / sorted[i - 1].adjClose - 1 : undefined;

    const volWindow = sorted.slice(Math.max(0, i - realizedVolLookbackDays + 1), i + 1);
    const trailingRealizedVolPct = volWindow.length >= Math.min(10, realizedVolLookbackDays) ? computeAnnualizedRealizedVolPct(volWindow) : undefined;

    const atrWindow = sorted.slice(Math.max(0, i - atrLookbackDays + 1), i + 1);
    const trailingAtrVolPct = atrWindow.length >= atrLookbackDays ? computeAnnualizedAtrVolPct(sorted, i, atrLookbackDays) : undefined;

    points.push({ date: sorted[i].date, dailyReturn, trailingRealizedVolPct, trailingAtrVolPct });
  }
  return points;
}

/** Annualized stdev of daily log-returns (adjClose-based) over `window`. */
function computeAnnualizedRealizedVolPct(window: readonly UsIndexDailyBar[]): number {
  const logReturns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1].adjClose > 0 && window[i].adjClose > 0) logReturns.push(Math.log(window[i].adjClose / window[i - 1].adjClose));
  }
  if (logReturns.length < 2) return 0;
  const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
  const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

/**
 * ATR-based annualized volatility PROXY — documented as an APPROXIMATION,
 * distinct in kind from `computeAnnualizedRealizedVolPct`: True Range
 * (per Wilder) captures gap risk (uses high/low/prevClose, not just
 * close-to-close), simple (not exponentially-smoothed) rolling mean over
 * `lookbackDays` — a defensible simplification, disclosed rather than
 * presented as textbook Wilder ATR. `(meanTR / close) * sqrt(252)`
 * rescales a fractional daily-range figure onto the SAME annualized-%
 * scale as the realized-vol series above, so `vol-target.ts` can compare
 * either proxy against one `targetVolPct` with no unit mismatch.
 */
function computeAnnualizedAtrVolPct(sorted: readonly UsIndexDailyBar[], endIndex: number, lookbackDays: number): number {
  const trueRanges: number[] = [];
  for (let i = Math.max(1, endIndex - lookbackDays + 1); i <= endIndex; i++) {
    const bar = sorted[i];
    const prevClose = sorted[i - 1].adjClose;
    const tr = Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
    trueRanges.push(tr);
  }
  if (trueRanges.length === 0) return 0;
  const meanTr = trueRanges.reduce((s, v) => s + v, 0) / trueRanges.length;
  const close = sorted[endIndex].adjClose;
  return close > 0 ? (meanTr / close) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100 : 0;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * Compounds a DAILY return series (fractions, e.g. `0.01` = +1%) into a
 * MONTHLY series (%, matching every other family's convention) — the
 * bridge that lets Family 1/3/5 (daily-native) share the exact same
 * OOS/walk-forward/Monte-Carlo/DSR machinery Family 4 (monthly-native)
 * and Block 8.2 already use. `dates` and `dailyReturns` must be the SAME
 * length and chronologically aligned; a `dailyReturns[i]` of `undefined`
 * contributes 0% (a warmup/no-signal day, never fabricated).
 */
export function aggregateDailyToMonthly(dates: readonly string[], dailyReturns: readonly (number | undefined)[]): MonthlyReturnSeries {
  const months: string[] = [];
  const returnsPct: number[] = [];
  let currentMonth: string | undefined;
  let monthEquity = 1;

  for (let i = 0; i < dates.length; i++) {
    const mk = monthKey(dates[i]);
    if (mk !== currentMonth) {
      if (currentMonth !== undefined) {
        months.push(currentMonth);
        returnsPct.push((monthEquity - 1) * 100);
      }
      currentMonth = mk;
      monthEquity = 1;
    }
    monthEquity *= 1 + (dailyReturns[i] ?? 0);
  }
  if (currentMonth !== undefined) {
    months.push(currentMonth);
    returnsPct.push((monthEquity - 1) * 100);
  }
  return { months, returnsPct };
}

/** Compounds a daily return series (fractions) into an equity curve starting at 1 — shared by every family's own per-day metrics (CAGR, MaxDD, time-in-market) computed at DAILY resolution, more precise than the monthly-aggregated figures used for OOS/WF/MC. */
export function buildDailyEquityCurve(dailyReturns: readonly (number | undefined)[]): number[] {
  const curve: number[] = [];
  let equity = 1;
  for (const r of dailyReturns) {
    equity *= 1 + (r ?? 0);
    curve.push(equity);
  }
  return curve;
}

/**
 * Adapts `UsIndexDailyBar[]` (adjClose-based) into `Candle[]` so
 * Family 3/5's regime/trend/pullback signals can reuse the EXISTING,
 * already-tested indicator library (`@/core/indicators`: SMA/EMA/RSI/
 * ADX/ATR) instead of reimplementing them. Yahoo supplies only an
 * adjusted CLOSE, not adjusted open/high/low — every OHLC field is
 * scaled by the SAME per-bar ratio (`adjClose / close`) so the whole
 * bar stays internally consistent (no case where `close` reflects a
 * dividend adjustment but `high`/`low` don't) — a documented,
 * defensible simplification (dividends are a fraction of a percent for
 * these four ETFs, not a source of a large open/high/low distortion),
 * never presented as a directly-observed adjusted OHLC feed.
 */
export function toAdjustedCandles(bars: readonly UsIndexDailyBar[], ticker: UsIndexMarket): Candle[] {
  return [...bars]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bar) => {
      const ratio = bar.close > 0 ? bar.adjClose / bar.close : 1;
      return {
        market: US_INDEX_TICKER_TO_MARKET[ticker],
        timeframe: "1d",
        timestamp: `${bar.date}T00:00:00.000Z`,
        symbol: ticker,
        provider: "yahoo-adjusted",
        open: bar.open * ratio,
        high: bar.high * ratio,
        low: bar.low * ratio,
        close: bar.adjClose,
        volume: bar.volume,
      };
    });
}

export function computeMaxDrawdownPctFromCurve(curve: readonly number[]): number {
  let peak = 1;
  let maxDd = 0;
  for (const e of curve) {
    peak = Math.max(peak, e);
    maxDd = Math.max(maxDd, peak > 0 ? ((peak - e) / peak) * 100 : 0);
  }
  return maxDd;
}
