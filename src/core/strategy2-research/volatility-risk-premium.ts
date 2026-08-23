import type { Candle } from "@/core/market-data/types";
import { SWING_ROUND_TRIP_BPS, type CostScenario } from "@/core/us-index-research/cost-model";
import type { Strategy2DayResult } from "@/core/strategy2-research/types";

/**
 * Block 9.x, Family E — Volatility Risk Premium.
 *
 * IMPORTANT — pre-registration §4/§11 scope: only E-A and E-C (the
 * SVXY-ETP path) are implemented here. E-B and E-D (SPY monthly put
 * credit spreads) require a historical SPY OPTIONS CHAIN (strikes,
 * bid/ask, by expiration, going back years) — no free, reliable source
 * for that exists in this environment (same class of gap Block 8.2 §8
 * already documented for Family 2/Economic-Momentum-FX's point-in-time
 * macro data). Per that exact precedent: DATA_INSUFFICIENT, decided
 * HERE, before any code for E-B/E-D was written — not fabricated from
 * a proxy, and not silently dropped. See the funnel runner's Stage 1
 * (data integrity) for where this is recorded.
 *
 * E-A/E-C are BOTH mandatory defined-risk structures per §16 of the
 * discovery report and §11 of the pre-registration: a standing LONG
 * SVXY position (SVXY is ITSELF the short-VIX-futures ETP — being long
 * it is what harvests the VRP, exactly the "short-vol-ETP holders"
 * exposure the discovery report's Feb-2018 Volmageddon case study
 * describes; being short SVXY would be the opposite, long-volatility
 * trade) with a HARD -15% stop, never naked/unbounded. The stop is
 * checked against the day's LOW (the worst point of the day for a long
 * position) — if breached, the position is marked closed AT the
 * -15%-from-entry level that day (a documented, conservative
 * approximation — no intraday tick data is available to find the
 * EXACT fill price/time), flat for the remainder of that day, and
 * reopened fresh at that day's close.
 */
export interface VrpConfig {
  stopLossPct: number; // e.g. 0.15 for a -15% hard stop
  /** When set, only short on days where the trailing-1-year VIX percentile (as of yesterday's close) is BELOW this percentile (E-C's filter). `undefined` for E-A's unconditional entry. */
  vixPercentileFilterBelow?: number;
}

export interface VixPoint {
  date: string;
  value: number;
}

function trailingPercentileRank(values: readonly number[], target: number): number {
  const below = values.filter((v) => v <= target).length;
  return below / values.length;
}

export function runVolatilityRiskPremiumBacktest(svxyCandles: readonly Candle[], vixSeries: readonly VixPoint[], config: VrpConfig, scenario: CostScenario): Strategy2DayResult[] {
  const sorted = [...svxyCandles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const sortedVix = [...vixSeries].sort((a, b) => a.date.localeCompare(b.date));
  const vixByDate = new Map(sortedVix.map((v) => [v.date, v.value]));
  const roundTripFraction = SWING_ROUND_TRIP_BPS[scenario] / 10_000;
  const vixLookbackDays = 252;

  const results: Strategy2DayResult[] = [];
  let entryPrice: number | undefined;
  let needsEntryCostCharge = false; // true exactly once, on the day a fresh short is opened (initial entry or a stop-triggered reopen)

  // Sliding window over `sortedVix`, advanced incrementally as `i` grows —
  // both series are chronological, so the window's start/end indices only
  // ever move forward, turning what would otherwise be an O(days *
  // vixHistoryLength) rescan into a single O(days + vixHistoryLength) pass.
  let windowStart = 0;
  let windowEnd = 0; // exclusive

  for (let i = 1; i < sorted.length; i++) {
    const date = sorted[i].timestamp.slice(0, 10);
    const priorClose = sorted[i - 1].close;
    const todayClose = sorted[i].close;
    const todayLow = sorted[i].low;
    if (!(priorClose > 0)) continue;

    // Causal VIX-percentile filter: uses only VIX levels known BY yesterday's close.
    let filterOk = true;
    if (config.vixPercentileFilterBelow !== undefined) {
      const yesterday = sorted[i - 1].timestamp.slice(0, 10);
      const windowFloor = addDaysApprox(yesterday, -vixLookbackDays);
      while (windowEnd < sortedVix.length && sortedVix[windowEnd].date < yesterday) windowEnd += 1;
      while (windowStart < windowEnd && sortedVix[windowStart].date < windowFloor) windowStart += 1;
      const window = sortedVix.slice(windowStart, windowEnd).map((v) => v.value);
      const yesterdayVix = vixByDate.get(yesterday);
      filterOk = window.length >= 60 && yesterdayVix !== undefined ? trailingPercentileRank(window, yesterdayVix) <= config.vixPercentileFilterBelow : false;
    }

    if (!filterOk) {
      if (entryPrice !== undefined) {
        // Filter turned off while in a position: close flat, no new cost beyond what's already been charged on entry days.
        entryPrice = undefined;
      }
      results.push({ date, grossReturn: 0, costDrag: 0, netReturn: 0, turnover: 0 });
      continue;
    }

    if (entryPrice === undefined) {
      // Enter fresh long at yesterday's close.
      entryPrice = priorClose;
      needsEntryCostCharge = true;
    }

    const worstCaseLossFromEntry = 1 - todayLow / entryPrice; // long P&L is negative when price falls
    const stopBreached = worstCaseLossFromEntry >= config.stopLossPct;

    if (stopBreached) {
      const grossReturn = -config.stopLossPct; // realized at the stop level, not the day's actual close-to-close move
      const entryCost = needsEntryCostCharge ? roundTripFraction : 0;
      const costDrag = roundTripFraction + entryCost; // cover the existing long (always), plus this day's own entry cost if not already charged
      results.push({ date, grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: entryCost > 0 ? 2 : 1 });
      entryPrice = todayClose; // reopened fresh at today's close
      needsEntryCostCharge = true; // the reopen itself needs its cost charged — on the NEXT day this flag is consumed below
      continue;
    }

    const grossReturn = todayClose / priorClose - 1; // long daily mark-to-market
    const costDrag = needsEntryCostCharge ? roundTripFraction : 0;
    results.push({ date, grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: costDrag > 0 ? 1 : 0 });
    needsEntryCostCharge = false;
  }
  return results;
}

function addDaysApprox(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
