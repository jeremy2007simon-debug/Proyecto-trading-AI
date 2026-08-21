import { alignReturnsByMonth, type AlignedReturns } from "@/core/portfolio-research/alignment";
import { loadDailyBars } from "@/core/portfolio-research/data-loaders";
import { FULL_INSTRUMENTS, MAJOR_INSTRUMENTS } from "@/core/portfolio-research/instruments";
import { buildInstrumentReturnSeries } from "@/core/portfolio-research/leg-returns";
import { resampleToMonthly } from "@/core/portfolio-research/monthly";
import { loadAllCpiSeries, buildValueSignalsByMonthKey } from "@/core/portfolio-research/value-ppp";
import type { FxInstrument, MonthlySeries } from "@/core/portfolio-research/types";

/**
 * One-time-per-process build of every shared input every family's
 * signal construction reads from — computed ONCE (not once per
 * experiment) so the ~24 experiments in the funnel don't each
 * re-resample the same 11 instruments' daily bars.
 */
export interface SharedResearchContext {
  monthlyByInstrument: Record<FxInstrument, MonthlySeries>;
  alignedMajors: AlignedReturns;
  alignedFull: AlignedReturns;
  valueZByInstrumentMonthKey: ReturnType<typeof buildValueSignalsByMonthKey>;
}

export function buildSharedResearchContext(): SharedResearchContext {
  const monthlyByInstrument = {} as Record<FxInstrument, MonthlySeries>;
  for (const inst of FULL_INSTRUMENTS) {
    monthlyByInstrument[inst] = resampleToMonthly(inst, loadDailyBars(inst));
  }

  const majorReturnSeries = MAJOR_INSTRUMENTS.map((inst) => buildInstrumentReturnSeries(monthlyByInstrument[inst]));
  const fullReturnSeries = FULL_INSTRUMENTS.map((inst) => buildInstrumentReturnSeries(monthlyByInstrument[inst]));

  // Rate series (`carry.ts`) are loaded fresh, cheaply, inside each
  // family's own signal function via `loadAllRateSeries()` — its causal
  // lookup needs the raw series, not a pre-aligned view of it, so
  // there's nothing to precompute here beyond CPI/value below.
  const cpi = loadAllCpiSeries();

  return {
    monthlyByInstrument,
    alignedMajors: alignReturnsByMonth(majorReturnSeries),
    alignedFull: alignReturnsByMonth(fullReturnSeries),
    valueZByInstrumentMonthKey: buildValueSignalsByMonthKey(monthlyByInstrument, cpi),
  };
}
