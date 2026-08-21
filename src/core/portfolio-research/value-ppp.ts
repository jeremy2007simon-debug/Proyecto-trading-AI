import { latestObservationAsOf, loadCpiSeries } from "@/core/portfolio-research/data-loaders";
import { INSTRUMENTS, MAJOR_INSTRUMENTS } from "@/core/portfolio-research/instruments";
import type { Currency, FxInstrument, MonthlySeries, RateObservation } from "@/core/portfolio-research/types";

/**
 * Block 8.2, Family 5 — a PPP-based Value definition, per this brief's
 * explicit requirement (§12): NOT "RSI low = value." Real exchange
 * rate = nominal rate deflated by the relative CPI index since a fixed
 * base date; a currency is "cheap" (Value signal = long) when its real
 * rate sits BELOW its own long-run historical average (i.e. it has
 * depreciated more than relative inflation would justify), and
 * "expensive" (Value signal = short) when above — the standard PPP
 * mean-reversion framing (Taylor 2002 "The Purchasing Power Parity
 * Debate"; consensus half-life of PPP deviations ~3-5 years per the
 * literature reviewed in the data audit, §8 of the report).
 *
 * CPI is used with a fixed 2-month publication lag (`CPI_LAG_MONTHS`)
 * — a documented, conservative simplification given real point-in-time
 * CPI vintages are not obtainable from this environment (§3.4, §3.5).
 * NOT claimed to be full vintage-aware correctness, but CPI revisions
 * are materially smaller than industrial-production/GDP-style data, so
 * a fixed lag is a defensible approximation here in a way it would not
 * be for Family 2 (Economic Momentum, marked DATA_INSUFFICIENT).
 */

const CPI_LAG_MONTHS = 2;
const PPP_BASELINE_WINDOW_MONTHS = 60; // 5 years — matches the literature's own half-life estimate

function shiftMonth(monthEnd: string, months: number): string {
  const [y, m] = monthEnd.slice(0, 7).split("-").map(Number);
  const total = y * 12 + (m - 1) - months;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, "0")}-28`; // any day within the target month works for a "<=" lookup
}

function cpiAsOf(series: readonly RateObservation[], monthEnd: string): number | undefined {
  const laggedAsOf = shiftMonth(monthEnd, CPI_LAG_MONTHS);
  return latestObservationAsOf(series, laggedAsOf)?.value;
}

export function loadAllCpiSeries(): Record<Currency, RateObservation[]> {
  const currencies: Currency[] = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];
  const out = {} as Record<Currency, RateObservation[]>;
  for (const ccy of currencies) out[ccy] = loadCpiSeries(ccy);
  return out;
}

/** log(real exchange rate) for one instrument's whole monthly series — nominal price deflated by relative CPI, log scale so later z-scoring is on a stable, symmetric measure. */
export function buildRealExchangeRateSeries(
  instrument: FxInstrument,
  nominal: MonthlySeries,
  cpi: Record<Currency, RateObservation[]>,
): { monthEnd: string; logRealRate: number }[] {
  const def = INSTRUMENTS[instrument];
  const out: { monthEnd: string; logRealRate: number }[] = [];
  for (const point of nominal.points) {
    const cpiLong = cpiAsOf(cpi[def.longCurrency], point.monthEnd);
    const cpiShort = cpiAsOf(cpi[def.shortCurrency], point.monthEnd);
    if (!cpiLong || !cpiShort || point.close <= 0) continue;
    // Nominal price P reads as "shortCurrency per 1 longCurrency" when
    // signConvention=1 (e.g. EURUSD), or its reciprocal role when -1 —
    // `INSTRUMENTS`' signConvention already encodes this; apply it here
    // so `logRealRate` is always "value of longCurrency" on a
    // consistent scale, matching `leg-returns.ts`'s own convention.
    const nominalLongPerShort = def.signConvention === 1 ? point.close : 1 / point.close;
    const realRate = nominalLongPerShort * (cpiShort / cpiLong);
    out.push({ monthEnd: point.monthEnd, logRealRate: Math.log(realRate) });
  }
  return out;
}

/** Value z-score per month: NEGATIVE of the real-rate's deviation from its own trailing mean (in trailing stdevs) — i.e. positive score = "cheap" = long signal, per this family's mean-reversion hypothesis. */
export function buildValueZScoreSeries(realRateSeries: readonly { monthEnd: string; logRealRate: number }[]): { monthEnd: string; zScore: number }[] {
  const out: { monthEnd: string; zScore: number }[] = [];
  for (let i = 0; i < realRateSeries.length; i++) {
    const start = Math.max(0, i - PPP_BASELINE_WINDOW_MONTHS + 1);
    const window = realRateSeries.slice(start, i + 1).map((r) => r.logRealRate);
    if (window.length < 24) continue; // require at least 2 years of baseline before scoring
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
    const stdev = Math.sqrt(variance);
    const zScore = stdev > 0 ? -(realRateSeries[i].logRealRate - mean) / stdev : 0;
    out.push({ monthEnd: realRateSeries[i].monthEnd, zScore });
  }
  return out;
}

/**
 * Value z-scores keyed by calendar MONTH (YYYY-MM), not exact date — this
 * is the key convention `alignReturnsByMonth` (`alignment.ts`) uses
 * everywhere else, since different instruments' last trading day of a
 * month can differ by a day or two. `familyFiveSignals`
 * (`family-signals.ts`) looks these up by the aligned grid's own month
 * keys, so Value lines up 1:1 with the Carry/Trend components it's
 * combined with.
 */
export function buildValueSignalsByMonthKey(
  monthlyByInstrument: Record<FxInstrument, MonthlySeries>,
  cpi: Record<Currency, RateObservation[]>,
): Partial<Record<FxInstrument, Map<string, number>>> {
  const out: Partial<Record<FxInstrument, Map<string, number>>> = {};
  for (const inst of MAJOR_INSTRUMENTS) {
    const real = buildRealExchangeRateSeries(inst, monthlyByInstrument[inst], cpi);
    const z = buildValueZScoreSeries(real);
    out[inst] = new Map(z.map((v) => [v.monthEnd.slice(0, 7), v.zScore]));
  }
  return out;
}
