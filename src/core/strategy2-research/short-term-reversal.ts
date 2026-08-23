import type { Candle } from "@/core/market-data/types";
import { SWING_ROUND_TRIP_BPS, type CostScenario } from "@/core/us-index-research/cost-model";
import { alignByDate } from "@/core/strategy2-research/multi-asset";
import type { Strategy2DayResult } from "@/core/strategy2-research/types";

const TICKERS = ["SPY", "QQQ", "IWM", "DIA"] as const;

function quantile(sorted: readonly number[], q: number): number {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Block 9.x, Family C — C-A/C-B: time-series reversal. Long for 1
 * trading day whenever yesterday's close-to-close return falls in the
 * bottom decile of its own trailing 252-trading-day return
 * distribution (the 252 returns ending at, and including, yesterday's
 * own). CAUSAL: day `i`'s entry decision, and the decile threshold it
 * is compared against, both use only returns known by the close of
 * day `i-1` — never day `i`'s own not-yet-realized return.
 */
/**
 * `decileThreshold` defaults to the frozen base value (0.1 = bottom
 * decile, per the pre-registration) — the optional override exists
 * ONLY for the funnel's own parameter-robustness sensitivity sweep
 * (pre-registration §10.6: "checked via the same kind of ±5%/±10%
 * perturbation sensitivity sweep... applied prospectively"), never to
 * change the frozen base config itself.
 */
export function runTimeSeriesReversalBacktest(candles: readonly Candle[], scenario: CostScenario, decileThreshold = 0.1): Strategy2DayResult[] {
  const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const returns: (number | undefined)[] = sorted.map((c, i) => (i === 0 ? undefined : c.close / sorted[i - 1].close - 1));
  const results: Strategy2DayResult[] = [];
  const roundTripFraction = SWING_ROUND_TRIP_BPS[scenario] / 10_000;
  const lookback = 252;

  for (let i = lookback + 1; i < sorted.length; i++) {
    const yesterdayReturn = returns[i - 1];
    if (yesterdayReturn === undefined) continue;
    const window = returns.slice(i - 1 - lookback, i - 1).filter((r): r is number => r !== undefined);
    if (window.length < lookback) continue;
    const sortedWindow = [...window].sort((a, b) => a - b);
    const bottomDecile = quantile(sortedWindow, decileThreshold);

    const triggered = yesterdayReturn <= bottomDecile;
    const grossReturn = triggered ? sorted[i].close / sorted[i - 1].close - 1 : 0;
    const costDrag = triggered ? roundTripFraction : 0;
    results.push({ date: sorted[i].timestamp.slice(0, 10), grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: triggered ? 1 : 0 });
  }
  return results;
}

function monthOrWeekKey(dateIso: string, mode: "week"): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday of this ISO week
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNumber = 1 + Math.round(((target.valueOf() - firstThursday.valueOf()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  void mode;
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

/**
 * Block 9.x, Family C — C-C (daily) / C-D (weekly): cross-sectional
 * reversal. Each period, go long (unconditionally — no decile filter)
 * the single worst performer among {SPY, QQQ, IWM, DIA} over the PRIOR
 * period, held for the current period. CAUSAL: the ranking always uses
 * strictly-prior-period returns, applied to the current, not-yet-
 * realized period.
 */
export function runCrossSectionalReversalBacktest(
  candlesByTicker: Readonly<Record<(typeof TICKERS)[number], readonly Candle[]>>,
  frequency: "daily" | "weekly",
  scenario: CostScenario,
): Strategy2DayResult[] {
  const aligned = alignByDate(candlesByTicker);
  const dates = aligned.SPY.map((c) => c.timestamp.slice(0, 10));
  const returnsByTicker: Record<string, number[]> = {};
  for (const t of TICKERS) {
    const series = aligned[t];
    returnsByTicker[t] = series.map((c, i) => (i === 0 ? 0 : c.close / series[i - 1].close - 1));
  }
  const roundTripFraction = SWING_ROUND_TRIP_BPS[scenario] / 10_000;
  const results: Strategy2DayResult[] = [];

  if (frequency === "daily") {
    let currentLong: string | undefined;
    for (let i = 1; i < dates.length; i++) {
      // Rank yesterday's (i-1) returns to decide today's (i) position.
      const priorReturns = TICKERS.map((t) => ({ ticker: t, r: returnsByTicker[t][i - 1] }));
      const worst = [...priorReturns].sort((a, b) => a.r - b.r)[0].ticker;
      const changed = worst !== currentLong;
      const grossReturn = returnsByTicker[worst][i];
      const costDrag = changed ? roundTripFraction : 0; // only pay when the position actually rotates
      results.push({ date: dates[i], grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: changed ? 1 : 0 });
      currentLong = worst;
    }
    return results;
  }

  // Weekly: group by ISO week, rank the PRIOR week's compounded return, hold the worst for the CURRENT week.
  const weekKeys = dates.map((d) => monthOrWeekKey(d, "week"));
  const weekBoundaries: number[] = [0];
  for (let i = 1; i < weekKeys.length; i++) if (weekKeys[i] !== weekKeys[i - 1]) weekBoundaries.push(i);
  weekBoundaries.push(dates.length);

  let currentLong: string | undefined;
  for (let w = 1; w < weekBoundaries.length - 1; w++) {
    const priorStart = weekBoundaries[w - 1];
    const priorEnd = weekBoundaries[w]; // exclusive
    const thisStart = weekBoundaries[w];
    const thisEnd = weekBoundaries[w + 1]; // exclusive

    const priorWeekReturn = (ticker: string) => {
      let equity = 1;
      for (let i = priorStart; i < priorEnd; i++) equity *= 1 + returnsByTicker[ticker][i];
      return equity - 1;
    };
    const worst = [...TICKERS].map((t) => ({ ticker: t, r: priorWeekReturn(t) })).sort((a, b) => a.r - b.r)[0].ticker;
    const changed = worst !== currentLong;
    let firstDay = true;
    for (let i = thisStart; i < thisEnd; i++) {
      const grossReturn = returnsByTicker[worst][i];
      const costDrag = firstDay && changed ? roundTripFraction : 0;
      results.push({ date: dates[i], grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: firstDay && changed ? 1 : 0 });
      firstDay = false;
    }
    currentLong = worst;
  }
  return results;
}
