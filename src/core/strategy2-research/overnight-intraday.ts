import type { Candle } from "@/core/market-data/types";
import { INTRADAY_ROUND_TRIP_BPS, SWING_ROUND_TRIP_BPS, type CostScenario } from "@/core/us-index-research/cost-model";
import type { Strategy2DayResult } from "@/core/strategy2-research/types";

/**
 * Block 9.x, Family D — Overnight / Intraday Return Decomposition.
 * Pre-registration §4 (D-A..D-D): NO thresholds, NO filters, NO regime
 * conditioning — the simplest possible test of the raw decomposition.
 * Every config is unconditional (always in the same position every
 * trading day), so there is no signal-timing look-ahead risk to guard
 * against by construction — the only causality question is whether a
 * day's cost/return uses only that day's own open/close, never a
 * future bar, which is trivially true here.
 *
 * `SWING_ROUND_TRIP_BPS` charged once per day for a single-leg
 * overnight-only config (D-A/B/D — one full 0->1->0 turn per day,
 * matching the preset's own "round-trip bps per full unit of
 * turnover" definition). D-C additionally charges
 * `INTRADAY_ROUND_TRIP_BPS` for its separate intraday short leg, per
 * the pre-registration's cost table (§6).
 */
export function runOvernightOnlyBacktest(candles: readonly Candle[], scenario: CostScenario): Strategy2DayResult[] {
  const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const results: Strategy2DayResult[] = [];
  const roundTripFraction = SWING_ROUND_TRIP_BPS[scenario] / 10_000;

  for (let i = 1; i < sorted.length; i++) {
    const priorClose = sorted[i - 1].close;
    const todayOpen = sorted[i].open;
    if (!(priorClose > 0)) continue;
    const grossReturn = todayOpen / priorClose - 1;
    const costDrag = roundTripFraction; // one full round trip (enter at yesterday's close, exit at today's open) every day
    results.push({ date: sorted[i].timestamp.slice(0, 10), grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: 1 });
  }
  return results;
}

/** D-C — the full "tug of war": simultaneously long overnight (close->open) AND short intraday (open->close), as two independent sub-positions never netted against each other. */
export function runOvernightIntradayTugOfWarBacktest(candles: readonly Candle[], scenario: CostScenario): Strategy2DayResult[] {
  const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const results: Strategy2DayResult[] = [];
  const swingRoundTripFraction = SWING_ROUND_TRIP_BPS[scenario] / 10_000;
  const intradayRoundTripFraction = INTRADAY_ROUND_TRIP_BPS[scenario] / 10_000;

  for (let i = 1; i < sorted.length; i++) {
    const priorClose = sorted[i - 1].close;
    const todayOpen = sorted[i].open;
    const todayClose = sorted[i].close;
    if (!(priorClose > 0) || !(todayOpen > 0)) continue;

    const overnightLegReturn = todayOpen / priorClose - 1; // long
    const intradayLegReturn = -(todayClose / todayOpen - 1); // short
    const grossReturn = overnightLegReturn + intradayLegReturn;
    const costDrag = swingRoundTripFraction + intradayRoundTripFraction;
    results.push({ date: sorted[i].timestamp.slice(0, 10), grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: 2 });
  }
  return results;
}
