import type { FxInstrument } from "@/core/portfolio-research/types";
import type { InstrumentReturnSeries } from "@/core/portfolio-research/leg-returns";

function monthKey(date: string): string {
  return date.slice(0, 7);
}

export interface AlignedReturns {
  /** Ascending, one per common rebalance month (YYYY-MM of `signalMonthEnd`). */
  monthKeys: string[];
  /** Per instrument, exactly `monthKeys.length` entries, index-aligned to `monthKeys`. */
  byInstrument: Partial<Record<FxInstrument, InstrumentReturnSeries["returns"]>>;
}

/**
 * Inner-joins several instruments' return series on the calendar month
 * of `signalMonthEnd` — different pairs can have their last trading
 * day of the month fall on slightly different dates, so cross-sectional
 * construction (Families 1/3/5) needs a common rebalance grid, not an
 * exact-date match. Returns only months present in EVERY series
 * provided, in ascending order — this is what makes every downstream
 * cross-sectional signal well-defined (every leg has a value on every
 * common date).
 */
export function alignReturnsByMonth(seriesList: readonly InstrumentReturnSeries[]): AlignedReturns {
  if (seriesList.length === 0) return { monthKeys: [], byInstrument: {} };

  const byInstrumentByMonth = new Map<FxInstrument, Map<string, InstrumentReturnSeries["returns"][number]>>();
  for (const series of seriesList) {
    const map = new Map<string, InstrumentReturnSeries["returns"][number]>();
    for (const entry of series.returns) map.set(monthKey(entry.signalMonthEnd), entry);
    byInstrumentByMonth.set(series.instrument, map);
  }

  const [first, ...rest] = seriesList;
  const commonMonths = [...new Set(first.returns.map((r) => monthKey(r.signalMonthEnd)))].filter((mk) =>
    rest.every((s) => byInstrumentByMonth.get(s.instrument)!.has(mk)),
  );
  commonMonths.sort();

  const byInstrument: Partial<Record<FxInstrument, InstrumentReturnSeries["returns"]>> = {};
  for (const series of seriesList) {
    const map = byInstrumentByMonth.get(series.instrument)!;
    byInstrument[series.instrument] = commonMonths.map((mk) => map.get(mk)!);
  }

  return { monthKeys: commonMonths, byInstrument };
}
