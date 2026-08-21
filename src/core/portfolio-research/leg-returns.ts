import { INSTRUMENTS } from "@/core/portfolio-research/instruments";
import { monthlyReturn } from "@/core/portfolio-research/monthly";
import type { FxInstrument, MonthlySeries } from "@/core/portfolio-research/types";

/** One instrument's sign-adjusted monthly return series: `returns[i]` is the return of `longCurrency` vs `shortCurrency` from `points[i]` to `points[i+1]`, dated at `points[i+1].monthEnd` (the date the return is REALIZED, not the date it was signaled from). */
export interface InstrumentReturnSeries {
  instrument: FxInstrument;
  /** Same length as `series.points.length - 1`. */
  returns: { monthEnd: string; signalMonthEnd: string; value: number; trailingAnnualizedVol: number | undefined }[];
}

export function buildInstrumentReturnSeries(series: MonthlySeries): InstrumentReturnSeries {
  const def = INSTRUMENTS[series.instrument];
  const returns: InstrumentReturnSeries["returns"] = [];
  for (let i = 0; i < series.points.length - 1; i++) {
    const rawReturn = monthlyReturn(series.points[i], series.points[i + 1]);
    returns.push({
      monthEnd: series.points[i + 1].monthEnd,
      signalMonthEnd: series.points[i].monthEnd,
      value: rawReturn * def.signConvention,
      trailingAnnualizedVol: series.points[i].trailingAnnualizedVol,
    });
  }
  return { instrument: series.instrument, returns };
}
