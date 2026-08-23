import type { Candle } from "@/core/market-data/types";
import { SWING_ROUND_TRIP_BPS, type CostScenario } from "@/core/us-index-research/cost-model";
import type { Strategy2DayResult } from "@/core/strategy2-research/types";

/**
 * Block 9.x, Family M — Turn-of-Month / Calendar Seasonality.
 * Pre-registration §4: long from the close of the last trading day of
 * the month through the close of the 3rd trading day of the next
 * month (4 named calendar-window days, 3 realized return legs),
 * window definition reused unmodified from McConnell & Xu (2008) — not
 * re-derived from this project's own data.
 *
 * Month boundaries are derived DIRECTLY from the fetched trading-date
 * series itself (a bar whose calendar month differs from the prior
 * bar's is the first trading day of a new month; the prior bar is
 * therefore the last trading day of the old month) — deliberately not
 * routed through a separate calendar utility, since the two are
 * definitionally identical for any date that is actually present in
 * this project's own real market data, and this avoids a possible
 * mismatch between an external calendar table and what the data feed
 * itself actually traded on.
 */
function monthOf(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export function runTurnOfMonthBacktest(candles: readonly Candle[], scenario: CostScenario): Strategy2DayResult[] {
  const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const dates = sorted.map((c) => c.timestamp.slice(0, 10));
  const results: Strategy2DayResult[] = [];
  const roundTripFraction = SWING_ROUND_TRIP_BPS[scenario] / 10_000;

  for (let i = 0; i < sorted.length - 3; i++) {
    const isLastTradingDayOfMonth = monthOf(dates[i]) !== monthOf(dates[i + 1]);
    if (!isLastTradingDayOfMonth) continue;

    const entryClose = sorted[i].close; // close of last trading day of the month
    const exitClose = sorted[i + 3].close; // close of the 3rd trading day of the next month
    if (!(entryClose > 0)) continue;
    const grossReturn = exitClose / entryClose - 1;
    const costDrag = roundTripFraction; // one round trip per month
    // Attribute the whole multi-day window's return to its single exit date — this family trades once/month, so a monthly-aggregation-based metric (aggregateDailyToMonthly) sees exactly one non-zero entry per calendar month it fires in, which is the intended behavior.
    results.push({ date: dates[i + 3], grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: 1 });
  }
  return results;
}
