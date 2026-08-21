import { latestObservationAsOf, loadRateSeries } from "@/core/portfolio-research/data-loaders";
import { INSTRUMENTS, MAJOR_INSTRUMENTS } from "@/core/portfolio-research/instruments";
import type { Currency, FxInstrument, RateObservation } from "@/core/portfolio-research/types";

/**
 * Block 8.2, Family 3 — Carry. Interest-rate differential is real,
 * OBSERVED data (FRED IR3TIB01 series, §3.3 of the report), looked up
 * CAUSALLY (`latestObservationAsOf` never reads an observation dated
 * after the query date). Monthly carry return ≈ (rate_long -
 * rate_short) / 12, the standard first-order approximation used
 * throughout the cited literature (Lustig & Verdelhan 2007;
 * Brunnermeier, Nagel & Pedersen 2008).
 */

export function loadAllRateSeries(): Record<Currency, RateObservation[]> {
  const currencies: Currency[] = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];
  const out = {} as Record<Currency, RateObservation[]>;
  for (const ccy of currencies) out[ccy] = loadRateSeries(ccy);
  return out;
}

export function carryDifferentialMonthly(
  rates: Record<Currency, RateObservation[]>,
  longCurrency: Currency,
  shortCurrency: Currency,
  asOf: string,
): number | undefined {
  const longRate = latestObservationAsOf(rates[longCurrency], asOf);
  const shortRate = latestObservationAsOf(rates[shortCurrency], asOf);
  if (!longRate || !shortRate) return undefined;
  return (longRate.value - shortRate.value) / 100 / 12; // % annualized -> fraction, then to monthly
}

/** Per-instrument carry differential (rate of the instrument's longCurrency minus its shortCurrency), for every major instrument, at one date. Positive = the instrument's "long" currency currently pays more than its "short" currency. */
export function carryScoresAsOf(rates: Record<Currency, RateObservation[]>, asOf: string): Partial<Record<FxInstrument, number>> {
  const scores: Partial<Record<FxInstrument, number>> = {};
  for (const inst of MAJOR_INSTRUMENTS) {
    const def = INSTRUMENTS[inst];
    const diff = carryDifferentialMonthly(rates, def.longCurrency, def.shortCurrency, asOf);
    if (diff !== undefined) scores[inst] = diff;
  }
  return scores;
}
