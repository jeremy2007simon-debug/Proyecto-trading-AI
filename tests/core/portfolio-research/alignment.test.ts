import { describe, expect, it } from "vitest";
import { alignReturnsByMonth } from "@/core/portfolio-research/alignment";
import type { InstrumentReturnSeries } from "@/core/portfolio-research/leg-returns";
import type { FxInstrument } from "@/core/portfolio-research/types";

function series(instrument: FxInstrument, months: string[]): InstrumentReturnSeries {
  return {
    instrument,
    returns: months.map((m, i) => ({ monthEnd: `${m}-28`, signalMonthEnd: `${m}-01`, value: i, trailingAnnualizedVol: 0.1 })),
  };
}

describe("alignReturnsByMonth", () => {
  it("inner-joins on the calendar month of signalMonthEnd — only months present in EVERY series survive", () => {
    const a = series("EURUSD", ["2020-01", "2020-02", "2020-03"]);
    const b = series("GBPUSD", ["2020-02", "2020-03", "2020-04"]);
    const aligned = alignReturnsByMonth([a, b]);
    expect(aligned.monthKeys).toEqual(["2020-02", "2020-03"]);
    expect(aligned.byInstrument.EURUSD).toHaveLength(2);
    expect(aligned.byInstrument.GBPUSD).toHaveLength(2);
  });

  it("keeps ascending chronological order", () => {
    const a = series("EURUSD", ["2020-03", "2020-01", "2020-02"]); // deliberately out of order in the source
    const b = series("GBPUSD", ["2020-01", "2020-02", "2020-03"]);
    const aligned = alignReturnsByMonth([a, b]);
    expect(aligned.monthKeys).toEqual(["2020-01", "2020-02", "2020-03"]);
  });

  it("every instrument's entries line up index-for-index with monthKeys", () => {
    const a = series("EURUSD", ["2020-01", "2020-02"]);
    const b = series("GBPUSD", ["2020-01", "2020-02"]);
    const aligned = alignReturnsByMonth([a, b]);
    aligned.monthKeys.forEach((mk, i) => {
      expect(aligned.byInstrument.EURUSD![i].signalMonthEnd.slice(0, 7)).toBe(mk);
      expect(aligned.byInstrument.GBPUSD![i].signalMonthEnd.slice(0, 7)).toBe(mk);
    });
  });

  it("returns empty when given no series", () => {
    expect(alignReturnsByMonth([])).toEqual({ monthKeys: [], byInstrument: {} });
  });
});
